import SwiftUI

// MARK: - ChatGPT-Style Chat View

struct ChatView: View {
    @EnvironmentObject var appState: AppState
    @Environment(\.colorScheme) var colorScheme
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    private var hasAnalysisContext: Bool {
        appState.analysisResult != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            // Messages scroll view
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        // Context banner (when screenshot analyzed) - at top
                        if let result = appState.analysisResult {
                            contextBanner(result)
                                .padding(.top, 8)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 16)
                        }

                        // Welcome message (only if no messages yet)
                        if appState.chatMessages.isEmpty {
                            welcomeMessage
                                .padding(.top, 40)
                                .padding(.horizontal, 16)
                                .padding(.bottom, 20)
                        }

                        // Messages
                        ForEach(appState.chatMessages) { msg in
                            messageRow(msg)
                                .id(msg.id)
                        }

                        // Research steps (shown as inline assistant messages during deep research)
                        if appState.isDeepResearchMode && !appState.researchSteps.isEmpty && appState.isChatting {
                            researchStepsInline
                        }

                        // Typing indicator (Standard mode)
                        if appState.isChatting && !appState.isDeepResearchMode {
                            typingIndicatorRow
                        }

                        // Bottom padding for input bar
                        Color.clear
                            .frame(height: 20)
                            .id("bottom")
                    }
                }
                .onChange(of: appState.chatMessages.count) { _, _ in
                    scrollToBottom(proxy: proxy)
                }
                .onChange(of: appState.isChatting) { _, _ in
                    if !appState.isChatting {
                        scrollToBottom(proxy: proxy)
                    }
                }
            }

            // Input bar (always at bottom)
            inputBar
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(
                    Group {
                        if colorScheme == .dark {
                            Color(uiColor: .systemBackground)
                        } else {
                            Color(uiColor: .systemBackground)
                        }
                    }
                )
                // SafeAreaInset removed — it can produce NaN in CoreGraphics with zero-height frames
        }
        .background(
            Group {
                if colorScheme == .dark {
                    Color(uiColor: .systemBackground)
                } else {
                    Color(uiColor: .systemBackground)
                }
            }
        )
        .navigationTitle("VerifyShot")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    appState.clearChat()
                } label: {
                    Text("Clear")
                        .foregroundColor(.vsOrange)
                }
            }
        }
    }

    // MARK: - Scroll Helper

    private func scrollToBottom(proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.3)) {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }

    // MARK: - Context Banner (tap to go back to analysis on Home tab)

    private func contextBanner(_ result: AnalysisResult) -> some View {
        Button {
            appState.selectedTab = .home
        } label: {
            HStack(spacing: 12) {
                // Screenshot thumbnail
                if let img = appState.screenshotImage {
                    Image(uiImage: img)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(width: 40, height: 40)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(uiColor: .secondarySystemBackground))
                        .frame(width: 40, height: 40)
                        .overlay(
                            Image(systemName: "photo")
                                .foregroundColor(.secondary)
                        )
                }

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Image(systemName: "brain.head.profile")
                            .font(.caption2)
                            .foregroundColor(.vsOrange)
                        Text("Analysis Context Active")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(.primary)
                    }
                    HStack(spacing: 6) {
                        Text("\(result.aggregateTrustScore)%")
                            .font(.caption.weight(.bold))
                            .foregroundColor(.forTrustScore(result.aggregateTrustScore))
                        Text("•")
                            .foregroundColor(.secondary)
                        Text("\(result.claims.count) claim\(result.claims.count == 1 ? "" : "s") in memory")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }

                Spacer()

                Image(systemName: "arrow.left")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.vsOrange)
            }
            .padding(12)
            .background(
                LinearGradient(
                    colors: [Color.vsOrange.opacity(0.05), Color(uiColor: .secondarySystemBackground)],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.vsOrange.opacity(0.15), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Welcome Message

    private var welcomeMessage: some View {
        VStack(spacing: 20) {
            // VerifyShot icon
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 48))
                .foregroundColor(.vsOrange)

            VStack(spacing: 8) {
                Text("Welcome to VerifyShot")
                    .font(.title2.bold())
                    .foregroundColor(.primary)

                if hasAnalysisContext {
                    Text("Ask me about your screenshot analysis")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Upload a screenshot or ask me to verify any claim")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
            }

            // Suggestion chips
            VStack(spacing: 8) {
                if hasAnalysisContext {
                    quickChip("Is this claim true?")
                    quickChip("What are the main sources?")
                    quickChip("Is there any bias?")
                } else {
                    quickChip("Is this news real?")
                    quickChip("Check a health claim")
                    quickChip("Verify a statistic")
                }
            }
            .padding(.top, 8)
        }
    }

    private func quickChip(_ text: String) -> some View {
        Button {
            inputText = text
            sendMessage()
        } label: {
            Text(text)
                .font(.subheadline)
                .foregroundColor(.primary)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color(uiColor: .secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    // MARK: - Message Row (ChatGPT style)

    private func messageRow(_ message: ChatMessage) -> some View {
        HStack(alignment: .top, spacing: 12) {
            if message.role == .assistant {
                // Assistant avatar (left side)
                assistantAvatar
            }

            VStack(alignment: message.role == .user ? .trailing : .leading, spacing: 4) {
                // Message bubble
                Text(message.content)
                    .font(.body)
                    .foregroundColor(message.role == .user ? .white : .primary)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(
                        message.role == .user
                            ? Color.vsNavy
                            : Color(uiColor: .secondarySystemBackground)
                    )
                    .clipShape(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                    )
            }
            .frame(maxWidth: .infinity, alignment: message.role == .user ? .trailing : .leading)

            if message.role == .user {
                // User avatar (right side)
                userAvatar
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private var assistantAvatar: some View {
        ZStack {
            Circle()
                .fill(Color.vsOrange.opacity(0.15))
                .frame(width: 32, height: 32)
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: 16))
                .foregroundColor(.vsOrange)
        }
    }

    private var userAvatar: some View {
        ZStack {
            Circle()
                .fill(Color.vsNavy.opacity(0.15))
                .frame(width: 32, height: 32)
            Image(systemName: "person.fill")
                .font(.system(size: 16))
                .foregroundColor(.vsNavy)
        }
    }

    // MARK: - Research Steps Inline (shown as assistant messages)

    private var researchStepsInline: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(appState.researchSteps.enumerated()), id: \.element.id) { index, step in
                researchStepRow(step: step, index: index)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    private func researchStepRow(step: ResearchStep, index: Int) -> some View {
        HStack(alignment: .top, spacing: 12) {
            assistantAvatar

            HStack(spacing: 10) {
                // Icon
                ZStack {
                    Circle()
                        .fill(step.isComplete ? Color.vsGreen.opacity(0.15) : Color.vsOrange.opacity(0.15))
                        .frame(width: 24, height: 24)
                    
                    if step.isComplete {
                        Image(systemName: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.vsGreen)
                    } else {
                        Image(systemName: step.icon)
                            .font(.system(size: 12))
                            .foregroundColor(.vsOrange)
                    }
                }

                Text(step.title)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Color(uiColor: .secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .animation(
                .spring(response: 0.5, dampingFraction: 0.7).delay(step.delay),
                value: step.isComplete
            )
            .opacity(step.isComplete || step.delay == 0 ? 1 : 0.3)
            .offset(y: step.isComplete || step.delay == 0 ? 0 : 6)
        }
    }

    // MARK: - Typing Indicator

    private var typingIndicatorRow: some View {
        HStack(alignment: .top, spacing: 12) {
            assistantAvatar

            HStack(spacing: 4) {
                ForEach(0..<3) { i in
                    Circle()
                        .fill(Color.secondary)
                        .frame(width: 8, height: 8)
                        .opacity(0.6)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color(uiColor: .secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Input Bar (ChatGPT style)

    private var inputBar: some View {
        VStack(spacing: 8) {
            // Mode toggle (subtle, above input)
            if appState.chatMessages.isEmpty || appState.chatMessages.count == 1 {
                modeToggle
            }

            HStack(spacing: 12) {
                // Deep research indicator (subtle)
                if appState.isDeepResearchMode {
                    Button {
                        appState.isDeepResearchMode.toggle()
                    } label: {
                        Image(systemName: "sparkle.magnifyingglass")
                            .font(.system(size: 16))
                            .foregroundColor(.vsOrange)
                            .padding(8)
                            .background(Color.vsOrange.opacity(0.1))
                            .clipShape(Circle())
                    }
                }

                // Text field
                TextField(
                    hasAnalysisContext ? "Ask about this screenshot…" : "Message VerifyShot…",
                    text: $inputText,
                    axis: .vertical
                )
                .textFieldStyle(.plain)
                .font(.body)
                .lineLimit(1...6)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color(uiColor: .secondarySystemBackground))
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .focused($isInputFocused)
                .onSubmit {
                    if canSendChat {
                        sendMessage()
                    }
                }

                // Send button
                Button {
                    sendMessage()
                } label: {
                    ZStack {
                        Circle()
                            .fill(canSendChat ? Color.vsOrange : Color(uiColor: .tertiarySystemFill))
                            .frame(width: 32, height: 32)
                        Image(systemName: "arrow.up")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(canSendChat ? .white : .secondary)
                    }
                }
                .disabled(!canSendChat)
            }
        }
    }

    private var modeToggle: some View {
        HStack(spacing: 8) {
            Button {
                appState.isDeepResearchMode = false
            } label: {
                Text("Standard")
                    .font(.caption)
                    .foregroundColor(appState.isDeepResearchMode ? .secondary : .vsOrange)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        appState.isDeepResearchMode
                            ? Color.clear
                            : Color.vsOrange.opacity(0.1)
                    )
                    .clipShape(Capsule())
            }

            Button {
                appState.isDeepResearchMode = true
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "sparkle.magnifyingglass")
                        .font(.system(size: 10))
                    Text("Deep Research")
                        .font(.caption)
                }
                .foregroundColor(appState.isDeepResearchMode ? .vsOrange : .secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    appState.isDeepResearchMode
                        ? Color.vsOrange.opacity(0.1)
                        : Color.clear
                )
                .clipShape(Capsule())
            }
        }
    }

    private var canSendChat: Bool {
        !inputText.trimmingCharacters(in: .whitespaces).isEmpty && !appState.isChatting
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        inputText = ""
        isInputFocused = false
        appState.sendChatMessage(text)
    }
}
