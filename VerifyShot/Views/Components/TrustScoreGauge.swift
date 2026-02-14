import SwiftUI

// MARK: - Semi-circular trust score gauge (Screenshot 2)

struct TrustScoreGauge: View {
    let score: Int            // 0-100
    let label: String         // "Highly Reliable", "Likely True", etc.

    @State private var animatedScore: Double = 0

    private var scoreColor: Color { .forTrustScore(score) }
    private var progress: Double { Double(score) / 100.0 }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                // Background arc
                Circle()
                    .trim(from: 0.0, to: 0.75)
                    .stroke(Color.vsGray, style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .frame(width: 180, height: 180)
                    .rotationEffect(.degrees(135))

                // Filled arc
                Circle()
                    .trim(from: 0.0, to: animatedScore * 0.75)
                    .stroke(
                        scoreColor,
                        style: StrokeStyle(lineWidth: 14, lineCap: .round)
                    )
                    .frame(width: 180, height: 180)
                    .rotationEffect(.degrees(135))

                // Score text
                VStack(spacing: 2) {
                    HStack(alignment: .top, spacing: 0) {
                        Text("\(score)")
                            .font(.system(size: 48, weight: .bold, design: .rounded))
                            .foregroundColor(.vsNavy)
                        Text("%")
                            .font(.system(size: 20, weight: .semibold))
                            .foregroundColor(.vsDarkGray)
                            .offset(y: 8)
                    }
                    Text("TRUST SCORE")
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.vsDarkGray)
                        .tracking(1)
                }
            }

            // Label badge
            HStack(spacing: 6) {
                Circle()
                    .fill(scoreColor)
                    .frame(width: 8, height: 8)
                Text(label)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(scoreColor)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(scoreColor.opacity(0.1))
            .clipShape(Capsule())
        }
        .onAppear {
            withAnimation(.easeOut(duration: 1.2)) {
                animatedScore = progress
            }
        }
    }
}
