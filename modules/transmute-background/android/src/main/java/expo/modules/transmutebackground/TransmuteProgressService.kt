package expo.modules.transmutebackground

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * The ongoing notification that keeps a conversion process alive.
 *
 * Android freezes or kills a backgrounded app; a foreground service is the only
 * supported way to say "this work is still happening". The service owns nothing
 * but the notification: FFmpeg runs in this process, the queue lives in
 * JavaScript, and this class is told what to display and when to stop.
 *
 * The notification's Cancel action does not stop anything itself. It broadcasts
 * an intent that the module forwards to JavaScript, so cancel stays one decision
 * made in one place instead of two cancel paths that can disagree (TR-11).
 */
class TransmuteProgressService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    ensureChannel(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> {
        sendBroadcast(Intent(ACTION_CANCEL_EVENT).setPackage(packageName))
        return START_NOT_STICKY
      }

      ACTION_STOP -> {
        stopForegroundCompat()
        stopSelf()
        return START_NOT_STICKY
      }
    }

    val title = intent?.getStringExtra(EXTRA_TITLE) ?: DEFAULT_TITLE
    val text = intent?.getStringExtra(EXTRA_TEXT) ?: ""
    val percent = intent?.getIntExtra(EXTRA_PERCENT, NO_PROGRESS) ?: NO_PROGRESS

    startForegroundCompat(buildNotification(this, title, text, percent))
    return START_NOT_STICKY
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun stopForegroundCompat() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  companion object {
    const val ACTION_CANCEL = "expo.modules.transmutebackground.CANCEL"
    const val ACTION_STOP = "expo.modules.transmutebackground.STOP"
    const val ACTION_CANCEL_EVENT = "expo.modules.transmutebackground.CANCEL_EVENT"

    const val EXTRA_TITLE = "title"
    const val EXTRA_TEXT = "text"
    const val EXTRA_PERCENT = "percent"

    /** `-1` means "duration unknown": the bar moves, no number is claimed. */
    const val NO_PROGRESS = -1

    private const val CHANNEL_ID = "transmute_progress"
    private const val NOTIFICATION_ID = 4711
    private const val REQUEST_OPEN = 1
    private const val REQUEST_CANCEL = 2
    private const val DEFAULT_TITLE = "Converting"

    /** One low-importance channel: progress must never buzz or pop over other apps. */
    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        return
      }
      val manager = context.getSystemService(NotificationManager::class.java) ?: return
      if (manager.getNotificationChannel(CHANNEL_ID) != null) {
        return
      }
      val channel =
        NotificationChannel(CHANNEL_ID, "Conversions", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Progress of a conversion that is still running."
          setShowBadge(false)
          enableVibration(false)
          setSound(null, null)
        }
      manager.createNotificationChannel(channel)
    }

    private fun buildNotification(
      context: Context,
      title: String,
      text: String,
      percent: Int,
    ): Notification {
      val openApp =
        PendingIntent.getActivity(
          context,
          REQUEST_OPEN,
          context.packageManager.getLaunchIntentForPackage(context.packageName)
            ?: Intent(Intent.ACTION_MAIN),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      val cancel =
        PendingIntent.getService(
          context,
          REQUEST_CANCEL,
          Intent(context, TransmuteProgressService::class.java).setAction(ACTION_CANCEL),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

      val builder =
        NotificationCompat.Builder(context, CHANNEL_ID)
          .setContentTitle(title)
          .setContentText(text)
          .setSmallIcon(R.drawable.transmute_notification_icon)
          .setContentIntent(openApp)
          // Ongoing and silent: the user started this job and is watching it end.
          .setOngoing(true)
          .setOnlyAlertOnce(true)
          .setSilent(true)
          .setShowWhen(false)
          .setPriority(NotificationCompat.PRIORITY_LOW)
          .addAction(
            NotificationCompat.Action.Builder(
              /* icon = */ 0,
              context.getString(android.R.string.cancel),
              cancel,
            ).build(),
          )

      if (percent >= 0) {
        builder.setProgress(100, percent.coerceIn(0, 100), false)
      } else {
        builder.setProgress(100, 0, true)
      }

      return builder.build()
    }

    /** Starts or refreshes the service; returns false when Android refuses. */
    fun start(context: Context, title: String, text: String, percent: Int): Boolean {
      return try {
        ensureChannel(context)
        val intent =
          Intent(context, TransmuteProgressService::class.java).apply {
            putExtra(EXTRA_TITLE, title)
            putExtra(EXTRA_TEXT, text)
            putExtra(EXTRA_PERCENT, percent)
          }
        // The same call for start and for update: a background update must not be
        // the moment Android decides this is a background service start.
        ContextCompat.startForegroundService(context, intent)
        true
      } catch (error: Exception) {
        // A refused notification must never fail the conversion (TR-30).
        false
      }
    }

    fun stop(context: Context) {
      try {
        context.stopService(Intent(context, TransmuteProgressService::class.java))
      } catch (error: Exception) {
        // Nothing to report: the service is gone or was never allowed to start.
      }
    }
  }
}
