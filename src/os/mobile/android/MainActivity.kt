/**
 * Android Lifecycle Wiring Stub (Phase 7 MOB-PR-001 → MOB-PR-004)
 *
 * Tier 0: SessionContext + LifecycleWatcher (MOB-PR-001)
 * Tier 2: EnforceWrapper (MOB-PR-003)
 * Tier 3: Kill/Deep-Link/Notification Handlers (MOB-PR-004)
 *
 * Connects Android Activity lifecycle events to handlers.
 * No logic here—only dispatch.
 */

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle

class MainActivity : Activity() {
  private var lifecycleWatcher: MobileLifecycleWatcher? = null
  private var lifecycleAdapter: MobileLifecycleAdapter? = null
  private var screenLockReceiver: BroadcastReceiver? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    // Ghost Checkpoint: Initialize adapter with injected SessionContext
    // Single instance: SessionContext → all layers use same instance
    val sessionCtx = MobileSessionContext()
    val watcher = MobileLifecycleWatcher(sessionCtx)
    val wrapper = MobileEnforceWrapper(sessionCtx, watcher)
    val killHandler = MobileAppKillHandler(sessionCtx, wrapper)
    val deepLinkHandler = MobileDeepLinkHandler(sessionCtx, wrapper)
    val notificationHandler = MobileNotificationHandler(sessionCtx, wrapper)

    // Keep watcher reference for Tier 0/1 lifecycle events (foreground, blur, background, screen lock)
    lifecycleWatcher = watcher

    // Tier 3 entry-point routing (kill, deep-link, notification)
    lifecycleAdapter = MobileLifecycleAdapter(
      sessionCtx,
      watcher,
      wrapper,
      killHandler,
      deepLinkHandler,
      notificationHandler
    )

    setupScreenLockDetection()
    handleDeepLink(intent)
    handleNotification(intent)
  }

  // Blocks: MOB-T01, MOB-T07, MOB-T09
  override fun onResume() {
    super.onResume()
    lifecycleWatcher?.onForeground()
  }

  // Blocks: MOB-T01, MOB-T05, MOB-T06, MOB-T09
  override fun onPause() {
    super.onPause()
    lifecycleWatcher?.onBlur()
  }

  // Blocks: MOB-T01, MOB-T08, MOB-T09
  override fun onStop() {
    super.onStop()
    lifecycleWatcher?.onBackground()
  }

  // Blocks: MOB-T04, MOB-T10, MOB-T12
  // Route app kill through Tier 3 adapter
  override fun onDestroy() {
    super.onDestroy()
    lifecycleAdapter?.onKill()
    unregisterScreenLockReceiver()
  }

  // Blocks: MOB-T03, MOB-T02, MOB-T12
  // Route deep-link entry through Tier 3 adapter
  private fun handleDeepLink(intent: Intent) {
    val data = intent.data
    val action = intent.action

    // Check for deep-link intent (implicit or explicit)
    if (action == Intent.ACTION_VIEW && data != null) {
      // Tier 3: Deep-link entry (visual foreground only)
      lifecycleAdapter?.onDeepLinkEntry()

      // NOTE: App logic (outside this handler) must explicitly handle:
      // - Parse the deep-link URI
      // - Bind a NEW sessionId (not the old one)
      // - No implicit authority restoration
    }
  }

  // Blocks: MOB-T02, MOB-T09, MOB-T12
  // Route notification tap through Tier 3 adapter
  private fun handleNotification(intent: Intent) {
    val notificationId = intent.getIntExtra("notification_id", -1)
    val action = intent.getStringExtra("action")

    // Check for notification intent (from notification manager)
    if (notificationId != -1) {
      // Tier 3: Notification entry (visual foreground only)
      lifecycleAdapter?.onNotificationTap()

      // NOTE: App logic (outside this handler) must explicitly handle:
      // - Parse the notification action and payload
      // - Bind a NEW sessionId (not the old one)
      // - No implicit authority restoration
    }
  }

  // Blocks: MOB-T07
  private fun setupScreenLockDetection() {
    screenLockReceiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_SCREEN_OFF) {
          lifecycleWatcher?.onScreenLock()
        }
      }
    }

    val intentFilter = IntentFilter(Intent.ACTION_SCREEN_OFF)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      registerReceiver(screenLockReceiver, intentFilter, Context.RECEIVER_EXPORTED)
    } else {
      registerReceiver(screenLockReceiver, intentFilter)
    }
  }

  private fun unregisterScreenLockReceiver() {
    if (screenLockReceiver != null) {
      unregisterReceiver(screenLockReceiver)
    }
  }
}
