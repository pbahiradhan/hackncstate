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

    // Chat
    @Published var chatMessages: [ChatMessage] = []
    @Published var isChatting = false
    @Published var isDeepResearchMode = false
    @Published var researchSteps: [ResearchStep] = []

    // Navigation
    @Published var showAnalysis = false
    @Published var showDeepResearch = false

    // Selected tab
    @Published var selectedTab: Tab = .home

    // History (persisted to UserDefaults)
    @Published var history: [AnalysisResult] = [] {
        didSet { persistHistory() }
    }

    // Screenshot notification banner
    @Published var showScreenshotBanner = false

    enum Tab: Int {
        case home = 0
        case chat = 1
        case history = 2
    }

    private let api = APIClient.shared
    private static let historyKey = "verifyshot_history"

    // MARK: - Init — load persisted history

    init() {
        loadPersistedHistory()
    }

    private func loadPersistedHistory() {
        guard let data = UserDefaults.standard.data(forKey: Self.historyKey) else { return }
        do {
            let decoded = try JSONDecoder().decode([AnalysisResult].self, from: data)
            self.history = decoded
            print("[AppState] Loaded \(decoded.count) history items from disk")
        } catch {
            print("[AppState] Failed to load history: \(error.localizedDescription)")
        }
    }

    private func persistHistory() {
        do {
            // Keep max 50 entries to avoid storage bloat
            let trimmed = Array(history.prefix(50))
            let data = try JSONEncoder().encode(trimmed)
            UserDefaults.standard.set(data, forKey: Self.historyKey)
        } catch {
            print("[AppState] Failed to persist history: \(error.localizedDescription)")
        }
    }

    // MARK: - Upload & Analyze

    func analyzeScreenshot(_ image: UIImage) {
        screenshotImage = image
        isAnalyzing = true
        analysisError = nil
        progressText = "Extracting text from image…"

        Task {
            do {
                // Simulate progress updates
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    self.progressText = "Searching for sources…"
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    self.progressText = "Analyzing with AI…"
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                    self.progressText = "Detecting bias across perspectives…"
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    self.progressText = "Calculating trust score…"
                }

                let result = try await api.analyzeImage(image)
                self.analysisResult = result
                self.imageUrl = result.imageUrl
                self.isAnalyzing = false
                self.showAnalysis = true
                // Stay on home tab — analysis results are shown inline on home
                self.selectedTab = .home
                self.history.insert(result, at: 0)
                self.progressText = ""

                // Save analysis to Backboard memory for chat recall
                await saveAnalysisToMemory(result)
            } catch {
                self.analysisError = error.localizedDescription
                self.isAnalyzing = false
                self.progressText = ""
                print("[AppState] Analysis error: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Save analysis to Backboard memory (for cross-thread recall)

    private func saveAnalysisToMemory(_ result: AnalysisResult) async {
        // Build a concise memory string for Backboard
        var memoryParts: [String] = []
        memoryParts.append("Screenshot Analysis (Trust: \(result.aggregateTrustScore)%, \(result.trustLabel)):")
        memoryParts.append("Summary: \(result.summary)")

        for (i, claim) in result.claims.enumerated() {
            memoryParts.append("Claim \(i + 1): \"\(claim.text)\" — \(claim.verdict), \(claim.trustScore)% trust")
            if !claim.explanation.isEmpty {
                memoryParts.append("  Explanation: \(claim.explanation)")
            }
            if !claim.sources.isEmpty {
                let sourceNames = claim.sources.prefix(3).map { "\($0.title) (\($0.domain))" }.joined(separator: "; ")
                memoryParts.append("  Sources: \(sourceNames)")
            }
        }

        let memoryContent = memoryParts.joined(separator: "\n")

        do {
            try await api.saveAnalysisMemory(jobId: result.jobId, content: memoryContent)
            print("[AppState] Analysis saved to Backboard memory")
        } catch {
            // Non-critical — don't show error to user
            print("[AppState] Memory save failed (non-critical): \(error.localizedDescription)")
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

        let image = await loadImage(from: asset)
        guard let screenshot = image else {
            print("Failed to load screenshot image")
            return
        }

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

    // MARK: - Chat

    func sendChatMessage(_ text: String) {
        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        // If deep research mode, show animated research steps
        if isDeepResearchMode {
            startResearchSteps()
        }

        let mode = isDeepResearchMode ? "deep_research" : "standard"

        // Build context from analysis (also stored in Backboard memory, but
        // we still pass it for the first message before memory settles)
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

                if isDeepResearchMode {
                    completeResearchSteps()
                }

                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                if isDeepResearchMode {
                    completeResearchSteps()
                }

                let errMsg = ChatMessage(
                    role: .assistant,
                    content: "Error: \(error.localizedDescription)"
                )
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    // MARK: - Deep Research Steps

    func startResearchSteps() {
        researchSteps = [
            ResearchStep(title: "Understanding your question...", icon: "sparkles", delay: 0),
            ResearchStep(title: "Searching verified sources...", icon: "magnifyingglass", delay: 1.0),
            ResearchStep(title: "Analyzing with AI models...", icon: "cpu", delay: 3.0),
            ResearchStep(title: "Cross-referencing claims...", icon: "arrow.triangle.branch", delay: 5.0),
            ResearchStep(title: "Synthesizing findings...", icon: "text.badge.checkmark", delay: 7.0),
        ]
    }

    func completeResearchSteps() {
        researchSteps = researchSteps.map { step in
            ResearchStep(title: step.title, icon: step.icon, delay: step.delay, isComplete: true)
        }
    }

    // MARK: - Enter Chat from Analysis Results

    func enterChatFromResults() {
        guard let result = analysisResult else { return }
        if chatMessages.isEmpty {
            let welcomeMsg = ChatMessage(
                role: .assistant,
                content: "I have context from your screenshot analysis (\(result.aggregateTrustScore)% trust score, \(result.claims.count) claim\(result.claims.count == 1 ? "" : "s")). Ask me anything about it, or switch to Deep Research for an in-depth investigation."
            )
            chatMessages.append(welcomeMsg)
        }
        selectedTab = .chat
    }

    // MARK: - Clear / Reset

    func clearChat() {
        chatMessages = []
        isDeepResearchMode = false
        researchSteps = []
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
        researchSteps = []
    }
}
