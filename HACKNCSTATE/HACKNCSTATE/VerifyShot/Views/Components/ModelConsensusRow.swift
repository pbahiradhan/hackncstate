import SwiftUI

// MARK: - Enhanced Model Consensus with Verdicts and Reasoning

struct ModelConsensusSection: View {
    let verdicts: [ModelVerdict]
    @State private var expandedModel: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Model Consensus")
                    .font(.headline)
                    .foregroundColor(.vsNavy)
                Spacer()
                if !verdicts.isEmpty {
                    let agreementCount = verdicts.filter { $0.agrees }.count
                    HStack(spacing: 4) {
                        Image(systemName: agreementCount == verdicts.count ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                            .foregroundColor(agreementCount == verdicts.count ? .green : .orange)
                            .font(.caption)
                        Text("\(agreementCount)/\(verdicts.count) agree")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.vsDarkGray)
                    }
                }
            }

            // Model cards in a grid
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                ForEach(verdicts) { verdict in
                    modelCard(verdict)
                }
            }
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }

    private func modelCard(_ verdict: ModelVerdict) -> some View {
        VStack(spacing: 8) {
            ZStack(alignment: .topTrailing) {
                // Model icon
                Text(modelEmoji(verdict.modelName))
                    .font(.system(size: 28))
                    .frame(width: 50, height: 50)
                    .background(Color.vsGray.opacity(0.3))
                    .clipShape(Circle())

                // Verdict indicator
                verdictBadge(verdict)
                    .offset(x: 4, y: -4)
            }

            Text(modelShortName(verdict.modelName))
                .font(.caption2.weight(.medium))
                .foregroundColor(.vsNavy)
                .lineLimit(1)
                .minimumScaleFactor(0.8)

            // Confidence bar
            GeometryReader { geo in
                let w = max(1, geo.size.width)
                let conf = CGFloat(min(1, max(0, verdict.confidence.isNaN ? 0 : verdict.confidence)))
                ZStack(alignment: .leading) {
                    Rectangle()
                        .fill(Color.vsDarkGray.opacity(0.1))
                        .frame(height: 4)
                        .clipShape(Capsule())
                    
                    Rectangle()
                        .fill(confidenceColor(verdict.confidence))
                        .frame(width: max(0, w * conf), height: 4)
                        .clipShape(Capsule())
                }
            }
            .frame(height: 4)

            // Verdict label
            if let verdictText = verdict.verdict {
                Text(verdictLabel(verdictText))
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(verdictColor(verdictText))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(verdictColor(verdictText).opacity(0.1))
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .padding(.horizontal, 8)
        .background(Color.vsBackground)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .onTapGesture {
            withAnimation {
                expandedModel = expandedModel == verdict.modelName ? nil : verdict.modelName
            }
        }
        .overlay(
            // Expandable reasoning
            Group {
                if expandedModel == verdict.modelName, let reasoning = verdict.reasoning, !reasoning.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Reasoning")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.vsNavy)
                        Text(reasoning)
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(12)
                    .background(Color.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .shadow(color: .black.opacity(0.1), radius: 4, y: 2)
                    .offset(y: 120)
                }
            },
            alignment: .top
        )
    }

    private func verdictBadge(_ verdict: ModelVerdict) -> some View {
        Group {
            if verdict.agrees {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.vsGreen)
            } else {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 16))
                    .foregroundColor(.vsOrange)
            }
        }
        .background(Color.white.clipShape(Circle()).padding(-2))
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

    private func modelShortName(_ name: String) -> String {
        if name.contains("GPT") { return "GPT-4o" }
        if name.contains("Claude") { return "Claude" }
        if name.contains("Gemini") { return "Gemini" }
        return name
    }

    private func confidenceColor(_ confidence: Double) -> Color {
        if confidence >= 0.7 { return .vsGreen }
        if confidence >= 0.4 { return .vsYellow }
        return .vsOrange
    }

    private func verdictColor(_ verdict: String) -> Color {
        switch verdict {
        case "likely_true": return .vsGreen
        case "likely_misleading": return .vsOrange
        default: return .vsYellow
        }
    }

    private func verdictLabel(_ verdict: String) -> String {
        switch verdict {
        case "likely_true": return "True"
        case "likely_misleading": return "Misleading"
        default: return "Mixed"
        }
    }
}
