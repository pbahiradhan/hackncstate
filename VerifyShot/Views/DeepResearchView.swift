import SwiftUI

// MARK: - Deep Research View (Screenshot 3 — sheet from AnalysisResultView)

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
                    VStack(alignment: .leading, spacing: 24) {
                        // ── Image Card with verdict badge ──
                        imageCard(result)

                        // ── Title & Meta ──
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Deep Research Analysis")
                                .font(.title2.bold())
                                .foregroundColor(.vsNavy)

                            HStack(spacing: 4) {
                                Text("Analyzed on \(formattedDate)")
                                    .font(.subheadline)
                                    .foregroundColor(.vsDarkGray)
                                Text("•")
                                    .foregroundColor(.vsDarkGray)
                                Text("AI Confidence \(confidencePercent(claim))%")
                                    .font(.subheadline.weight(.medium))
                                    .foregroundColor(.vsNavy)
                            }
                        }
                        .padding(.horizontal, 20)

                        // ── Key Takeaways ──
                        keyTakeaways(claim)

                        // ── Timeline & Context ──
                        timelineSection(result)

                        // ── Bias Detection ──
                        BiasSlider(bias: claim.biasSignals)
                            .padding(.horizontal, 20)

                        // ── Model Consensus ──
                        if !claim.modelVerdicts.isEmpty {
                            ModelConsensusSection(verdicts: claim.modelVerdicts)
                                .padding(.horizontal, 20)
                        }

                        // ── Sources ──
                        sourcesSection(claim.sources)

                        // ── All Claims ──
                        if result.claims.count > 1 {
                            allClaimsSection(result.claims)
                        }

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

    // MARK: - Image Card

    private func imageCard(_ result: AnalysisResult) -> some View {
        ZStack(alignment: .topTrailing) {
            ZStack(alignment: .bottomLeading) {
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

                // "Source" badge (bottom-left)
                HStack(spacing: 4) {
                    Image(systemName: "viewfinder")
                        .font(.caption2)
                    Text("Source")
                        .font(.caption.weight(.medium))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(12)
            }

            // Verdict badge (top-right)
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

            VStack(alignment: .leading, spacing: 16) {
                // Parse explanation into bullet points
                let bullets = parseBullets(from: claim.explanation)
                ForEach(Array(bullets.enumerated()), id: \.offset) { _, bullet in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.vsOrange)
                            .font(.body)
                            .padding(.top, 2)

                        Text(attributedBullet(bullet))
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

    // MARK: - Timeline & Context

    private func timelineSection(_ result: AnalysisResult) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 6) {
                Image(systemName: "clock.arrow.circlepath")
                    .foregroundColor(.vsOrange)
                Text("TIMELINE & CONTEXT")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsOrange)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            VStack(alignment: .leading, spacing: 0) {
                // Generate timeline events from sources and analysis
                let events = generateTimeline(result)
                ForEach(Array(events.enumerated()), id: \.offset) { index, event in
                    HStack(alignment: .top, spacing: 14) {
                        // Timeline dot and line
                        VStack(spacing: 0) {
                            Circle()
                                .fill(index == 0 ? Color.vsOrange : Color.vsDarkGray.opacity(0.4))
                                .frame(width: 10, height: 10)
                            if index < events.count - 1 {
                                Rectangle()
                                    .fill(Color.vsDarkGray.opacity(0.2))
                                    .frame(width: 2)
                                    .frame(minHeight: 40)
                            }
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text(event.date)
                                .font(.caption.weight(.semibold))
                                .foregroundColor(.vsDarkGray)
                            Text(event.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.vsNavy)
                            if !event.detail.isEmpty {
                                Text(event.detail)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.bottom, index < events.count - 1 ? 16 : 0)

                        Spacer()
                    }
                }
            }
            .padding(20)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Sources

    private func sourcesSection(_ sources: [Source]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .foregroundColor(.vsBlue)
                Text("SOURCES")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsDarkGray)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            if sources.isEmpty {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .foregroundColor(.vsDarkGray)
                    Text("No web sources found. Set up Google Search API for source verification.")
                        .font(.caption)
                        .foregroundColor(.vsDarkGray)
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.white)
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

    // MARK: - All Claims

    private func allClaimsSection(_ claims: [Claim]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "list.bullet.clipboard")
                    .foregroundColor(.vsNavy)
                Text("ALL CLAIMS")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.vsDarkGray)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            ForEach(claims) { claim in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: claim.verdict == "likely_true" ? "checkmark.circle.fill" :
                            claim.verdict == "likely_misleading" ? "exclamationmark.triangle.fill" :
                            "questionmark.circle.fill")
                        .foregroundColor(verdictColor(claim.verdict))
                        .font(.body)
                        .padding(.top, 2)

                    VStack(alignment: .leading, spacing: 4) {
                        Text(claim.text)
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.vsNavy)
                        HStack(spacing: 6) {
                            Text(verdictLabel(claim.verdict))
                                .font(.caption.weight(.semibold))
                                .foregroundColor(verdictColor(claim.verdict))
                            Text("•")
                                .foregroundColor(.vsDarkGray)
                            Text("Trust: \(claim.trustScore)%")
                                .font(.caption)
                                .foregroundColor(.vsDarkGray)
                        }
                    }

                    Spacer()
                }
                .padding(16)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
                .padding(.horizontal, 20)
            }
        }
    }

    // MARK: - Helpers

    private var formattedDate: String {
        let f = DateFormatter()
        f.dateFormat = "MMM dd, yyyy"
        if let result = appState.analysisResult,
           let date = ISO8601DateFormatter().date(from: result.generatedAt) {
            return f.string(from: date)
        }
        return f.string(from: Date())
    }

    private func confidencePercent(_ claim: Claim) -> Int {
        if !claim.modelVerdicts.isEmpty {
            let avg = claim.modelVerdicts.reduce(0.0) { $0 + $1.confidence } / Double(claim.modelVerdicts.count)
            return Int(avg * 100)
        }
        return claim.trustScore
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

    private func parseBullets(from explanation: String) -> [String] {
        let parts = explanation.components(separatedBy: ". ")
            .filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        if parts.isEmpty { return [explanation] }
        return parts.map { $0.hasSuffix(".") ? $0 : $0 + "." }
    }

    private func attributedBullet(_ text: String) -> AttributedString {
        // Simple bold for words before first comma or colon
        var result = AttributedString(text)
        if let colonRange = text.range(of: ":"),
           colonRange.lowerBound > text.startIndex {
            let boldPart = String(text[text.startIndex..<colonRange.upperBound])
            if let range = result.range(of: boldPart) {
                result[range].font = .body.bold()
            }
        }
        return result
    }

    // MARK: - Timeline Generation

    struct TimelineEvent {
        let date: String
        let title: String
        let detail: String
    }

    private func generateTimeline(_ result: AnalysisResult) -> [TimelineEvent] {
        var events: [TimelineEvent] = []

        // Add source dates as events
        let allSources = result.claims.flatMap(\.sources)
        let sortedSources = allSources.sorted { $0.date < $1.date }

        // Deduplicate by domain
        var seenDomains = Set<String>()
        for source in sortedSources {
            if !seenDomains.contains(source.domain) {
                seenDomains.insert(source.domain)
                let dateStr = formatSourceDate(source.date)
                events.append(TimelineEvent(
                    date: dateStr,
                    title: source.title,
                    detail: "\(source.domain) • Credibility: \(Int(source.credibilityScore * 100))%"
                ))
            }
            if events.count >= 4 { break }
        }

        // Add analysis event
        events.append(TimelineEvent(
            date: formattedDate,
            title: "VerifyShot Analysis Complete",
            detail: "Trust Score: \(result.aggregateTrustScore)% • \(result.claims.count) claim(s) verified"
        ))

        return events
    }

    private func formatSourceDate(_ dateStr: String) -> String {
        // Try to parse ISO date and format nicely
        let isoFormatter = ISO8601DateFormatter()
        let displayFormatter = DateFormatter()
        displayFormatter.dateFormat = "MMM yyyy"

        if let date = isoFormatter.date(from: dateStr) {
            return displayFormatter.string(from: date)
        }
        // Try simple date format
        let simpleFormatter = DateFormatter()
        simpleFormatter.dateFormat = "yyyy-MM-dd"
        if let date = simpleFormatter.date(from: String(dateStr.prefix(10))) {
            return displayFormatter.string(from: date)
        }
        return dateStr
    }
}
