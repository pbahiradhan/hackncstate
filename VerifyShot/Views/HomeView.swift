import SwiftUI
import PhotosUI

// MARK: - Home Screen (inline chat + ChatGPT-style input bar)

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var detector = ScreenshotDetector()
    @State private var searchText = ""
    @State private var showAttachmentMenu = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var pendingImage: UIImage? // attached but not yet sent
    @State private var showScreenshotAlert = false
    @FocusState private var isSearchFocused: Bool

    private var isInChatMode: Bool {
        !appState.chatMessages.isEmpty || appState.isChatting
    }

    private let suggestions = [
        "Verify COVID claim from recent news",
        "Recent social post about tax laws",
        "Check authenticity of viral image",
    ]

    var body: some View {
        ZStack {
            Color.vsBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Nav bar
                navBar

                if isInChatMode {
                    // CHAT MODE — messages scroll in-place
                    chatContent
                } else {
                    // HOME MODE — sun, greeting, suggestions
                    homeContent
                }

                // Search bar with tags (always at bottom)
                searchBarSection
                    .padding(.horizontal, 16)
                    .padding(.bottom, 100)
            }

            // Loading overlay
            if appState.isAnalyzing {
                loadingOverlay
            }

            // Screenshot detected banner
            if showScreenshotAlert {
                screenshotDetectedBanner
            }
        }
        .navigationBarHidden(true)
        .onChange(of: detector.latestScreenshot) { _, newImage in
            if let img = newImage {
                // Show the in-app banner instead of auto-analyzing
                pendingImage = img
                showScreenshotAlert = true
                // Auto-dismiss after 5 seconds
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
        .sheet(isPresented: $appState.showDeepResearch) {
            DeepResearchView()
                .environmentObject(appState)
        }
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

    // MARK: - Nav Bar

    private var navBar: some View {
        HStack {
            if isInChatMode {
                Button {
                    withAnimation(.easeInOut(duration: 0.25)) {
                        appState.clearChat()
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                        Text("New Chat")
                    }
                    .font(.body.weight(.medium))
                    .foregroundColor(.vsNavy)
                }
            } else {
                Button { } label: {
                    Image(systemName: "chevron.left")
                        .font(.title3.weight(.medium))
                        .foregroundColor(.vsNavy)
                }
            }
            Spacer()

            if isInChatMode && appState.isDeepResearchMode {
                Text("Deep Research")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.vsOrange)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
    }

    // MARK: - Home Content (sun + greeting + suggestions)

    private var homeContent: some View {
        VStack(spacing: 0) {
            Spacer()

            // Orange sun graphic
            ZStack {
                Circle()
                    .fill(
                        RadialGradient(
                            colors: [Color.vsOrangeLight.opacity(0.5), Color.clear],
                            center: .center,
                            startRadius: 60,
                            endRadius: 160
                        )
                    )
                    .frame(width: 300, height: 300)

                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.vsOrangeLight, Color.vsOrange],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 180, height: 180)
                    .shadow(color: .vsOrange.opacity(0.3), radius: 20, y: 10)
            }

            // Greeting
            Text("Hey, What are you\nlooking for today?")
                .font(.system(size: 26, weight: .bold))
                .multilineTextAlignment(.center)
                .foregroundColor(.vsNavy)
                .padding(.top, 24)

            Spacer()

            // Suggestion chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(suggestions, id: \.self) { suggestion in
                        Button {
                            searchText = suggestion
                            isSearchFocused = true
                        } label: {
                            Text(suggestion)
                                .font(.subheadline)
                                .foregroundColor(.vsNavy)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 12)
                                .background(Color.vsGray)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }
                .padding(.horizontal, 20)
            }
            .padding(.bottom, 16)
        }
    }

    // MARK: - Chat Content (messages scroll inline)

    private var chatContent: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 16) {
                    // Context banner if analysis exists
                    if let result = appState.analysisResult {
                        contextBanner(result)
                    }

                    // Messages
                    ForEach(appState.chatMessages) { msg in
                        messageBubble(msg)
                            .id(msg.id)
                    }

                    // Typing indicator
                    if appState.isChatting {
                        typingIndicator
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 8)
            }
            .onChange(of: appState.chatMessages.count) { _, _ in
                if let last = appState.chatMessages.last {
                    withAnimation {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }

    private func contextBanner(_ result: AnalysisResult) -> some View {
        HStack(spacing: 12) {
            if let img = appState.screenshotImage {
                Image(uiImage: img)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(width: 36, height: 36)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
            } else {
                Image(systemName: "photo.fill")
                    .foregroundColor(.vsOrange)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text("Screenshot Context Active")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.vsNavy)
                Text("\(result.claims.count) claim(s) • \(result.aggregateTrustScore)% trust")
                    .font(.caption2)
                    .foregroundColor(.vsDarkGray)
            }
            Spacer()
        }
        .padding(12)
        .background(Color.vsOrange.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func messageBubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.role == .user { Spacer(minLength: 60) }

            Text(message.content)
                .font(.body)
                .foregroundColor(message.role == .user ? .white : .primary)
                .padding(14)
                .background(
                    message.role == .user
                        ? AnyShapeStyle(Color.vsNavy)
                        : AnyShapeStyle(Color.white)
                )
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(message.role == .assistant ? 0.04 : 0), radius: 4, y: 2)

            if message.role == .assistant { Spacer(minLength: 60) }
        }
    }

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3, id: \.self) { _ in
                    Circle()
                        .fill(Color.vsDarkGray)
                        .frame(width: 8, height: 8)
                        .opacity(0.6)
                }
            }
            .padding(14)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            Spacer(minLength: 60)
        }
    }

    // MARK: - Search Bar with Tags

    private var searchBarSection: some View {
        VStack(spacing: 0) {
            VStack(spacing: 6) {
                // Tags row (deep research pill + screenshot thumbnail)
                if appState.isDeepResearchMode || pendingImage != nil {
                    HStack(spacing: 8) {
                        if appState.isDeepResearchMode {
                            deepResearchPill
                        }
                        if let img = pendingImage {
                            screenshotThumbnail(img)
                        }
                        Spacer()
                    }
                    .padding(.top, 2)
                }

                // Input row: [+] [text field] [↑]
                HStack(spacing: 10) {
                    // "+" button
                    Button { showAttachmentMenu = true } label: {
                        Circle()
                            .fill(Color.vsNavy)
                            .frame(width: 38, height: 38)
                            .overlay(
                                Image(systemName: "plus")
                                    .font(.body.bold())
                                    .foregroundColor(.white)
                            )
                    }

                    // Text field
                    TextField("Ask anything", text: $searchText)
                        .font(.body)
                        .foregroundColor(.vsNavy)
                        .focused($isSearchFocused)
                        .submitLabel(.send)
                        .onSubmit { send() }

                    // Send button
                    Button { send() } label: {
                        Circle()
                            .fill(canSend ? Color.vsNavy : Color.vsGray)
                            .frame(width: 38, height: 38)
                            .overlay(
                                Image(systemName: "arrow.up")
                                    .font(.body.bold())
                                    .foregroundColor(canSend ? .white : .vsDarkGray)
                            )
                    }
                    .disabled(!canSend)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, (appState.isDeepResearchMode || pendingImage != nil) ? 10 : 8)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
            .shadow(color: .black.opacity(0.08), radius: 10, y: 3)
        }
    }

    private var canSend: Bool {
        !searchText.trimmingCharacters(in: .whitespaces).isEmpty || pendingImage != nil
    }

    // MARK: - Tags

    private var deepResearchPill: some View {
        HStack(spacing: 4) {
            Image(systemName: "sparkle.magnifyingglass")
                .font(.caption2)
            Text("Deep Research")
                .font(.caption.weight(.medium))
            Button {
                appState.isDeepResearchMode = false
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.vsOrange.opacity(0.12))
        .foregroundColor(.vsOrange)
        .clipShape(Capsule())
    }

    private func screenshotThumbnail(_ img: UIImage) -> some View {
        HStack(spacing: 6) {
            Image(uiImage: img)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 22, height: 22)
                .clipShape(RoundedRectangle(cornerRadius: 4))
            Text("Screenshot")
                .font(.caption.weight(.medium))
            Button {
                pendingImage = nil
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.caption)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(Color.vsBlue.opacity(0.12))
        .foregroundColor(.vsBlue)
        .clipShape(Capsule())
    }

    // MARK: - Attachment Menu (ChatGPT-style bottom sheet)

    private var attachmentMenu: some View {
        VStack(spacing: 0) {
            // Top row: Photos + Screenshots
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

            Divider()
                .padding(.horizontal, 20)

            // List options
            VStack(spacing: 0) {
                // Deep Research
                Button {
                    showAttachmentMenu = false
                    appState.isDeepResearchMode = true
                } label: {
                    menuRow(
                        icon: "sparkle.magnifyingglass",
                        iconColor: .vsOrange,
                        title: "Deep Research",
                        subtitle: "Thorough multi-source analysis"
                    )
                }

                // Standard Search
                Button {
                    showAttachmentMenu = false
                    appState.isDeepResearchMode = false
                    isSearchFocused = true
                } label: {
                    menuRow(
                        icon: "magnifyingglass",
                        iconColor: .vsBlue,
                        title: "Standard Search",
                        subtitle: "Quick fact-check and verification"
                    )
                }
            }

            Spacer()
        }
        .presentationDetents([.fraction(0.42)])
        .presentationDragIndicator(.visible)
    }

    private func menuRow(icon: String, iconColor: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundColor(iconColor)
                .frame(width: 32, height: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(.semibold))
                    .foregroundColor(.vsNavy)
                Text(subtitle)
                    .font(.caption)
                    .foregroundColor(.vsDarkGray)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.vsDarkGray)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    // MARK: - Loading Overlay

    private var loadingOverlay: some View {
        ZStack {
            Color.black.opacity(0.3).ignoresSafeArea()
            VStack(spacing: 16) {
                ProgressView()
                    .scaleEffect(1.5)
                    .tint(.white)
                Text(appState.progressText.isEmpty ? "Analyzing screenshot…" : appState.progressText)
                    .font(.headline)
                    .foregroundColor(.white)
            }
            .padding(32)
            .background(.ultraThinMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 20))
        }
    }

    // MARK: - Actions

    private func send() {
        // If image attached → analyze the screenshot
        if let image = pendingImage {
            pendingImage = nil
            searchText = ""
            isSearchFocused = false
            appState.analyzeScreenshot(image)
            return
        }

        // Otherwise → text query (inline chat)
        let text = searchText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        searchText = ""
        isSearchFocused = false

        if isInChatMode {
            appState.sendChatMessage(text)
        } else {
            appState.startTextQuery(text)
        }
    }

    private func loadPhoto(from item: PhotosPickerItem) {
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                // Show as thumbnail — don't analyze yet
                pendingImage = image
            }
        }
    }
}
