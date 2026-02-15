import Foundation
import Photos
import UIKit
import UserNotifications

// MARK: - Detects screenshots, sends push notification, auto-analyzes

@MainActor
final class ScreenshotDetector: ObservableObject {
    @Published var latestScreenshot: UIImage?
    @Published var pendingAnalysisFromNotification = false

    nonisolated(unsafe) private var observer: NSObjectProtocol?
    private var isListening = false

    // MARK: - Request notification permissions

    static func requestNotificationPermission() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            print("🔔 [ScreenshotDetector] Current notification permission: \(settings.authorizationStatus.rawValue)")
            if settings.authorizationStatus == .notDetermined {
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                    if let error = error {
                        print("❌ [ScreenshotDetector] Notification permission error: \(error)")
                    } else {
                        print("✅ [ScreenshotDetector] Notification permission granted: \(granted)")
                    }
                }
            }
        }
    }

    // MARK: - Listen for screenshot notification

    func startListening() {
        // Prevent duplicate observers
        guard !isListening else {
            print("⚠️ [ScreenshotDetector] Already listening, skipping duplicate setup")
            return
        }
        
        // Remove any existing observer first
        if let existingObserver = observer {
            NotificationCenter.default.removeObserver(existingObserver)
            observer = nil
        }
        
        print("📸 [ScreenshotDetector] Setting up screenshot observer...")
        
        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            print("📸 [ScreenshotDetector] ✅ SCREENSHOT DETECTED! Notification received.")
            // Small delay to let the screenshot save to the photo library
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                Task { @MainActor in
                    await self?.handleScreenshotDetected()
                }
            }
        }
        
        isListening = true
        print("✅ [ScreenshotDetector] Observer registered and listening")
    }
    
    func stopListening() {
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
            observer = nil
            isListening = false
            print("📸 [ScreenshotDetector] Stopped listening")
        }
    }

    // MARK: - Handle screenshot detection

    private func handleScreenshotDetected() async {
        print("📸 [ScreenshotDetector] Handling screenshot...")
        
        // Check notification permission before sending
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else {
            print("⚠️ [ScreenshotDetector] Notification permission not granted, skipping notification")
            // Still try to fetch and show in-app banner
            await fetchLatestScreenshot()
            return
        }
        
        // Send local push notification
        sendScreenshotNotification()

        // Also fetch the screenshot immediately for in-app banner
        await fetchLatestScreenshot()
    }

    // MARK: - Send local push notification

    private func sendScreenshotNotification() {
        print("📸 [ScreenshotDetector] Sending push notification...")
        
        let content = UNMutableNotificationContent()
        content.title = "📸 Screenshot Detected"
        content.body = "Tap to verify this screenshot with VerifyShot AI"
        content.sound = .default
        content.categoryIdentifier = "SCREENSHOT_DETECTED"
        content.userInfo = ["action": "analyze_screenshot"]

        // Show immediately
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.3, repeats: false)
        let request = UNNotificationRequest(
            identifier: "screenshot-\(UUID().uuidString)",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("❌ [ScreenshotDetector] Failed to send notification: \(error)")
            } else {
                print("✅ [ScreenshotDetector] Notification sent successfully")
            }
        }
    }

    // MARK: - Handle notification tap (called from AppDelegate/SceneDelegate)

    func handleNotificationTap() {
        pendingAnalysisFromNotification = true
        Task { await fetchLatestScreenshot() }
    }

    // MARK: - Fetch most recent screenshot from photo library

    func fetchLatestScreenshot() async {
        print("📸 [ScreenshotDetector] Fetching latest screenshot from photo library...")
        
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            print("⚠️ [ScreenshotDetector] Photo library access not authorized. Status: \(status.rawValue)")
            // Try requesting access
            let newStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard newStatus == .authorized || newStatus == .limited else {
                print("❌ [ScreenshotDetector] Photo library access denied")
                return
            }
            // Re-fetch after getting access
            await fetchLatestScreenshotInternal()
            return
        }

        await fetchLatestScreenshotInternal()
    }

    private func fetchLatestScreenshotInternal() async {
        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 1
        // Filter for screenshots
        opts.predicate = NSPredicate(
            format: "mediaSubtype == %d",
            PHAssetMediaSubtype.photoScreenshot.rawValue
        )

        let result = PHAsset.fetchAssets(with: .image, options: opts)
        guard let asset = result.firstObject else {
            print("⚠️ [ScreenshotDetector] No screenshot found in photo library")
            return
        }

        print("✅ [ScreenshotDetector] Found screenshot asset, loading image...")
        let image = await loadImage(from: asset)
        if image != nil {
            print("✅ [ScreenshotDetector] Screenshot image loaded successfully")
        } else {
            print("❌ [ScreenshotDetector] Failed to load screenshot image")
        }
        self.latestScreenshot = image
    }

    private func loadImage(from asset: PHAsset) async -> UIImage? {
        await withCheckedContinuation { continuation in
            let options = PHImageRequestOptions()
            options.deliveryMode = .highQualityFormat
            options.isSynchronous = false
            options.isNetworkAccessAllowed = true

            let targetSize = CGSize(width: 1080, height: 1920)

            PHImageManager.default().requestImage(
                for: asset,
                targetSize: targetSize,
                contentMode: .aspectFit,
                options: options
            ) { image, _ in
                continuation.resume(returning: image)
            }
        }
    }
    
    deinit {
        // Remove observer directly from deinit (nonisolated context)
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
        }
    }
}

// MARK: - Notification Categories & Actions

extension ScreenshotDetector {
    static func registerNotificationCategories() {
        let analyzeAction = UNNotificationAction(
            identifier: "ANALYZE_ACTION",
            title: "Analyze Now",
            options: [.foreground]
        )

        let dismissAction = UNNotificationAction(
            identifier: "DISMISS_ACTION",
            title: "Dismiss",
            options: [.destructive]
        )

        let category = UNNotificationCategory(
            identifier: "SCREENSHOT_DETECTED",
            actions: [analyzeAction, dismissAction],
            intentIdentifiers: [],
            options: []
        )

        UNUserNotificationCenter.current().setNotificationCategories([category])
        print("✅ [ScreenshotDetector] Notification categories registered")
    }
}
