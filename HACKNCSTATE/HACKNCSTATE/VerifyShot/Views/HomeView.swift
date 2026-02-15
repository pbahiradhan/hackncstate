import SwiftUI
import PhotosUI

// MARK: - Simplified Home Screen (Image Upload Only)

struct HomeView: View {
    @EnvironmentObject var appState: AppState
    @StateObject private var detector = ScreenshotDetector()
    @State private var showAttachmentMenu = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var pendingImage: UIImage?
    @State private var showScreenshotAlert = false

    var body: some View {
        ZStack {
            Color.vsBackground.ignoresSafeArea()

            VStack(spacing: 0) {
                // Nav bar
                navBar

                // Main content
                mainContent

                // Upload button (always at bottom)
                uploadButton
                    .padding(.horizontal, 20)
                    .padding(.bottom, 100)
            }

            // Loading overlay
            if appState.isAnalyzing {
                loadingOverlay
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

    // MARK: - Nav Bar

    private var navBar: some View {
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
    }

    // MARK: - Main Content

    private var mainContent: some View {
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
            Text("Upload a screenshot\nto verify claims")
                .font(.system(size: 26, weight: .bold))
                .multilineTextAlignment(.center)
                .foregroundColor(.vsNavy)
                .padding(.top, 24)

            Spacer()
        }
    }

    // MARK: - Upload Button

    private var uploadButton: some View {
        Button {
            showAttachmentMenu = true
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                Text("Upload Screenshot")
                    .font(.headline)
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color.vsNavy)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        }
    }

    // MARK: - Attachment Menu

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

    // MARK: - Loading Overlay (Enhanced with Progress Steps)

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

    // MARK: - Error Banner

    private func errorBanner(_ error: String) -> some View {
        VStack {
            Spacer()

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

    // MARK: - Actions

    private func loadPhoto(from item: PhotosPickerItem) {
        Task {
            do {
                // Try loading as Data first (most reliable)
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        appState.analyzeScreenshot(image)
                    }
                    return
                }
                
                // Fallback: Try loading as UIImage directly
                if let image = try? await item.loadTransferable(type: UIImage.self) {
                    await MainActor.run {
                        appState.analyzeScreenshot(image)
                    }
                    return
                }
                
                // If both fail, show error
                await MainActor.run {
                    appState.analysisError = "Failed to load image. Please try selecting the photo again."
                }
                print("[HomeView] Failed to load photo from PhotosPickerItem")
            } catch {
                // The bookmark error is often harmless - try to continue anyway
                print("[HomeView] Photo loading error (may be harmless): \(error.localizedDescription)")
                
                // Try one more time with a slight delay
                try? await Task.sleep(nanoseconds: 100_000_000) // 0.1 seconds
                
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    await MainActor.run {
                        appState.analyzeScreenshot(image)
                    }
                } else {
                    await MainActor.run {
                        appState.analysisError = "Could not load image. The bookmark error is usually harmless - please try again."
                    }
                }
            }
        }
    }
}
