import SwiftUI

// MARK: - AI Chat View

struct ChatView: View {
    @EnvironmentObject var appState: AppState
    @State private var inputText = ""
    @FocusState private var isInputFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Chat messages
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 16) {
                            // Context header
                            if let result = appState.analysisResult {
                                contextBanner(result)
                            }

                            // Welcome message
                            if appState.chatMessages.isEmpty {
                                welcomeMessage
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
                        .padding(16)
                    }
                    .onChange(of: appState.chatMessages.count) { _, _ in
                        if let last = appState.chatMessages.last {
                            withAnimation {
                                proxy.scrollTo(last.id, anchor: .bottom)
                            }
                        }
                    }
                }

                Divider()

                // Input bar
                inputBar
            }
            .background(Color.vsBackground)
            .navigationTitle("Ask AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        appState.showChat = false
                    }
                    .foregroundColor(.vsOrange)
                }
            }
        }
    }

    // MARK: - Context banner

    private func contextBanner(_ result: AnalysisResult) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "photo.fill")
                .foregroundColor(.vsOrange)
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

    // MARK: - Welcome

    private var welcomeMessage: some View {
        VStack(spacing: 12) {
            Image(systemName: "sparkles")
                .font(.largeTitle)
                .foregroundColor(.vsOrange)
            Text("Ask me about this screenshot")
                .font(.headline)
                .foregroundColor(.vsNavy)
            Text("I'll reference the sources we found to help you verify the claims.")
                .font(.subheadline)
                .foregroundColor(.vsDarkGray)
                .multilineTextAlignment(.center)

            // Quick question chips
            VStack(spacing: 8) {
                quickChip("Is this claim true?")
                quickChip("What are the main sources?")
                quickChip("Is there any bias?")
            }
        }
        .padding(.vertical, 20)
    }

    private func quickChip(_ text: String) -> some View {
        Button {
            inputText = text
            sendMessage()
        } label: {
            Text(text)
                .font(.subheadline)
                .foregroundColor(.vsNavy)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: .black.opacity(0.04), radius: 4, y: 2)
        }
    }

    // MARK: - Message bubble

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
                .clipShape(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .shadow(color: .black.opacity(message.role == .assistant ? 0.04 : 0), radius: 4, y: 2)

            if message.role == .assistant { Spacer(minLength: 60) }
        }
    }

    // MARK: - Typing indicator

    private var typingIndicator: some View {
        HStack {
            HStack(spacing: 4) {
                ForEach(0..<3) { i in
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

    // MARK: - Input bar

    private var inputBar: some View {
        HStack(spacing: 12) {
            TextField("Ask about this screenshot…", text: $inputText, axis: .vertical)
                .textFieldStyle(.plain)
                .lineLimit(1...4)
                .focused($isInputFocused)
                .onSubmit { sendMessage() }

            Button {
                sendMessage()
            } label: {
                Circle()
                    .fill(inputText.isEmpty ? Color.vsGray : Color.vsNavy)
                    .frame(width: 36, height: 36)
                    .overlay(
                        Image(systemName: "arrow.up")
                            .font(.body.bold())
                            .foregroundColor(inputText.isEmpty ? .vsDarkGray : .white)
                    )
            }
            .disabled(inputText.trimmingCharacters(in: .whitespaces).isEmpty || appState.isChatting)
        }
        .padding(12)
        .background(Color.white)
    }

    private func sendMessage() {
        let text = inputText.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { return }
        inputText = ""
        appState.sendChatMessage(text)
    }
}
