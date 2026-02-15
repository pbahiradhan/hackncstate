import SwiftUI

extension Color {
    // Brand palette — accent colors stay the same in both modes
    static let vsOrange      = Color(red: 0.96, green: 0.65, blue: 0.14)
    static let vsOrangeLight = Color(red: 0.99, green: 0.85, blue: 0.55)
    static let vsGreen       = Color(red: 0.20, green: 0.78, blue: 0.35)
    static let vsRed         = Color(red: 1.00, green: 0.23, blue: 0.19)
    static let vsYellow      = Color(red: 1.00, green: 0.80, blue: 0.00)
    static let vsBlue        = Color(red: 0.22, green: 0.45, blue: 0.84)

    // Semantic colors — adapt to dark mode
    static let vsNavy     = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.90, green: 0.92, blue: 0.96, alpha: 1)  // light text in dark mode
            : UIColor(red: 0.10, green: 0.17, blue: 0.30, alpha: 1)  // dark text in light mode
    })

    static let vsGray = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.20, green: 0.20, blue: 0.22, alpha: 1)
            : UIColor(red: 0.96, green: 0.96, blue: 0.97, alpha: 1)
    })

    static let vsDarkGray = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.70, green: 0.70, blue: 0.72, alpha: 1)
            : UIColor(red: 0.58, green: 0.58, blue: 0.60, alpha: 1)
    })

    static let vsBackground = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor.systemBackground
            : UIColor(red: 0.98, green: 0.98, blue: 0.99, alpha: 1)
    })

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
