import SwiftUI

// MARK: - Model Consensus cards (Screenshot 3)

struct ModelConsensusSection: View {
    let verdicts: [ModelVerdict]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Model Consensus")
                .font(.headline)
                .foregroundColor(.vsNavy)

            HStack(spacing: 12) {
                ForEach(verdicts) { verdict in
                    modelCard(verdict)
                }
            }
        }
    }

    private func modelCard(_ verdict: ModelVerdict) -> some View {
        VStack(spacing: 10) {
            ZStack(alignment: .topTrailing) {
                // Model icon
                Text(modelEmoji(verdict.modelName))
                    .font(.system(size: 32))
                    .frame(width: 56, height: 56)
                    .background(Color.vsGray)
                    .clipShape(Circle())

                // Check or X
                Image(systemName: verdict.agrees ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(verdict.agrees ? .vsGreen : .vsRed)
                    .background(Color.white.clipShape(Circle()))
                    .offset(x: 4, y: -4)
            }

            Text(verdict.modelName)
                .font(.caption.weight(.medium))
                .foregroundColor(.vsNavy)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    private func modelEmoji(_ name: String) -> String {
        switch name.lowercased() {
        case let n where n.contains("gpt"): return "🤖"
        case let n where n.contains("claude"): return "🧠"
        case let n where n.contains("gemini"): return "✨"
        case let n where n.contains("llama"): return "🦙"
        default: return "🔬"
        }
    }
}
