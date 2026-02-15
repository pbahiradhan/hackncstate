import SwiftUI

// MARK: - Source verification row — tappable, opens in Safari

struct SourceCard: View {
    let source: Source
    @State private var showCredibilityInfo = false

    // Map domain to short abbreviation
    private var domainAbbr: String {
        let d = source.domain.lowercased()
        if d.contains("nytimes") { return "NYT" }
        if d.contains("bbc") { return "BBC" }
        if d.contains("reuters") { return "R" }
        if d.contains("apnews") { return "AP" }
        if d.contains("cnn") { return "CNN" }
        if d.contains("guardian") { return "TG" }
        if d.contains("washingtonpost") { return "WP" }
        if d.contains("snopes") { return "SN" }
        if d.contains("politifact") { return "PF" }
        if d.contains("cnbc") { return "CNBC" }
        if d.contains("bloomberg") { return "BG" }
        if d.contains("nature") { return "NAT" }
        if d.contains("npr") { return "NPR" }
        return String(source.domain.prefix(3)).uppercased()
    }

    private var abbrColor: Color {
        let score = source.credibilityScore
        if score >= 0.85 { return .vsBlue }
        if score >= 0.7 { return .vsGreen }
        return .vsOrange
    }

    private var dateLabel: String {
        let d = source.date
        if d.count >= 10 {
            return String(d.prefix(10))
        }
        return d
    }

    private var credibilityLabel: String {
        let score = source.credibilityScore
        if score >= 0.9 { return "Highest Tier" }
        if score >= 0.8 { return "Highly Credible" }
        if score >= 0.7 { return "Credible" }
        if score >= 0.5 { return "Moderate" }
        return "Low"
    }

    private var credibilityExplanation: String {
        let d = source.domain.lowercased()
        let score = source.credibilityScore

        var reasons: [String] = []

        // Domain type
        if d.hasSuffix(".gov") || d.hasSuffix(".gov.uk") {
            reasons.append("Government source")
        } else if d.hasSuffix(".edu") {
            reasons.append("Academic institution")
        } else if d.contains("reuters") || d.contains("apnews") || d.contains("ap.org") {
            reasons.append("Wire service (highest editorial tier)")
        } else if d.contains("nature") || d.contains("science.org") || d.contains("pubmed") || d.contains("nih.gov") {
            reasons.append("Peer-reviewed scientific source")
        } else if d.contains("snopes") || d.contains("politifact") || d.contains("factcheck") {
            reasons.append("Dedicated fact-checking organization")
        }

        // Score tier
        if score >= 0.9 {
            reasons.append("Top-tier editorial standards")
        } else if score >= 0.8 {
            reasons.append("Strong editorial oversight")
        } else if score >= 0.7 {
            reasons.append("Established news outlet")
        } else if score >= 0.5 {
            reasons.append("General web source")
        } else {
            reasons.append("Unverified source reputation")
        }

        return reasons.joined(separator: " • ")
    }

    var body: some View {
        VStack(spacing: 0) {
            // Main card — taps open in Safari
            Button {
                if let url = URL(string: source.url) {
                    UIApplication.shared.open(url)
                }
            } label: {
                HStack(spacing: 14) {
                    // Domain abbreviation badge
                    Text(domainAbbr)
                        .font(.caption.weight(.bold))
                        .foregroundColor(abbrColor)
                        .frame(width: 44, height: 44)
                        .background(abbrColor.opacity(0.1))
                        .clipShape(Circle())

                    // Title + meta
                    VStack(alignment: .leading, spacing: 3) {
                        Text(source.title)
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.primary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        HStack(spacing: 6) {
                            Text(source.domain)
                                .font(.caption2)
                                .foregroundColor(.secondary)

                            Text("•")
                                .foregroundColor(.secondary)
                                .font(.caption2)

                            Text(dateLabel)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }

                    Spacer()

                    // Credibility badge + external link
                    VStack(spacing: 4) {
                        Image(systemName: "arrow.up.right.square")
                            .font(.body)
                            .foregroundColor(.secondary)

                        // Credibility score pip
                        Button {
                            withAnimation(.spring(response: 0.3)) {
                                showCredibilityInfo.toggle()
                            }
                        } label: {
                            Text("\(Int(source.credibilityScore * 100))")
                                .font(.caption2.weight(.bold).monospacedDigit())
                                .foregroundColor(abbrColor)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(abbrColor.opacity(0.1))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .buttonStyle(.plain)

            // Snippet (if available)
            if !source.snippet.isEmpty {
                Text(source.snippet)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Expandable credibility explanation
            if showCredibilityInfo {
                Divider()
                    .padding(.horizontal, 16)

                HStack(spacing: 10) {
                    Image(systemName: "shield.checkered")
                        .font(.caption)
                        .foregroundColor(abbrColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Credibility: \(credibilityLabel) (\(Int(source.credibilityScore * 100))%)")
                            .font(.caption.weight(.semibold))
                            .foregroundColor(.primary)

                        Text(credibilityExplanation)
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}
