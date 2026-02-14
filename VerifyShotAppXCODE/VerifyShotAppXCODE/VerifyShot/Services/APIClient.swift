import Foundation
import UIKit

// MARK: - Talks to the Vercel backend

final class APIClient {
    static let shared = APIClient()

    // ⚠️  CHANGE THIS to your deployed Vercel URL
    private let baseURL = "https://hackncstate.vercel.app"

    private init() {}

    // MARK: - Analyze (single call: upload + analyze)

    func analyzeImage(_ image: UIImage) async throws -> AnalysisResult {
        guard let jpegData = image.jpegData(compressionQuality: 0.8) else {
            throw APIError.invalidImage
        }

        let base64 = jpegData.base64EncodedString()

        let body: [String: Any] = [
            "image": base64,
            "filename": "screenshot-\(Int(Date().timeIntervalSince1970)).jpg"
        ]

        let data = try await post(path: "/api/analyze", body: body)
        let result = try JSONDecoder().decode(AnalysisResult.self, from: data)
        return result
    }

    // MARK: - Chat (standard or deep_research mode)

    func chat(
        jobId: String,
        message: String,
        context: String,
        mode: String = "standard"
    ) async throws -> String {
        let body: [String: Any] = [
            "jobId": jobId,
            "message": message,
            "context": context,
            "mode": mode
        ]
        let data = try await post(path: "/api/chat", body: body)
        let resp = try JSONDecoder().decode(ChatResponse.self, from: data)
        return resp.reply
    }

    // MARK: - Private

    private func post(path: String, body: [String: Any]) async throws -> Data {
        guard let url = URL(string: baseURL + path) else { throw APIError.badURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120  // allow time for analysis

        let jsonData = try JSONSerialization.data(withJSONObject: body)
        request.httpBody = jsonData

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let http = response as? HTTPURLResponse else { throw APIError.noResponse }
        guard (200...299).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "Unknown error"
            throw APIError.server(http.statusCode, msg)
        }
        return data
    }
}

enum APIError: LocalizedError {
    case invalidImage
    case badURL
    case noResponse
    case server(Int, String)

    var errorDescription: String? {
        switch self {
        case .invalidImage: return "Could not process image"
        case .badURL: return "Invalid server URL"
        case .noResponse: return "No response from server"
        case .server(let code, let msg): return "Server error \(code): \(msg)"
        }
    }
}
