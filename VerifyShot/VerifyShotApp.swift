import SwiftUI
import Photos

@main
struct VerifyShotApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            MainTabView()
                .environmentObject(appState)
                .onAppear {
                    // Request photo library access
                    PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in }
                }
        }
    }
}
