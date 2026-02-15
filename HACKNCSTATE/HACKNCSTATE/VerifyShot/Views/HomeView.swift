import SwiftUI
import PhotosUI

// MARK: - Analysis Hub (Home Tab)
// Beautiful analysis-focused home screen:
//   • Upload state → hero branding + upload buttons
//   • Analyzing state → animated progress
//   • Results state → full inline analysis display

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var detector: ScreenshotDetector
    @Environment(\.colorScheme) var colorScheme
    @State private var showAttachmentMenu = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var pendingImage: UIImage?
    @State private var showScreenshotAlert = false
    @State private var isCheckingLatestScreenshot = false
    @State private var showShareSheet = false

    var body: some View {
        ZStack {
            Color.vsBackground.ignoresSafeArea()

            if appState.isAnalyzing {
                // ── ANALYZING STATE ──
                analyzingView
            } else if let result = appState.analysisResult {
                // ── RESULTS STATE ──
                analysisResultView(result)
            } else {
                // ── UPLOAD STATE ──
                uploadView
            }

            // Error alert
            if let error = appState.analysisError {
                errorBanner(error)
            }

            // Screenshot detected banner
            if showScreenshotAlert {
                screenshotDetectedBanner
            }
        }
        .navigationBarHidden(true)
        .onChange(of: detector.latestScreenshot) { _, newImage in
            if let img = newImage {
                pendingImage = img
                showScreenshotAlert = true
                detector.latestScreenshot = nil
                DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                    showScreenshotAlert = false
                }
            }
        }
        .onChange(of: selectedPhotoItem) { _, item in
            if let item {
                loadPhoto(from: item)
            }
        }
        .sheet(isPresented: $showAttachmentMenu) {
            attachmentMenu
        }
    }

    // ═══════════════════════════════════════════════
    //  UPLOAD STATE — Hero branding + action buttons
    // ═══════════════════════════════════════════════

    private var uploadView: some View {
        VStack(spacing: 0) {
            Spacer()

            // Branding
            VStack(spacing: 16) {
                // Shield icon
                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [Color.vsOrangeLight.opacity(0.4), Color.clear],
                                center: .center,
                                startRadius: 40,
                                endRadius: 120
                            )
                        )
                        .frame(width: 220, height: 220)

                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color.vsOrangeLight, Color.vsOrange],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 110, height: 110)
                            .shadow(color: .vsOrange.opacity(0.35), radius: 20, y: 8)

                        Image(systemName: "checkmark.shield.fill")
                            .font(.system(size: 44))
                            .foregroundColor(.white)
                    }
                }

                VStack(spacing: 8) {
                    Text("VerifyShot")
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundColor(.primary)

                    Text("Upload a screenshot to verify claims\nwith AI-powered fact-checking")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }
            }

            Spacer()

            // Action buttons
            VStack(spacing: 12) {
                // Check Latest Screenshot
                Button {
                    isCheckingLatestScreenshot = true
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    Task {
                        await appState.analyzeLatestScreenshot()
                        isCheckingLatestScreenshot = false
                    }
                } label: {
                    HStack(spacing: 10) {
                        if isCheckingLatestScreenshot {
                            ProgressView()
                                .progressViewStyle(.circular)
                                .scaleEffect(0.8)
                                .tint(.vsOrange)
                        } else {
                            Image(systemName: "camera.viewfinder")
                                .font(.body.weight(.semibold))
                        }
                        Text(isCheckingLatestScreenshot ? "Checking…" : "Check Latest Screenshot")
                            .font(.subheadline.weight(.semibold))
                    }
                    .foregroundColor(.vsOrange)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.vsOrange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .disabled(isCheckingLatestScreenshot)

                // Upload Screenshot
                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    showAttachmentMenu = true
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title3)
                        Text("Upload Screenshot")
                            .font(.headline)
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(
                        LinearGradient(
                            colors: [Color.vsNavy, Color.vsNavy.opacity(0.85)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .shadow(color: .vsNavy.opacity(0.2), radius: 10, y: 4)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 110)
        }
    }

    // ═══════════════════════════════════════════════
    //  ANALYZING STATE — Animated progress
    // ═══════════════════════════════════════════════

    private var analyzingView: some View {
        VStack(spacing: 24) {
            Spacer()

            // Screenshot preview
            if let img = appState.screenshotImage {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 100, height: 100)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.vsOrange.opacity(0.3), lineWidth: 2)
                    )
                    .shadow(color: .vsOrange.opacity(0.2), radius: 12, y: 4)
            }

            VStack(spacing: 12) {
                ProgressView()
                    .scaleEffect(1.2)
                    .tint(.vsOrange)

                Text(appState.progressText.isEmpty ? "Analyzing screenshot…" : appState.progressText)
                    .font(.headline)
                    .foregroundColor(.primary)
                    .animation(.easeInOut(duration: 0.3), value: appState.progressText)

                Text("This may take a moment")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()
        }
    }

    // ═══════════════════════════════════════════════
    //  RESULTS STATE — Full inline analysis display
    // ═══════════════════════════════════════════════

    private func analysisResultView(_ result: AnalysisResult) -> some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                // ── Header: Screenshot + Trust Score ──
                resultHeader(result)

                // ── Verdict Banner ──
                verdictBanner(result)

                // ── Quick Summary ──
                summaryCard(result.summary)

                // ── Claims Breakdown ──
                if !result.claims.isEmpty {
                    claimsSection(result.claims)
                }

                // ── Source Verification ──
                sourceSection(allSources(from: result.claims))

                // ── Bias Detection ──
                if let firstClaim = result.claims.first {
                    BiasSlider(bias: firstClaim.biasSignals)
                        .padding(.horizontal, 20)
                }

                // ── Model Consensus ──
                if let firstClaim = result.claims.first, !firstClaim.modelVerdicts.isEmpty {
                    ModelConsensusSection(verdicts: firstClaim.modelVerdicts)
                        .padding(.horizontal, 20)
                }

                // ── Actions ──
                actionButtons(result)

                // Bottom padding for tab bar
                Spacer(minLength: 120)
            }
            .padding(.top, 8)
        }
    }

    // MARK: - Result Header (Screenshot + Trust Gauge side by side)

    private func resultHeader(_ result: AnalysisResult) -> some View {
        VStack(spacing: 16) {
            // Top bar with "New Analysis" and "Share" buttons
            HStack {
                // Share button
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    showShareSheet = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.caption)
                        Text("Share")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundColor(.vsBlue)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.vsBlue.opacity(0.1))
                    .clipShape(Capsule())
                }
                .sheet(isPresented: $showShareSheet) {
                    ShareSheet(result: result, screenshotImage: appState.screenshotImage)
                }

                Spacer()

                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    appState.resetForNewScreenshot()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.caption)
                        Text("New Analysis")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundColor(.vsOrange)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.vsOrange.opacity(0.1))
                    .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 20)

            HStack(spacing: 20) {
                // Screenshot thumbnail
                if let img = appState.screenshotImage {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 90, height: 90)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(Color(uiColor: .separator), lineWidth: 1)
                        )
                        .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
                } else {
                    RoundedRectangle(cornerRadius: 14)
                        .fill(Color(uiColor: .tertiarySystemFill))
                        .frame(width: 90, height: 90)
                        .overlay(
                            Image(systemName: "photo")
                                .font(.title2)
                                .foregroundColor(.secondary)
                        )
                }

                // Trust score gauge (compact)
                TrustScoreGauge(
                    score: result.aggregateTrustScore,
                    label: trustDisplayLabel(result.aggregateTrustScore)
                )
                .scaleEffect(0.7)
                .frame(width: 150, height: 150)
            }
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Verdict Banner

    private func verdictBanner(_ result: AnalysisResult) -> some View {
        let score = result.aggregateTrustScore
        let color: Color = score >= 75 ? .vsGreen : (score >= 40 ? .vsYellow : .vsRed)
        let icon = score >= 75 ? "checkmark.seal.fill" : (score >= 40 ? "exclamationmark.triangle.fill" : "xmark.seal.fill")

        return HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title2)
                .foregroundColor(color)

            VStack(alignment: .leading, spacing: 3) {
                Text(result.trustLabel)
                    .font(.headline)
                    .foregroundColor(.primary)

                if let firstClaim = result.claims.first, !firstClaim.modelVerdicts.isEmpty {
                    Text("Verified by \(firstClaim.modelVerdicts.count) AI models • \(result.claims.count) claim\(result.claims.count == 1 ? "" : "s") analyzed")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }

            Spacer()
        }
        .padding(16)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(color.opacity(0.2), lineWidth: 1)
        )
        .padding(.horizontal, 20)
    }

    // MARK: - Quick Summary

    private func summaryCard(_ summary: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "sparkles")
                    .foregroundColor(.vsOrange)
                Text("Quick Summary")
                    .font(.headline)
                    .foregroundColor(.primary)
            }

            Text(summary)
                .font(.body)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .lineSpacing(3)
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
            HStack(spacing: 6) {
                Image(systemName: "list.bullet.clipboard.fill")
                    .foregroundColor(.vsNavy)
                Text("CLAIMS ANALYZED")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.secondary)
                    .tracking(1)
            }
            .padding(.horizontal, 20)

            ForEach(claims) { claim in
                claimCard(claim)
                    .padding(.horizontal, 20)
            }
        }
    }

    private func claimCard(_ claim: Claim) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Image(systemName: verdictIcon(claim.verdict))
                    .foregroundColor(verdictColor(claim.verdict))
                    .font(.body.weight(.semibold))

                Text(claim.text)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.primary)
                    .lineLimit(3)

                Spacer()
            }

            HStack(spacing: 10) {
                // Trust pill
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
                    .lineSpacing(2)
            }
        }
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }

    // MARK: - Source Verification

    private func allSources(from claims: [Claim]) -> [Source] {
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
            HStack(spacing: 6) {
                Image(systemName: "link.circle.fill")
                    .foregroundColor(.vsBlue)
                Text("SOURCE VERIFICATION")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.secondary)
                    .tracking(1)
            }
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

    // MARK: - Action Buttons (at bottom of results)

    private func actionButtons(_ result: AnalysisResult) -> some View {
        VStack(spacing: 12) {
            // Ask AI about this
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                appState.enterChatFromResults()
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .font(.body)
                    Text("Ask AI About This")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.vsNavy)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .shadow(color: .vsNavy.opacity(0.15), radius: 8, y: 3)
            }

            // Deep research
            Button {
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                appState.isDeepResearchMode = true
                appState.enterChatFromResults()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.body)
                    Text("Deep Research")
                        .font(.subheadline.weight(.semibold))
                }
                .foregroundColor(.vsOrange)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Color.vsOrange.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: - Attachment Menu

    private var attachmentMenu: some View {
        VStack(spacing: 0) {
            HStack(spacing: 16) {
                PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                    VStack(spacing: 8) {
                        Image(systemName: "photo.on.rectangle.angled")
                            .font(.title2)
                            .foregroundColor(.white)
                        Text("Photos")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 90, height: 90)
                    .background(Color(.systemGray3))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
                .onChange(of: selectedPhotoItem) { _, newItem in
                    if newItem != nil { showAttachmentMenu = false }
                }

                PhotosPicker(selection: $selectedPhotoItem, matching: .screenshots) {
                    VStack(spacing: 8) {
                        Image(systemName: "camera.viewfinder")
                            .font(.title2)
                            .foregroundColor(.white)
                        Text("Screenshots")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.white)
                    }
                    .frame(width: 90, height: 90)
                    .background(Color(.systemGray3))
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            .padding(.top, 28)
            .padding(.bottom, 20)
        }
        .presentationDetents([.fraction(0.3)])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Screenshot Detected Banner

    private var screenshotDetectedBanner: some View {
        VStack {
            HStack(spacing: 12) {
                Image(systemName: "camera.viewfinder")
                    .font(.title2)
                    .foregroundColor(.white)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Screenshot Detected!")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("Tap to analyze with AI")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                }

                Spacer()

                Button {
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    showScreenshotAlert = false
                    if let img = pendingImage {
                        appState.analyzeScreenshot(img)
                        pendingImage = nil
                    }
                } label: {
                    Text("Analyze")
                        .font(.subheadline.bold())
                        .foregroundColor(.vsNavy)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.white)
                        .clipShape(Capsule())
                }

                Button {
                    showScreenshotAlert = false
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.vsNavy)
                    .shadow(color: .black.opacity(0.3), radius: 16, y: 8)
            )
            .padding(.horizontal, 20)
            .padding(.top, 8)

            Spacer()
        }
        .transition(.move(edge: .top).combined(with: .opacity))
        .animation(.spring(response: 0.4), value: showScreenshotAlert)
        .zIndex(100)
    }

    // MARK: - Error Banner (with retry button)

    private func errorBanner(_ error: String) -> some View {
        VStack {
            Spacer()

            VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.white)
                    .font(.title3)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Analysis Failed")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text(error)
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                        .lineLimit(3)
                }

                Spacer()

                Button {
                    appState.analysisError = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.title3)
                        .foregroundColor(.white.opacity(0.7))
                    }
                }

                // Retry button
                if appState.screenshotImage != nil {
                    Button {
                        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                        appState.analysisError = nil
                        if let img = appState.screenshotImage {
                            appState.analyzeScreenshot(img)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "arrow.clockwise")
                                .font(.caption.weight(.bold))
                            Text("Try Again")
                                .font(.subheadline.weight(.semibold))
                        }
                        .foregroundColor(.vsRed)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }
            .padding(16)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.vsRed)
                    .shadow(color: .black.opacity(0.3), radius: 16, y: 8)
            )
            .padding(.horizontal, 20)
            .padding(.bottom, 120)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .animation(.spring(response: 0.4), value: appState.analysisError != nil)
        .zIndex(99)
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

    // MARK: - Photo Loading

    private func loadPhoto(from item: PhotosPickerItem) {
        Task {
            do {
                if let data = try await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        appState.analyzeScreenshot(image)
                    }
                } else {
                    await MainActor.run {
                        appState.analysisError = "Failed to load image. Please try selecting the photo again."
                    }
                    print("[HomeView] Failed to load photo")
                }
            } catch {
                print("[HomeView] Photo loading error: \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 200_000_000)
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                    await MainActor.run {
                        appState.analyzeScreenshot(image)
                    }
                } else {
                    await MainActor.run {
                        appState.analysisError = "Unable to load image. Please try again."
                    }
                }
            }
        }
    }
}

// MARK: - Share Sheet (renders analysis as shareable content)

struct ShareSheet: UIViewControllerRepresentable {
    let result: AnalysisResult
    let screenshotImage: UIImage?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        var items: [Any] = []

        // Build share text
        let trustEmoji = result.aggregateTrustScore >= 75 ? "✅" : (result.aggregateTrustScore >= 40 ? "⚠️" : "🚫")
        var text = "\(trustEmoji) VerifyShot Analysis: \(result.trustLabel) (\(result.aggregateTrustScore)%)\n\n"
        text += "📝 \(result.summary)\n\n"

        for (i, claim) in result.claims.enumerated() {
            let icon = claim.verdict == "likely_true" ? "✅" : (claim.verdict == "likely_misleading" ? "❌" : "❓")
            text += "\(icon) Claim \(i + 1): \(claim.text) — \(claim.trustScore)%\n"
        }

        text += "\nAnalyzed by VerifyShot AI"
        items.append(text)

        // Attach the screenshot if available
        if let img = screenshotImage {
            items.append(img)
        }

        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        return vc
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
