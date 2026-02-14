import SwiftUI

// MARK: - Deep Research View (Screenshot 4)

struct DeepResearchView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        NavigationStack {
            guard let result = appState.analysisResult,
                  let claim = result.claims.first else {
                return AnyView(Text("No data").foregroundColor(.gray))
            }

            return AnyView(
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 20) {
                        // Image card with verdict badge
                        imageCard(result)

                        // Title & meta
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Deep Research Analysis")
                                .font(.title2.bold())
                                .foregroundColor(.vsNavy)

                            Text("Analyzed on \(formattedDate) • AI Confidence \(Int(claim.modelVerdicts.first?.confidence ?? 0.94 * 100))%")
                                .font(.subheadline)
                                .foregroundColor(.vsDarkGray)
                        }
                        .padding(.horizontal, 20)

                        // Key Takeaways
                        keyTakeaways(claim)

                        // Bias Detection
                        BiasSlider(bias: claim.biasSignals)
                            .padding(.horizontal, 20)

                        // Model Consensus
                        if !claim.modelVerdicts.isEmpty {
                            ModelConsensusSection(verdicts: claim.modelVerdicts)
                                .padding(.horizontal, 20)
                        }

                        // Sources
                        sourcesSection(claim.sources)

                        Spacer(minLength: 120)
                    }
                    .padding(.top, 8)
                }
                .background(Color.vsBackground)
                .navigationTitle("")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItemGroup(placement: .navigationBarTrailing) {
                        Button { } label: {
                            Image(systemName: "square.and.arrow.up")
                                .foregroundColor(.vsNavy)
                        }
                        Button { } label: {
                            Image(systemName: "bookmark")
                                .foregroundColor(.vsNavy)
                        }
                    }
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button {
                            appState.showDeepResearch = false
                        } label: {
                            Image(systemName: "chevron.left")
                                .foregroundColor(.vsNavy)
                        }
                    }
                }
            )
        }
    }

    // MARK: - Image card

    private func imageCard(_ result: AnalysisResult) -> some View {
        ZStack(alignment: .topTrailing) {
            // Screenshot image
            if let img = appState.screenshotImage {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
            } else {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.vsGray)
                    .frame(height: 220)
                    .overlay(
                        Image(systemName: "photo")
                            .font(.system(size: 40))
                            .foregroundColor(.vsDarkGray)
                    )
            }

            // Verdict badge
            verdictBadge(result.claims.first?.verdict ?? "mixed")
                .padding(12)
        }
        .padding(.horizontal, 20)
    }

    private func verdictBadge(_ verdict: String) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(verdictColor(verdict))
                .frame(width: 8, height: 8)
            Text(verdictLabel(verdict))
                .font(.caption.weight(.semibold))
                .foregroundColor(verdictColor(verdict))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial)
        .clipShape(Capsule())
    }

    // MARK: - Key Takeaways

    private func keyTakeaways(_ claim: Claim) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "lightbulb.fill")
                    .foregroundColor(.vsOrange)
                Text("KEY TAKEAWAYS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsOrange)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            VStack(alignment: .leading, spacing: 12) {
                // Parse explanation into bullets
                let bullets = claim.explanation.components(separatedBy: ". ").filter { !$0.isEmpty }
                ForEach(bullets, id: \.self) { bullet in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.vsOrange)
                            .font(.body)
                        Text(bullet.hasSuffix(".") ? bullet : bullet + ".")
                            .font(.body)
                            .foregroundColor(.vsNavy)
                    }
                }
            }
            .padding(20)
            .background(Color.vsOrange.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Sources

    private func sourcesSection(_ sources: [Source]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SOURCES")
                .font(.caption.weight(.bold))
                .foregroundColor(.vsDarkGray)
                .tracking(1)
                .padding(.horizontal, 20)

            ForEach(sources) { source in
                SourceCard(source: source)
                    .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Helpers

    private var formattedDate: String {
        let f = DateFormatter()
        f.dateFormat = "MMM dd, yyyy"
        return f.string(from: Date())
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
        case "likely_true": return "Likely True"
        case "likely_misleading": return "Misleading Context"
        default: return "Mixed Evidence"
        }
    }
}
