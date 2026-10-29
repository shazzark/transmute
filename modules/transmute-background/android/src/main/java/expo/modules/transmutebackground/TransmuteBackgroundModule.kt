package expo.modules.transmutebackground

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The JavaScript face of the foreground service.
 *
 * Three plain calls and one event: show the notification, refresh it, take it
 * down, and hear the notification's Cancel action. Nothing here knows what a
 * conversion is, so the queue stays the only place that decides what runs next.
 *
 * The notification is a courtesy. If the permission is refused or Android
 * declines the service, `show` reports false and the conversion carries on in the
 * foreground exactly as it would have (TR-29, TR-30).
 */
class TransmuteBackgroundModule : Module() {
  private var pendingPermission: Promise? = null
  private var cancelReceiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("TransmuteBackground")

    Events("onCancel", "onTimeout")

    OnCreate {
      appContext.reactContext?.let { TransmuteProgressService.ensureChannel(it) }
      registerCancelReceiver()
    }
    OnDestroy { unregisterCancelReceiver() }

    Function("notificationsEnabled") { granted() }

    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || granted()) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      pendingPermission = promise
      ActivityCompat.requestPermissions(
        activity,
        arrayOf(Manifest.permission.POST_NOTIFICATIONS),
        REQUEST_NOTIFICATIONS,
      )
    }

    AsyncFunction("show") { options: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val title = options["title"] as? String ?: "Converting"
      val text = options["text"] as? String ?: ""
      val percent = (options["percent"] as? Number)?.toInt() ?: TransmuteProgressService.NO_PROGRESS
      TransmuteProgressService.start(context, title, text, percent)
    }

    AsyncFunction("hide") {
      val context = appContext.reactContext
      if (context != null) {
        TransmuteProgressService.stop(context)
      }
      // Explicit `null` rather than a bare `Unit`: the bridge expects `Any?`.
      null
    }

    OnActivityResult { _, payload ->
      if (payload.requestCode != REQUEST_NOTIFICATIONS) {
        return@OnActivityResult
      }
      pendingPermission?.resolve(granted())
      pendingPermission = null
    }
  }

  /** Android 13 introduced the notification permission; older versions always allow. */
  private fun granted(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
      return true
    }
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED
  }

  /**
   * A receiver rather than a static callback: the service outlives the module's
   * attention, and a broadcast is the only signal that survives a JS reload.
   */
  private fun registerCancelReceiver() {
    val context = appContext.reactContext ?: return
    if (cancelReceiver != null) {
      return
    }
    val receiver =
      object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
          if (intent?.action == TransmuteProgressService.ACTION_CANCEL_EVENT) {
            sendEvent("onCancel", emptyMap<String, Any?>())
          } else if (intent?.action == TransmuteProgressService.ACTION_TIMEOUT_EVENT) {
            sendEvent("onTimeout", emptyMap<String, Any?>())
          }
        }
      }
    cancelReceiver = receiver
    ContextCompat.registerReceiver(
      context,
      receiver,
      IntentFilter(TransmuteProgressService.ACTION_CANCEL_EVENT),
      ContextCompat.RECEIVER_NOT_EXPORTED,
    )
  }

  private fun unregisterCancelReceiver() {
    val receiver = cancelReceiver ?: return
    try {
      appContext.reactContext?.unregisterReceiver(receiver)
    } catch (error: IllegalArgumentException) {
      // Already unregistered by the runtime tearing the context down.
    }
    cancelReceiver = null
  }

  private companion object {
    const val REQUEST_NOTIFICATIONS = 4712
  }
}
