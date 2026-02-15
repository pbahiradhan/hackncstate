import SwiftUI
import UIKit
import Photos

// MARK: - Central observable state for the app

@MainActor
final class AppState: ObservableObject {
    // Current screenshot being analyzed
    @Published var screenshotImage: UIImage?
    @Published var imageUrl: String?

    // Analysis
    @Published var analysisResult: AnalysisResult?
    @Published var isAnalyzing = false
    @Published var analysisError: String?
    @Published var progressText: String = ""

    // Chat (inline on home screen)
    @Published var chatMessages: [ChatMessage] = []
    @Published var isChatting = false
    @Published var isDeepResearchMode = false

    // Navigation
    @Published var showAnalysis = false
    @Published var showDeepResearch = false

    // Selected tab
    @Published var selectedTab: Tab = .home

    // History
    @Published var history: [AnalysisResult] = []

    // Screenshot notification banner
    @Published var showScreenshotBanner = false

    enum Tab: Int {
        case home = 0
        case results = 1
        case history = 2
    }

    private let api = APIClient.shared

    // MARK: - Upload & Analyze

    func analyzeScreenshot(_ image: UIImage) {
        screenshotImage = image
        isAnalyzing = true
        analysisError = nil
        progressText = "Extracting text from image…"

        Task {
            do {
                // Simulate progress updates (actual progress comes from backend)
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    self.progressText = "Searching for sources…"
                }
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    self.progressText = "Analyzing with AI…"
                }
                
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self.progressText = "Calculating trust score…"
                }
                
                let result = try await api.analyzeImage(image)
                self.analysisResult = result
                self.imageUrl = result.imageUrl
                self.isAnalyzing = false
                self.showAnalysis = true
                self.selectedTab = .results
                self.history.insert(result, at: 0)
                self.progressText = ""
            } catch {
                self.analysisError = error.localizedDescription
                self.isAnalyzing = false
                self.progressText = ""
                print("[AppState] Analysis error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Analyze Latest Screenshot (from notification tap)

    func analyzeLatestScreenshot() async {
        let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        guard status == .authorized || status == .limited else {
            print("Photo library not authorized")
            return
        }

        let opts = PHFetchOptions()
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        opts.fetchLimit = 1
        opts.predicate = NSPredicate(
            format: "mediaSubtype == %d",
            PHAssetMediaSubtype.photoScreenshot.rawValue
        )

        let result = PHAsset.fetchAssets(with: .image, options: opts)
        guard let asset = result.firstObject else {
            print("No screenshot found")
            return
        }

        // Load the image
        let image = await loadImage(from: asset)
        guard let screenshot = image else {
            print("Failed to load screenshot image")
            return
        }

        // Auto-analyze
        analyzeScreenshot(screenshot)
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

    // MARK: - Text Query (inline chat — no sheet)

    func startTextQuery(_ text: String) {
        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        let mode = isDeepResearchMode ? "deep_research" : "standard"

        let context: String
        if let result = analysisResult {
            context = result.claims.map { claim in
                "Claim: \(claim.text)\nVerdict: \(claim.verdict)\nScore: \(claim.trustScore)%\nSources: \(claim.sources.map(\.title).joined(separator: ", "))"
            }.joined(separator: "\n\n")
        } else {
            context = ""
        }

        Task {
            do {
                let reply = try await api.chat(
                    jobId: analysisResult?.jobId ?? "",
                    message: text,
                    context: context,
                    mode: mode
                )
                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                let errMsg = ChatMessage(
                    role: .assistant,
                    content: "Error: \(error.localizedDescription)"
                )
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    // MARK: - Continue Chat (send follow-up messages)

    func sendChatMessage(_ text: String) {
        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        let mode = isDeepResearchMode ? "deep_research" : "standard"

        let context: String
        if let result = analysisResult {
            context = result.claims.map { claim in
                "Claim: \(claim.text)\nVerdict: \(claim.verdict)\nScore: \(claim.trustScore)%\nSources: \(claim.sources.map(\.title).joined(separator: ", "))"
            }.joined(separator: "\n\n")
        } else {
            context = ""
        }

        Task {
            do {
                let reply = try await api.chat(
                    jobId: analysisResult?.jobId ?? "",
                    message: text,
                    context: context,
                    mode: mode
                )
                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                let errMsg = ChatMessage(
                    role: .assistant,
                    content: "Error: \(error.localizedDescription)"
                )
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    // MARK: - Enter Chat from Analysis Results

    func enterChatFromResults() {
        guard let result = analysisResult else { return }
        chatMessages = []
        let welcomeMsg = ChatMessage(
            role: .assistant,
            content: "I have context from your screenshot analysis (\(result.aggregateTrustScore)% trust score, \(result.claims.count) claim\(result.claims.count == 1 ? "" : "s")). What would you like to know?"
        )
        chatMessages.append(welcomeMsg)
        selectedTab = .home
    }

    // MARK: - Clear chat (back to home)

    func clearChat() {
        chatMessages = []
        isDeepResearchMode = false
    }

    func resetForNewScreenshot() {
        screenshotImage = nil
        imageUrl = nil
        analysisResult = nil
        analysisError = nil
        chatMessages = []
        showAnalysis = false
        showDeepResearch = false
        progressText = ""
        isDeepResearchMode = false
    }
}
