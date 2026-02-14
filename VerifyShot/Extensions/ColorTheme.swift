import SwiftUI

extension Color {
    // Brand palette from screenshots
    static let vsOrange      = Color(red: 0.96, green: 0.65, blue: 0.14)
    static let vsOrangeLight = Color(red: 0.99, green: 0.85, blue: 0.55)
    static let vsNavy        = Color(red: 0.10, green: 0.17, blue: 0.30)
    static let vsGreen       = Color(red: 0.20, green: 0.78, blue: 0.35)
    static let vsRed         = Color(red: 1.00, green: 0.23, blue: 0.19)
    static let vsYellow      = Color(red: 1.00, green: 0.80, blue: 0.00)
    static let vsGray        = Color(red: 0.96, green: 0.96, blue: 0.97)
    static let vsDarkGray    = Color(red: 0.58, green: 0.58, blue: 0.60)
    static let vsBackground  = Color(red: 0.98, green: 0.98, blue: 0.99)
    static let vsBlue        = Color(red: 0.22, green: 0.45, blue: 0.84)

    /// Color for a given trust score
    static func forTrustScore(_ score: Int) -> Color {
        if score >= 75 { return .vsGreen }
        if score >= 40 { return .vsYellow }
        return .vsRed
    }

    /// Color for bias label
    static func forBias(_ bias: String) -> Color {
        switch bias {
        case "left", "slight_left": return .vsBlue
        case "right", "slight_right": return .vsRed
        default: return .vsDarkGray
        }
    }
}
