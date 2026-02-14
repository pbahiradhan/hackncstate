import SwiftUI

// MARK: - Analysis Result (Screenshots 2 + 3 combined)

struct AnalysisResultView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        guard let result = appState.analysisResult else {
            return AnyView(EmptyResultsView())
        }

        return AnyView(
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    // Image thumbnail + checkmark
                    screenshotHeader(result)

                    // Trust Score gauge
                    TrustScoreGauge(
                        score: result.aggregateTrustScore,
                        label: trustDisplayLabel(result.aggregateTrustScore)
                    )

                    // Quick Summary
                    summaryCard(result.summary)

                    // Source Verification
                    if let firstClaim = result.claims.first {
                        sourceSection(firstClaim.sources)

                        // Bias Detection
                        BiasSlider(bias: firstClaim.biasSignals)
                            .padding(.horizontal, 20)

                        // Model Consensus
                        if !firstClaim.modelVerdicts.isEmpty {
                            ModelConsensusSection(verdicts: firstClaim.modelVerdicts)
                                .padding(.horizontal, 20)
                        }
                    }

                    // Action buttons
                    actionButtons

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
                        // Share action
                    } label: {
                        Image(systemName: "square.and.arrow.up")
                            .foregroundColor(.vsNavy)
                    }
                }
            }
            .sheet(isPresented: $appState.showChat) {
                ChatView()
                    .environmentObject(appState)
            }
            .sheet(isPresented: $appState.showDeepResearch) {
                DeepResearchView()
                    .environmentObject(appState)
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
                        .frame(width: 100, height: 100)
                        .clipShape(Circle())
                        .overlay(
                            Circle().stroke(Color.vsGray, lineWidth: 3)
                        )
                } else {
                    Circle()
                        .fill(Color.vsGray)
                        .frame(width: 100, height: 100)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.title)
                                .foregroundColor(.vsDarkGray)
                        )
                }

                // Green checkmark
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(.vsGreen)
                    .background(Color.white.clipShape(Circle()))
                    .offset(x: 4, y: 4)
            }
        }
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
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
        .padding(.horizontal, 20)
    }

    // MARK: - Source Verification

    private func sourceSection(_ sources: [Source]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("SOURCE VERIFICATION")
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

    // MARK: - Action Buttons

    private var actionButtons: some View {
        HStack(spacing: 16) {
            Button {
                appState.showChat = true
            } label: {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                    Text("Ask AI")
                }
                .font(.headline)
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.vsNavy)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }

            Button {
                appState.showDeepResearch = true
            } label: {
                HStack {
                    Image(systemName: "doc.text.magnifyingglass")
                    Text("Deep Research")
                }
                .font(.headline)
                .foregroundColor(.vsNavy)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.vsGray)
                .clipShape(RoundedRectangle(cornerRadius: 14))
            }
        }
        .padding(.horizontal, 20)
    }

    // MARK: - Helpers

    private func trustDisplayLabel(_ score: Int) -> String {
        if score >= 75 { return "Highly Reliable" }
        if score >= 40 { return "Mixed Evidence" }
        return "Likely Misleading"
    }
}
