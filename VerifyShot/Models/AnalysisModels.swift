import Foundation

// MARK: - API Response Models (match backend JSON exactly)

struct AnalysisResult: Codable, Identifiable {
    var id: String { jobId }
    let jobId: String
    let imageUrl: String
    let ocrText: String
    let claims: [Claim]
    let aggregateTrustScore: Int
    let trustLabel: String
    let summary: String
    let generatedAt: String
}

struct Claim: Codable, Identifiable {
    let id: String
    let text: String
    let verdict: String          // "likely_true" | "mixed" | "likely_misleading"
    let trustScore: Int
    let explanation: String
    let sources: [Source]
    let biasSignals: BiasSignals
    let modelVerdicts: [ModelVerdict]
}

struct Source: Codable, Identifiable {
    var id: String { url }
    let title: String
    let url: String
    let domain: String
    let date: String
    let credibilityScore: Double
    let snippet: String
}

struct BiasSignals: Codable {
    let politicalBias: Double    // -1 to 1
    let sensationalism: Double   // 0 to 1
    let overallBias: String      // "left"|"slight_left"|"center"|"slight_right"|"right"
    let explanation: String
}

struct ModelVerdict: Codable, Identifiable {
    var id: String { modelName }
    let modelName: String
    let agrees: Bool
    let confidence: Double
}

// MARK: - Chat

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: Role
    let content: String

    enum Role { case user, assistant }
}

struct ChatResponse: Codable {
    let reply: String
}

// MARK: - Upload

struct UploadResponse: Codable {
    let imageUrl: String
    let jobId: String
}
