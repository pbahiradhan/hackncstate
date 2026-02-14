import SwiftUI

// MARK: - Source verification row (Screenshot 2)

struct SourceCard: View {
    let source: Source

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
        return String(source.domain.prefix(3)).uppercased()
    }

    private var abbrColor: Color {
        let score = source.credibilityScore
        if score >= 0.85 { return .vsBlue }
        if score >= 0.7 { return .vsGreen }
        return .vsOrange
    }

    private var dateLabel: String {
        // Simple relative date
        let d = source.date
        if d.count >= 10 {
            return String(d.prefix(10))
        }
        return d
    }

    var body: some View {
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
                        .foregroundColor(.vsNavy)
                        .lineLimit(2)

                    Text("\(dateLabel) • Verified")
                        .font(.caption)
                        .foregroundColor(.vsDarkGray)
                }

                Spacer()

                // External link
                Image(systemName: "arrow.up.right.square")
                    .font(.body)
                    .foregroundColor(.vsDarkGray)
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
    }
}
