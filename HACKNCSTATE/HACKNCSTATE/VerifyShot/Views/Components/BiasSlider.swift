import SwiftUI

// MARK: - Enhanced Bias Detection with Multi-Perspective Analysis

struct BiasSlider: View {
    let bias: BiasSignals
    @State private var showDetails = false

    private var normalizedPosition: CGFloat {
        // -1 → 0.0, 0 → 0.5, 1 → 1.0
        let raw = CGFloat((bias.politicalBias + 1) / 2)
        // Guard against NaN/Inf that crashes CoreGraphics
        return raw.isNaN || raw.isInfinite ? 0.5 : min(1, max(0, raw))
    }

    /// Safe sensationalism value clamped to 0-1 (guards against NaN)
    private var safeSensationalism: CGFloat {
        let raw = CGFloat(bias.sensationalism)
        return raw.isNaN || raw.isInfinite ? 0 : min(1, max(0, raw))
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
    
    private var confidenceText: String {
        if let conf = bias.confidence {
            return "\(Int(conf * 100))%"
        }
        return ""
    }
    
    private var agreementIcon: String {
        switch bias.agreement {
        case "high": return "checkmark.circle.fill"
        case "medium": return "exclamationmark.circle.fill"
        case "low": return "xmark.circle.fill"
        default: return "questionmark.circle"
        }
    }
    
    private var agreementColor: Color {
        switch bias.agreement {
        case "high": return .green
        case "medium": return .orange
        case "low": return .red
        default: return .gray
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header with confidence
            HStack {
                Text("Bias Detection")
                    .font(.headline)
                    .foregroundColor(.vsNavy)
                Spacer()
                
                if let conf = bias.confidence, conf > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: agreementIcon)
                            .foregroundColor(agreementColor)
                            .font(.caption)
                        Text(confidenceText)
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.vsDarkGray)
                    }
                }
                
                Text(biasLabel)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.forBias(bias.overallBias))
                    .padding(.horizontal, 12)
                    .padding(.vertical, 4)
                    .background(Color.forBias(bias.overallBias).opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            }

            // Enhanced Slider with confidence interval
            GeometryReader { geo in
                let w = max(1, geo.size.width) // Guard against zero width → NaN
                ZStack(alignment: .leading) {
                    // Track — gradient from blue to red
                    HStack(spacing: 0) {
                        LinearGradient(
                            colors: [.vsBlue, .vsBlue.opacity(0.5)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: w / 2)

                        LinearGradient(
                            colors: [.vsRed.opacity(0.5), .vsRed],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: w / 2)
                    }
                    .frame(height: 6)
                    .clipShape(Capsule())

                    // Center line
                    Rectangle()
                        .fill(Color.vsDarkGray)
                        .frame(width: 2, height: 14)
                        .offset(x: w / 2 - 1)

                    // Confidence interval bar (if available)
                    if let conf = bias.confidence, conf >= 0, conf < 0.9 {
                        let intervalWidth = max(0, w * CGFloat(1 - conf) * 0.3)
                        Rectangle()
                            .fill(Color.vsDarkGray.opacity(0.2))
                            .frame(width: intervalWidth, height: 4)
                            .offset(x: normalizedPosition * max(0, w - intervalWidth))
                    }

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
                        .offset(x: normalizedPosition * max(0, w - 22))
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
            
            // Bias value with confidence
            HStack {
                Text(String(format: "%.2f", bias.politicalBias))
                    .font(.caption.monospacedDigit())
                    .foregroundColor(.vsDarkGray)
                if let conf = bias.confidence {
                    Text("±\(String(format: "%.2f", (1 - conf) * 0.5))")
                        .font(.caption2.monospacedDigit())
                        .foregroundColor(.secondary)
                }
            }

            // Sensationalism bar
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text("Sensationalism")
                        .font(.caption)
                        .foregroundColor(.vsDarkGray)
                    Spacer()
                    Text(String(format: "%.0f%%", safeSensationalism * 100))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.vsDarkGray)
                }
                
                GeometryReader { geo in
                    let w = max(1, geo.size.width)
                    ZStack(alignment: .leading) {
                        Rectangle()
                            .fill(Color.vsDarkGray.opacity(0.1))
                            .frame(height: 6)
                            .clipShape(Capsule())
                        
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [.green, .yellow, .orange, .red],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .frame(width: max(0, w * safeSensationalism), height: 6)
                            .clipShape(Capsule())
                    }
                }
                .frame(height: 6)
            }

            // Key Signals (if available)
            if let signals = bias.keySignals, !signals.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Key Signals")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.vsDarkGray)
                    
                    FlowLayout(spacing: 6) {
                        ForEach(signals.prefix(5), id: \.self) { signal in
                            Text(signal)
                                .font(.caption2)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.vsBlue.opacity(0.1))
                                .foregroundColor(.vsNavy)
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                        }
                    }
                }
            }

            // Explanation
            Text(bias.explanation)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            
            // Expandable Multi-Perspective Breakdown
            if let perspectives = bias.perspectives {
                Button(action: { withAnimation { showDetails.toggle() } }) {
                    HStack {
                        Text("Multi-Perspective Breakdown")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.vsNavy)
                        Spacer()
                        Image(systemName: showDetails ? "chevron.up" : "chevron.down")
                            .font(.caption)
                            .foregroundColor(.vsDarkGray)
                    }
                }
                
                if showDetails {
                    VStack(alignment: .leading, spacing: 12) {
                        perspectiveRow("US Left", perspectives.usLeft, .blue)
                        perspectiveRow("US Right", perspectives.usRight, .red)
                        perspectiveRow("International", perspectives.international, .purple)
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 12)
                    .background(Color.vsBackground)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .padding(20)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 8, y: 2)
    }
    
    private func perspectiveRow(_ label: String, _ perspective: BiasPerspective, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                    .font(.caption.weight(.semibold))
                    .foregroundColor(color)
                Spacer()
                Text(String(format: "Consensus: %.0f%%", perspective.consensus * 100))
                    .font(.caption2.monospacedDigit())
                    .foregroundColor(.secondary)
            }
            
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Bias")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(String(format: "%.2f", perspective.bias))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.vsDarkGray)
                }
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Sensationalism")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    Text(String(format: "%.0f%%", perspective.sensationalism * 100))
                        .font(.caption.monospacedDigit())
                        .foregroundColor(.vsDarkGray)
                }
            }
        }
    }
}

// Simple FlowLayout for tags
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(
            in: proposal.replacingUnspecifiedDimensions().width,
            subviews: subviews,
            spacing: spacing
        )
        return result.size
    }
    
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(
            in: bounds.width,
            subviews: subviews,
            spacing: spacing
        )
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.frames[index].minX,
                                      y: bounds.minY + result.frames[index].minY),
                          proposal: .unspecified)
        }
    }
    
    struct FlowResult {
        var size: CGSize = .zero
        var frames: [CGRect] = []
        
        init(in maxWidth: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var currentX: CGFloat = 0
            var currentY: CGFloat = 0
            var lineHeight: CGFloat = 0
            
            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                
                if currentX + size.width > maxWidth && currentX > 0 {
                    currentX = 0
                    currentY += lineHeight + spacing
                    lineHeight = 0
                }
                
                frames.append(CGRect(x: currentX, y: currentY, width: size.width, height: size.height))
                lineHeight = max(lineHeight, size.height)
                currentX += size.width + spacing
            }
            
            self.size = CGSize(width: maxWidth, height: currentY + lineHeight)
        }
    }
}
