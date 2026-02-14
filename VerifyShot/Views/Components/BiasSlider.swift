import SwiftUI

// MARK: - Bias Detection slider (Screenshot 3)

struct BiasSlider: View {
    let bias: BiasSignals

    private var normalizedPosition: CGFloat {
        // -1 → 0.0, 0 → 0.5, 1 → 1.0
        CGFloat((bias.politicalBias + 1) / 2)
    }

    private var biasLabel: String {
        switch bias.overallBias {
        case "left": return "Left"
        case "slight_left": return "Slight Left"
        case "center": return "Center"
        case "slight_right": return "Slight Right"
        case "right": return "Right"
        default: return "Center"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("Bias Detection")
                    .font(.headline)
                    .foregroundColor(.vsNavy)
                Spacer()
                Text(biasLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.forBias(bias.overallBias))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color.forBias(bias.overallBias).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Slider
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    // Track — gradient from blue to red
                    HStack(spacing: 0) {
                        LinearGradient(
                            colors: [.vsBlue, .vsBlue.opacity(0.5)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width / 2)

                        LinearGradient(
                            colors: [.vsRed.opacity(0.5), .vsRed],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: geo.size.width / 2)
                    }
                    .frame(height: 6)
                    .clipShape(Capsule())

                    // Center line
                    Rectangle()
                        .fill(Color.vsDarkGray)
                        .frame(width: 2, height: 14)
                        .offset(x: geo.size.width / 2 - 1)

                    // Indicator dot
                    Circle()
                        .fill(Color.white)
                        .frame(width: 22, height: 22)
                        .shadow(color: .black.opacity(0.2), radius: 4, y: 2)
                        .overlay(
                            Circle()
                                .fill(Color.vsBlue)
                                .frame(width: 14, height: 14)
                        )
                        .offset(x: normalizedPosition * (geo.size.width - 22))
                }
                .frame(height: 22)
            }
            .frame(height: 22)

            // Labels
            HStack {
                Text("LEFT")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.vsDarkGray)
                Spacer()
                Text("CENTER")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.vsDarkGray)
                Spacer()
                Text("RIGHT")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(.vsDarkGray)
            }

            // Explanation
            Text(bias.explanation)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
}
