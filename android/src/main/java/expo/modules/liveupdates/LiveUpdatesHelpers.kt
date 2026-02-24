package expo.modules.liveupdates

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

private const val CHANNEL_ID_KEY = "expo.modules.liveupdates.channelId"
private const val CHANNEL_NAME_KEY = "expo.modules.liveupdates.channelName"
private const val NOTIFICATION_ICON_KEY = "expo.modules.liveupdates.icon"
private const val PROGRESS_ICON_KEY = "expo.modules.liveupdates.progressIcon"
private const val PROGRESS_START_ICON_KEY = "expo.modules.liveupdates.progressStartIcon"
private const val PROGRESS_END_ICON_KEY = "expo.modules.liveupdates.progressEndIcon"
private const val NOTIFICATION_COLOR_KEY = "expo.modules.liveupdates.iconColor"
private const val EXPO_MODULE_SCHEME_KEY = "expo.modules.scheme"
private const val TAG = "ManifestHelpers"

private fun getMetadataFromManifest(context: Context, key: String): String? {
  val packageManager = context.packageManager
  val packageInfo =
    packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
  return packageInfo.metaData?.getString(key)
}

private fun getMetadataIntFromManifest(context: Context, key: String): Int? {
  val packageManager = context.packageManager
  val packageInfo =
    packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
  val value = packageInfo.metaData?.getInt(key)
  if(value == 0){
    return null
  }
  return value
}

private fun getRequiredMetadataFromManifest(context: Context, key: String): String {
  return getMetadataFromManifest(context, key)
    ?: run {
      Log.w(TAG, "Failed to read $key from manifest.")
      throw RuntimeException(
        "ExpoLiveUpdatesModule: $key is required. Please configure withChannelConfig plugin with ${key.split(".").last()} in app.config.ts"
      )
    }
}

fun getChannelId(context: Context): String {
  return getRequiredMetadataFromManifest(context, CHANNEL_ID_KEY)
}

fun getChannelName(context: Context): String {
  return getRequiredMetadataFromManifest(context, CHANNEL_NAME_KEY)
}

fun getNotificationIcon(context: Context): Int? {
  return getMetadataIntFromManifest(context, NOTIFICATION_ICON_KEY)
}

fun getNotificationProgressIcon(context: Context): Int? {
  return getMetadataIntFromManifest(context, PROGRESS_ICON_KEY)
}

fun getNotificationProgressStartIcon(context: Context): Int? {
  return getMetadataIntFromManifest(context, PROGRESS_START_ICON_KEY)
}

fun getNotificationProgressEndIcon(context: Context): Int? {
  return getMetadataIntFromManifest(context, PROGRESS_END_ICON_KEY)
}

fun getNotificationIconColor(context: Context): Number? {
  val packageManager = context.packageManager
  val packageInfo =
    packageManager.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
  packageInfo.metaData?.getInt(NOTIFICATION_COLOR_KEY)?.let {
    return context.resources.getColor(
      it,
      null
    )
  }
  return null
}

fun getScheme(context: Context): String? {
  return getMetadataFromManifest(context, EXPO_MODULE_SCHEME_KEY)
}

fun Context.checkPostNotificationPermission() =
  Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
    ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
