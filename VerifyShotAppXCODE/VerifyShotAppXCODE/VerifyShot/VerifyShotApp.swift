import SwiftUI
import Photos
import UserNotifications

@main
struct VerifyShotApp: App {
    @StateObject private var appState = AppState()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environmentObject(appState)
                .onAppear {
                    // Request photo library access
                    PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in }

                    // Request notification permission
                    ScreenshotDetector.requestNotificationPermission()
                    ScreenshotDetector.registerNotificationCategories()

                    // Pass appState to AppDelegate for notification handling
                    appDelegate.appState = appState
                }
        }
    }
}

// MARK: - App Delegate for notification handling

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    var appState: AppState?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - Show notification even when app is in foreground

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // Show banner + sound even when app is in foreground
        completionHandler([.banner, .sound])
    }

    // MARK: - Handle notification tap

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let actionIdentifier = response.actionIdentifier
        let categoryIdentifier = response.notification.request.content.categoryIdentifier

        if categoryIdentifier == "SCREENSHOT_DETECTED" {
            // User tapped the notification or "Analyze Now" action
            if actionIdentifier == UNNotificationDefaultActionIdentifier ||
               actionIdentifier == "ANALYZE_ACTION" {
                Task { @MainActor in
                    await appState?.analyzeLatestScreenshot()
                }
            }
        }

        completionHandler()
    }
}
