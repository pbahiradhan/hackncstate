import SwiftUI
import Photos
import UserNotifications

@main
struct VerifyShotApp: App {
    @StateObject private var appState = AppState()
    @StateObject private var screenshotDetector = ScreenshotDetector()
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environmentObject(appState)
                .environmentObject(screenshotDetector)
                .onAppear {
                    print("🚀 [VerifyShotApp] App appeared, setting up...")
                    
                    // Request photo library access
                    PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                        print("📷 [VerifyShotApp] Photo library permission: \(status.rawValue)")
                    }

                    // Request notification permission
                    ScreenshotDetector.requestNotificationPermission()
                    ScreenshotDetector.registerNotificationCategories()

                    // Pass appState to AppDelegate for notification handling
                    appDelegate.appState = appState

                    // Start listening for screenshots (only once, not in init)
                    screenshotDetector.startListening()
                }
                .onChange(of: screenshotDetector.pendingAnalysisFromNotification) { pending in
                    if pending, let img = screenshotDetector.latestScreenshot {
                        print("📸 [VerifyShotApp] Auto-analyzing screenshot from notification tap")
                        screenshotDetector.pendingAnalysisFromNotification = false
                        screenshotDetector.latestScreenshot = nil
                        appState.analyzeScreenshot(img)
                    }
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
        print("🚀 [AppDelegate] App launched")
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // MARK: - Show notification even when app is in foreground

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        print("📲 [AppDelegate] Notification received in foreground")
        // Show banner + sound even when app is in foreground
        completionHandler([.banner, .sound])
    }

    // MARK: - Handle notification tap → auto-analyze

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        print("👆 [AppDelegate] Notification tapped")
        let actionIdentifier = response.actionIdentifier
        let categoryIdentifier = response.notification.request.content.categoryIdentifier

        if categoryIdentifier == "SCREENSHOT_DETECTED" {
            if actionIdentifier == UNNotificationDefaultActionIdentifier ||
               actionIdentifier == "ANALYZE_ACTION" {
                print("✅ [AppDelegate] Analyzing screenshot from notification tap")
                Task { @MainActor in
                    await appState?.analyzeLatestScreenshot()
                }
            }
        }

        completionHandler()
    }
}
