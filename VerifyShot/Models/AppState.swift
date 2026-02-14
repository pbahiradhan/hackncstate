import SwiftUI
import UIKit

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

    // Navigation
    @Published var showAnalysis = false
    @Published var showChat = false
    @Published var showDeepResearch = false

    // Selected tab
    @Published var selectedTab: Tab = .home

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
        progressText = "Uploading screenshot…"

        Task {
            do {
                let result = try await api.analyzeImage(image)
                self.analysisResult = result
                self.imageUrl = result.imageUrl
                self.isAnalyzing = false
                self.showAnalysis = true
                self.selectedTab = .results
            } catch {
                self.analysisError = error.localizedDescription
                self.isAnalyzing = false
            }
        }
    }

    // MARK: - Chat

    func sendChatMessage(_ text: String) {
        guard let result = analysisResult else { return }

        let userMsg = ChatMessage(role: .user, content: text)
        chatMessages.append(userMsg)
        isChatting = true

        // Build context from claims + sources
        let context = result.claims.map { claim in
            "Claim: \(claim.text)\nVerdict: \(claim.verdict)\nSources: \(claim.sources.map(\.title).joined(separator: ", "))"
        }.joined(separator: "\n\n")

        Task {
            do {
                let reply = try await api.chat(
                    jobId: result.jobId,
                    message: text,
                    context: context
                )
                let assistantMsg = ChatMessage(role: .assistant, content: reply)
                self.chatMessages.append(assistantMsg)
            } catch {
                let errMsg = ChatMessage(role: .assistant, content: "Sorry, something went wrong. Please try again.")
                self.chatMessages.append(errMsg)
            }
            self.isChatting = false
        }
    }

    func resetForNewScreenshot() {
        screenshotImage = nil
        imageUrl = nil
        analysisResult = nil
        analysisError = nil
        chatMessages = []
        showAnalysis = false
        showChat = false
        showDeepResearch = false
        progressText = ""
    }
}
