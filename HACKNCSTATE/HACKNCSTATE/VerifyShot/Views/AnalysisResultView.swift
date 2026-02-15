import SwiftUI

// MARK: - Analysis Result (combines Screenshots 1 + 2 into one scrollable view)

struct AnalysisResultView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        guard let result = appState.analysisResult else {
            return AnyView(
                VStack(spacing: 16) {
                    Image(systemName: "doc.text.magnifyingglass")
                        .font(.system(size: 48))
                        .foregroundColor(.vsDarkGray)
                    Text("No analysis yet")
                        .font(.title3.weight(.medium))
                        .foregroundColor(.vsDarkGray)
                    Text("Upload or take a screenshot to get started")
                        .font(.subheadline)
                        .foregroundColor(.gray)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.vsBackground)
                .navigationTitle("Analysis Result")
            )
        }

        return AnyView(
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    // ── Section 1: Screenshot + checkmark ──
                    screenshotHeader(result)

                    // ── Section 2: Trust Score Gauge ──
                    TrustScoreGauge(
                        score: result.aggregateTrustScore,
                        label: trustDisplayLabel(result.aggregateTrustScore)
                    )

                    // ── Section 3: Verdict text ──
                    VStack(spacing: 4) {
                        Text(result.trustLabel)
                            .font(.title.bold())
                            .foregroundColor(.vsNavy)
                        if let firstClaim = result.claims.first, !firstClaim.modelVerdicts.isEmpty {
                            Text("Based on consensus from \(firstClaim.modelVerdicts.count) AI models")
                                .font(.subheadline)
                                .foregroundColor(.vsDarkGray)
                        } else if result.trustLabel == "Unable to Verify" {
                            Text("Insufficient high-quality sources found")
                                .font(.subheadline)
                                .foregroundColor(.vsDarkGray)
                        }
                    }

                    // ── Section 4: Quick Summary ──
                    summaryCard(result.summary)

                    // ── Section 5: Claims Breakdown ──
                    if !result.claims.isEmpty {
                        claimsSection(result.claims)
                    }

                    // ── Section 6: Source Verification ──
                    sourceSection(allSources(from: result.claims))

                    // ── Section 7: Bias Detection ──
                    if let firstClaim = result.claims.first {
                        BiasSlider(bias: firstClaim.biasSignals)
                            .padding(.horizontal, 20)
                    }

                    // ── Section 8: Model Consensus ──
                    if let firstClaim = result.claims.first, !firstClaim.modelVerdicts.isEmpty {
                        ModelConsensusSection(verdicts: firstClaim.modelVerdicts)
                            .padding(.horizontal, 20)
                    }

                    Spacer(minLength: 120)
                }
                .padding(.top, 8)
            }
            .background(Color.vsBackground)
            .navigationTitle("Analysis Result")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        appState.enterChatFromResults()
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "bubble.left.and.bubble.right.fill")
                            Text("Chat")
                        }
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(.vsOrange)
                    }
                }
            }
        )
    }

    // MARK: - Screenshot header

    private func screenshotHeader(_ result: AnalysisResult) -> some View {
        VStack(spacing: 8) {
            ZStack(alignment: .bottomTrailing) {
                if let img = appState.screenshotImage {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 120, height: 120)
                        .clipShape(Circle())
                        .overlay(
                            Circle().stroke(Color.vsGray, lineWidth: 4)
                        )
                } else {
                    Circle()
                        .fill(Color.vsGray)
                        .frame(width: 120, height: 120)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.title)
                                .foregroundColor(.vsDarkGray)
                        )
                }

                // Green checkmark badge
                verdictCheckmark(result.trustLabel)
                    .offset(x: 6, y: 6)
            }
        }
    }

    private func verdictCheckmark(_ label: String) -> some View {
        let isPositive = label.contains("True") || label.contains("Reliable")
        return Image(systemName: isPositive ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
            .font(.system(size: 32))
            .foregroundColor(isPositive ? .vsGreen : .vsOrange)
            .background(Color(uiColor: .systemBackground).clipShape(Circle()).padding(-2))
    }

    // MARK: - Quick Summary

    private func summaryCard(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundColor(.vsOrange)
                Text("Quick Summary")
                    .font(.headline)
                    .foregroundColor(.vsNavy)
            }

            Text(summary)
                .font(.body)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(20)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        .padding(.horizontal, 20)
    }

    // MARK: - Claims Breakdown

    private func claimsSection(_ claims: [Claim]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CLAIMS ANALYZED")
                .font(.caption.weight(.bold))
                .foregroundColor(.vsDarkGray)
                .tracking(1)
                .padding(.horizontal, 20)

            ForEach(claims) { claim in
                claimCard(claim)
                    .padding(.horizontal, 20)
            }
        }
    }

    private func claimCard(_ claim: Claim) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                // Verdict indicator
                Image(systemName: verdictIcon(claim.verdict))
                    .foregroundColor(verdictColor(claim.verdict))
                    .font(.body.weight(.semibold))

                Text(claim.text)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.vsNavy)
                    .lineLimit(3)

                Spacer()
            }

            HStack(spacing: 12) {
                // Trust score pill
                HStack(spacing: 4) {
                    Image(systemName: "shield.checkered")
                        .font(.caption2)
                    Text("\(claim.trustScore)%")
                        .font(.caption.weight(.bold))
                }
                .foregroundColor(.forTrustScore(claim.trustScore))
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.forTrustScore(claim.trustScore).opacity(0.1))
                .clipShape(Capsule())

                // Verdict label
                Text(verdictLabel(claim.verdict))
                    .font(.caption.weight(.semibold))
                    .foregroundColor(verdictColor(claim.verdict))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(verdictColor(claim.verdict).opacity(0.1))
                    .clipShape(Capsule())

                Spacer()
            }

            if !claim.explanation.isEmpty {
                Text(claim.explanation)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
            }
        }
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    // MARK: - Source Verification

    private func allSources(from claims: [Claim]) -> [Source] {
        // Deduplicate sources across claims
        var seen = Set<String>()
        var sources: [Source] = []
        for claim in claims {
            for source in claim.sources {
                if !seen.contains(source.url) {
                    seen.insert(source.url)
                    sources.append(source)
                }
            }
        }
        return Array(sources.prefix(8))
    }

    private func sourceSection(_ sources: [Source]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SOURCE VERIFICATION")
                .font(.caption.weight(.bold))
                .foregroundColor(.vsDarkGray)
                .tracking(1)
                .padding(.horizontal, 20)

            if sources.isEmpty {
                HStack(spacing: 10) {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.secondary)
                    Text("No web sources found. The AI couldn't find matching articles for this content.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(uiColor: .secondarySystemGroupedBackground))
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 20)
            } else {
                ForEach(sources) { source in
                    SourceCard(source: source)
                        .padding(.horizontal, 20)
                }
            }
        }
    }


    // MARK: - Helpers

    private func trustDisplayLabel(_ score: Int) -> String {
        if score >= 75 { return "Highly Reliable" }
        if score >= 40 { return "Mixed Evidence" }
        return "Likely Misleading"
    }

    private func verdictIcon(_ verdict: String) -> String {
        switch verdict {
        case "likely_true": return "checkmark.circle.fill"
        case "likely_misleading": return "exclamationmark.triangle.fill"
        case "unable_to_verify": return "questionmark.circle.fill"
        default: return "questionmark.circle.fill"
        }
    }

    private func verdictColor(_ verdict: String) -> Color {
        switch verdict {
        case "likely_true": return .vsGreen
        case "likely_misleading": return .vsOrange
        case "unable_to_verify": return .gray
        default: return .vsYellow
        }
    }

    private func verdictLabel(_ verdict: String) -> String {
        switch verdict {
        case "likely_true": return "Likely True"
        case "likely_misleading": return "Misleading"
        case "unable_to_verify": return "Unable to Verify"
        default: return "Mixed"
        }
    }
}
