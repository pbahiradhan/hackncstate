import Foundation
import Photos
import UIKit
import UserNotifications

// MARK: - Detects screenshots, sends push notification, auto-analyzes

@MainActor
final class ScreenshotDetector: ObservableObject {
    @Published var latestScreenshot: UIImage?
    @Published var pendingAnalysisFromNotification = false

    private var observer: NSObjectProtocol?
    private var foregroundObserver: NSObjectProtocol?

    init() {
        startListening()
    }

    deinit {
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
        }
        if let obs = foregroundObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    // MARK: - Request notification permissions

    static func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                print("Notification permission error: \(error)")
            }
            print("Notification permission granted: \(granted)")
        }
    }

    // MARK: - Listen for screenshot notification

    func startListening() {
        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // Small delay to let the screenshot save to the photo library
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                Task { await self?.handleScreenshotDetected() }
            }
        }
    }

    // MARK: - Handle screenshot detection

    private func handleScreenshotDetected() async {
        // Send local push notification
        sendScreenshotNotification()

        // Also fetch the screenshot immediately
        await fetchLatestScreenshot()
    }

    // MARK: - Send local push notification

    private func sendScreenshotNotification() {
        let content = UNMutableNotificationContent()
        content.title = "📸 Screenshot Detected"
        content.body = "Tap to verify this screenshot with VerifyShot AI"
        content.sound = .default
        content.categoryIdentifier = "SCREENSHOT_DETECTED"
        content.userInfo = ["action": "analyze_screenshot"]

        // Show immediately
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.5, repeats: false)
        let request = UNNotificationRequest(
            identifier: "screenshot-\(UUID().uuidString)",
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("Failed to send notification: \(error)")
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
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            print("Photo library access not authorized. Status: \(status.rawValue)")
            // Try requesting access
            let newStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard newStatus == .authorized || newStatus == .limited else {
                print("Photo library access denied")
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
            print("No screenshot found in photo library")
            return
        }

        let image = await loadImage(from: asset)
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
    }
}
