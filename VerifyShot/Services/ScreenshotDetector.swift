import Foundation
import Photos
import UIKit

// MARK: - Detects screenshots and fetches the latest one

@MainActor
final class ScreenshotDetector: ObservableObject {
    @Published var latestScreenshot: UIImage?

    private var observer: NSObjectProtocol?

    init() {
        startListening()
    }

    deinit {
        if let obs = observer {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    // MARK: - Listen for screenshot notification

    func startListening() {
        observer = NotificationCenter.default.addObserver(
            forName: UIApplication.userDidTakeScreenshotNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // Small delay to let the screenshot save to the library
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                Task { await self?.fetchLatestScreenshot() }
            }
        }
    }

    // MARK: - Fetch most recent screenshot from photo library

    func fetchLatestScreenshot() async {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            print("Photo library access not authorized")
            return
        }

        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 1
        // Filter screenshots
        opts.predicate = NSPredicate(
            format: "mediaSubtype == %d",
            PHAssetMediaSubtype.photoScreenshot.rawValue
        )

        let result = PHAsset.fetchAssets(with: .image, options: opts)
        guard let asset = result.firstObject else { return }

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
