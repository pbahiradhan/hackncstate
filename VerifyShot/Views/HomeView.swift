import SwiftUI
import PhotosUI

// MARK: - Home Screen (Screenshot 1 from design)

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var detector = ScreenshotDetector()
    @State private var showPhotoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var searchText = ""
    @State private var isAIMode = true

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
                HStack {
                    Button { } label: {
                        Image(systemName: "chevron.left")
                            .font(.title3.weight(.medium))
                            .foregroundColor(.vsNavy)
                    }
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)

                Spacer()

                // Orange sun graphic
                ZStack {
                    // Glow
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

                    // Sun circle
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
                .padding(.bottom, 12)

                // "Start searching" label
                HStack {
                    Text("Start searching")
                        .font(.subheadline)
                        .foregroundColor(.vsDarkGray)
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 8)

                // Search bar (matches screenshot)
                searchBar
                    .padding(.horizontal, 16)
                    .padding(.bottom, 100) // room for tab bar
            }

            // Loading overlay
            if appState.isAnalyzing {
                loadingOverlay
            }
        }
        .navigationBarHidden(true)
        .onChange(of: detector.latestScreenshot) { _, newImage in
            if let img = newImage {
                appState.analyzeScreenshot(img)
            }
        }
        .onChange(of: selectedPhotoItem) { _, item in
            if let item {
                loadPhoto(from: item)
            }
        }
    }

    // MARK: - Search bar component

    private var searchBar: some View {
        HStack(spacing: 12) {
            // Photo picker button
            PhotosPicker(selection: $selectedPhotoItem, matching: .screenshots) {
                Image(systemName: "photo.badge.plus")
                    .font(.title3)
                    .foregroundColor(.vsNavy)
                    .frame(width: 40, height: 40)
                    .background(Color.vsGray)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }

            // Mode toggles
            HStack(spacing: 0) {
                modeButton("AI Mode", icon: "sparkles", active: isAIMode) {
                    isAIMode = true
                }
                modeButton("Standard", icon: "magnifyingglass", active: !isAIMode) {
                    isAIMode = false
                }
            }

            Spacer()

            // Send / analyze button
            Button {
                if let img = appState.screenshotImage {
                    appState.analyzeScreenshot(img)
                }
            } label: {
                Circle()
                    .fill(Color.vsNavy)
                    .frame(width: 40, height: 40)
                    .overlay(
                        Image(systemName: "arrow.up")
                            .font(.body.bold())
                            .foregroundColor(.white)
                    )
            }
        }
        .padding(12)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
    }

    private func modeButton(_ label: String, icon: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.caption)
                Text(label)
                    .font(.subheadline.weight(.medium))
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(active ? Color.vsOrange.opacity(0.12) : Color.clear)
            .foregroundColor(active ? .vsOrange : .gray)
            .clipShape(Capsule())
        }
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

    // MARK: - Load photo from picker

    private func loadPhoto(from item: PhotosPickerItem) {
        Task {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                appState.analyzeScreenshot(image)
            }
        }
    }
}
