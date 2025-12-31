/**
 * iOS Lifecycle Wiring Stub (Phase 7 MOB-PR-001 → MOB-PR-004)
 *
 * Tier 0: SessionContext + LifecycleWatcher (MOB-PR-001)
 * Tier 2: EnforceWrapper (MOB-PR-003)
 * Tier 3: Kill/Deep-Link/Notification Handlers (MOB-PR-004)
 *
 * Connects UIKit lifecycle events to handlers.
 * No logic here—only dispatch.
 */

import UIKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var lifecycleWatcher: MobileLifecycleWatcher?
  var lifecycleAdapter: MobileLifecycleAdapter?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Ghost Checkpoint: Initialize adapter with injected SessionContext
    // Single instance: SessionContext → all layers use same instance
    let sessionCtx = MobileSessionContext()
    let watcher = MobileLifecycleWatcher(sessionCtx)
    let wrapper = MobileEnforceWrapper(sessionCtx, watcher)
    let killHandler = MobileAppKillHandler(sessionCtx, wrapper)
    let deepLinkHandler = MobileDeepLinkHandler(sessionCtx, wrapper)
    let notificationHandler = MobileNotificationHandler(sessionCtx, wrapper)

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

    return true
  }

  // Blocks: MOB-T01, MOB-T07, MOB-T09
  func applicationDidBecomeActive(_ application: UIApplication) {
    lifecycleWatcher?.onForeground()
  }

  // Blocks: MOB-T01, MOB-T05, MOB-T06, MOB-T09
  func applicationWillResignActive(_ application: UIApplication) {
    lifecycleWatcher?.onBlur()
  }

  // Blocks: MOB-T01, MOB-T08, MOB-T09
  func applicationDidEnterBackground(_ application: UIApplication) {
    lifecycleWatcher?.onBackground()
  }

  // Blocks: MOB-T04, MOB-T10, MOB-T12
  // Route app kill through Tier 3 adapter
  func applicationWillTerminate(_ application: UIApplication) {
    lifecycleAdapter?.onKill()
  }

  // Blocks: MOB-T03, MOB-T02, MOB-T12
  // Route deep-link entry through Tier 3 adapter
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    lifecycleAdapter?.onDeepLinkEntry()

    // NOTE: App logic (outside this handler) must explicitly handle:
    // - Parse the deep-link URL
    // - Bind a NEW sessionId (not the old one)
    // - No implicit authority restoration

    return true
  }

  // Blocks: MOB-T02, MOB-T09, MOB-T12
  // Route notification tap through Tier 3 adapter
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    lifecycleAdapter?.onNotificationTap()

    // NOTE: App logic (outside this handler) must explicitly handle:
    // - Parse the notification action
    // - Bind a NEW sessionId (not the old one)
    // - No implicit authority restoration

    completionHandler()
  }

  // Blocks: MOB-T07
  // Register observer in applicationDidFinishLaunching or SceneDelegate
  func setupScreenLockDetection() {
    NotificationCenter.default.addObserver(
      forName: UIApplication.protectedDataWillBecomeUnavailableNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.lifecycleWatcher?.onScreenLock()
    }
  }
}
