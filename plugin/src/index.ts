import { generateImageAsync } from '@expo/image-utils'
import type { ExpoConfig } from 'expo/config'
import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidColors,
  withAndroidManifest,
  withDangerousMod,
} from 'expo/config-plugins'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs'
import { resolve } from 'path'

export interface LiveUpdatesPluginProps {
  channelId: string
  channelName: string
  icon?: string | null
  iconColor?: string | null
  progressIcon?: string | null
  progressStartIcon?: string | null
  progressEndIcon?: string | null
}

type DPIString = 'mdpi' | 'hdpi' | 'xhdpi' | 'xxhdpi' | 'xxxhdpi'
type dpiMap = Record<DPIString, { folderName: string; scale: number }>

export const ANDROID_RES_PATH = 'android/app/src/main/res/'
export const dpiValues: dpiMap = {
  mdpi: { folderName: 'mipmap-mdpi', scale: 1 },
  hdpi: { folderName: 'mipmap-hdpi', scale: 1.5 },
  xhdpi: { folderName: 'mipmap-xhdpi', scale: 2 },
  xxhdpi: { folderName: 'mipmap-xxhdpi', scale: 3 },
  xxxhdpi: { folderName: 'mipmap-xxxhdpi', scale: 4 },
}
const BASELINE_PIXEL_SIZE = 24
const ERROR_MSG_PREFIX =
  'An error occurred while configuring Android notifications. '

const EXPO_MODULE_SCHEME_KEY = 'expo.modules.scheme'
const CHANNEL_ID_KEY = 'expo.modules.liveupdates.channelId'
const CHANNEL_NAME_KEY = 'expo.modules.liveupdates.channelName'
const META_DATA_NOTIFICATION_ICON = 'expo.modules.liveupdates.icon'
const META_DATA_NOTIFICATION_ICON_COLOR = 'expo.modules.liveupdates.iconColor'
const META_DATA_NOTIFICATION_PROGRESS_ICON =
  'expo.modules.liveupdates.progressIcon'
const META_DATA_NOTIFICATION_PROGRESS_START_ICON =
  'expo.modules.liveupdates.progressStartIcon'
const META_DATA_NOTIFICATION_PROGRESS_END_ICON =
  'expo.modules.liveupdates.progressEndIcon'
const SERVICE_NAME = 'expo.modules.liveupdates.FirebaseService'
const RECEIVER_NAME = 'expo.modules.liveupdates.NotificationDismissedReceiver'
const LOG_PREFIX = 'ExpoLiveUpdatesModule:'

export const NOTIFICATION_ICON = 'notification_icon'
export const NOTIFICATION_ICON_RESOURCE = `@drawable/${NOTIFICATION_ICON}`
export const PROGRESS_ICON = 'progress_icon'
export const PROGRESS_ICON_RESOURCE = `@drawable/${PROGRESS_ICON}`
export const PROGRESS_START_ICON = 'progress_start_icon'
export const PROGRESS_START_ICON_RESOURCE = `@drawable/${PROGRESS_START_ICON}`
export const PROGRESS_END_ICON = 'progress_end_icon'
export const PROGRESS_END_ICON_RESOURCE = `@drawable/${PROGRESS_END_ICON}`
export const NOTIFICATION_ICON_COLOR = 'notification_icon_color'
export const NOTIFICATION_ICON_COLOR_RESOURCE = `@color/${NOTIFICATION_ICON_COLOR}`

let warnedMissingScheme = false

const isFirebaseConfigured = (config: ExpoConfig): boolean => {
  return !!config.android?.googleServicesFile
}

const log = (message: string) => console.log(`${LOG_PREFIX} ${message}`)

const checkConfigProperty = (property: string, propertyName: string) => {
  if (!property)
    throw new Error(
      LOG_PREFIX +
        `${propertyName} is required. Please provide ${propertyName} in plugin configuration.`,
    )
}

const ensureService = (
  config: ExpoConfig,
  androidManifest: AndroidConfig.Manifest.AndroidManifest,
) => {
  if (!isFirebaseConfigured(config)) {
    log('Firebase not configured - skipping Firebase service registration')
    return
  }

  const mainApplication =
    AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest)

  const existingServices = (mainApplication.service ??= [])

  const existingServiceIndex = existingServices.findIndex(
    (svc: any) => svc?.$?.['android:name'] === SERVICE_NAME,
  )

  const baseService = {
    '$': {
      'android:name': SERVICE_NAME,
      'android:exported': 'false',
    },
    'intent-filter': [
      {
        action: [
          {
            $: {
              'android:name': 'com.google.firebase.MESSAGING_EVENT',
            },
          },
        ],
      },
    ],
  } as any

  if (existingServiceIndex >= 0) {
    existingServices[existingServiceIndex] = baseService
  } else {
    existingServices.push(baseService)
  }
}

const ensureReceiver = (
  androidManifest: AndroidConfig.Manifest.AndroidManifest,
) => {
  const mainApplication =
    AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest)

  const existingReceivers = (mainApplication.receiver ??= [])

  const existingReceiverIndex = existingReceivers.findIndex(
    (rcv: any) => rcv?.$?.['android:name'] === RECEIVER_NAME,
  )

  const baseReceiver = {
    $: {
      'android:name': RECEIVER_NAME,
      'android:exported': 'false',
      'android:enabled': 'true',
    },
  } as any

  if (existingReceiverIndex >= 0) {
    existingReceivers[existingReceiverIndex] = baseReceiver
  } else {
    existingReceivers.push(baseReceiver)
  }
}

function setNotificationIconColor(
  color: string | null,
  colors: AndroidConfig.Resources.ResourceXML,
) {
  return AndroidConfig.Colors.assignColorValue(colors, {
    name: NOTIFICATION_ICON_COLOR,
    value: color,
  })
}

const withNotificationIconColor: ConfigPlugin<{
  color: string | null
}> = (config, { color }) => {
  // If no color provided in the config plugin props, fallback to value from app.json
  return withAndroidColors(config, config => {
    config.modResults = setNotificationIconColor(color, config.modResults)
    return config
  })
}

async function writeImageFilesAsync(
  icon: string,
  projectRoot: string,
  resName: string,
) {
  await Promise.all(
    Object.values(dpiValues).map(async ({ folderName, scale }) => {
      const drawableFolderName = folderName.replace('mipmap', 'drawable')
      const dpiFolderPath = resolve(
        projectRoot,
        ANDROID_RES_PATH,
        drawableFolderName,
      )
      if (!existsSync(dpiFolderPath)) {
        mkdirSync(dpiFolderPath, { recursive: true })
      }
      const iconSizePx = BASELINE_PIXEL_SIZE * scale

      try {
        const resizedIcon = (
          await generateImageAsync(
            { projectRoot, cacheType: 'android-notification' },
            {
              src: icon,
              width: iconSizePx,
              height: iconSizePx,
              resizeMode: 'cover',
              backgroundColor: 'transparent',
            },
          )
        ).source
        writeFileSync(resolve(dpiFolderPath, resName + '.png'), resizedIcon)
      } catch (e) {
        throw new Error(
          ERROR_MSG_PREFIX +
            'Encountered an issue resizing Android notification icon: ' +
            e,
        )
      }
    }),
  )
}

function removeNotificationIconImageFiles(
  projectRoot: string,
  resName: string,
) {
  Object.values(dpiValues).forEach(async ({ folderName }) => {
    const drawableFolderName = folderName.replace('mipmap', 'drawable')
    const dpiFolderPath = resolve(
      projectRoot,
      ANDROID_RES_PATH,
      drawableFolderName,
    )
    const iconFile = resolve(dpiFolderPath, resName + '.png')
    if (existsSync(iconFile)) {
      unlinkSync(iconFile)
    }
  })
}

async function setNotificationIconAsync(
  projectRoot: string,
  icon: string | null,
  resName: string,
) {
  if (icon) {
    await writeImageFilesAsync(icon, projectRoot, resName)
  } else {
    removeNotificationIconImageFiles(projectRoot, resName)
  }
}

const withNotificationIcons: ConfigPlugin<{
  icon: string | null
  progressIcon: string | null
  progressStartIcon: string | null
  progressEndIcon: string | null
}> = (config, { icon, progressIcon, progressStartIcon, progressEndIcon }) => {
  return withDangerousMod(config, [
    'android',
    async config => {
      await setNotificationIconAsync(
        config.modRequest.projectRoot,
        icon,
        NOTIFICATION_ICON,
      )
      await setNotificationIconAsync(
        config.modRequest.projectRoot,
        progressIcon,
        PROGRESS_ICON,
      )
      await setNotificationIconAsync(
        config.modRequest.projectRoot,
        progressStartIcon,
        PROGRESS_START_ICON,
      )
      await setNotificationIconAsync(
        config.modRequest.projectRoot,
        progressEndIcon,
        PROGRESS_END_ICON,
      )
      return config
    },
  ])
}

const withLiveUpdates: ConfigPlugin<LiveUpdatesPluginProps> = (
  config: ExpoConfig,
  props: LiveUpdatesPluginProps,
) => {
  const { channelId, channelName } = props

  checkConfigProperty(channelId, 'channelId')
  checkConfigProperty(channelName, 'channelName')

  const scheme = Array.isArray(config.scheme) ? config.scheme[0] : config.scheme

  if (props.iconColor) {
    config = withNotificationIconColor(config, {
      color: props.iconColor,
    })
  }
  config = withNotificationIcons(config, {
    icon: props.icon || null,
    progressIcon: props.progressIcon || null,
    progressStartIcon: props.progressStartIcon || null,
    progressEndIcon: props.progressEndIcon || null,
  })

  return withAndroidManifest(config, configWithManifest => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(
      configWithManifest.modResults,
    )

    // Add app scheme metadata
    if (scheme) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        EXPO_MODULE_SCHEME_KEY,
        scheme,
      )
    } else if (!warnedMissingScheme) {
      log('scheme is not configured, deeplinks will not work')
      warnedMissingScheme = true
    }

    // Add channel configuration metadata
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      CHANNEL_ID_KEY,
      channelId,
    )

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      CHANNEL_NAME_KEY,
      channelName,
    )

    if (props.icon) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        META_DATA_NOTIFICATION_ICON,
        NOTIFICATION_ICON_RESOURCE,
        'resource',
      )
    }
    if (props.iconColor) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        META_DATA_NOTIFICATION_ICON_COLOR,
        NOTIFICATION_ICON_COLOR_RESOURCE,
        'resource',
      )
    }
    if (props.progressIcon) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        META_DATA_NOTIFICATION_PROGRESS_ICON,
        PROGRESS_ICON_RESOURCE,
        'resource',
      )
    }
    if (props.progressStartIcon) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        META_DATA_NOTIFICATION_PROGRESS_START_ICON,
        PROGRESS_START_ICON_RESOURCE,
        'resource',
      )
    }
    if (props.progressEndIcon) {
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(
        mainApplication,
        META_DATA_NOTIFICATION_PROGRESS_END_ICON,
        PROGRESS_END_ICON_RESOURCE,
        'resource',
      )
    }

    // Ensure Firebase service is configured
    ensureService(config, configWithManifest.modResults)

    // Ensure notification dismissed receiver is configured
    ensureReceiver(configWithManifest.modResults)

    return configWithManifest
  })
}

export default withLiveUpdates
