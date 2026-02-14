import SwiftUI

struct MainTabView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        ZStack(alignment: .bottom) {
            TabView(selection: $appState.selectedTab) {
                NavigationStack {
                    HomeView()
                }
                .tag(AppState.Tab.home)

                NavigationStack {
                    if appState.analysisResult != nil {
                        AnalysisResultView()
                    } else {
                        EmptyResultsView()
                    }
                }
                .tag(AppState.Tab.results)

                NavigationStack {
                    HistoryView()
                }
                .tag(AppState.Tab.history)
            }
            .tint(.vsOrange)

            // Custom bottom bar (matches screenshot)
            CustomTabBar(selected: $appState.selectedTab)
        }
        .edgesIgnoringSafeArea(.bottom)
    }
}

// MARK: - Custom Tab Bar (matches screenshot design)

struct CustomTabBar: View {
    @Binding var selected: AppState.Tab

    var body: some View {
        HStack {
            // Home
            Spacer()
            tabButton(icon: "house.fill", label: "Home", tab: .home)
            Spacer()

            // Center search button
            Button {} label: {
                ZStack {
                    Circle()
                        .fill(Color.vsNavy)
                        .frame(width: 56, height: 56)
                        .shadow(color: .black.opacity(0.2), radius: 8, y: 4)
                    Image(systemName: "magnifyingglass")
                        .font(.title2.bold())
                        .foregroundColor(.white)
                }
            }
            .offset(y: -16)

            Spacer()

            // Results / History
            tabButton(
                icon: selected == .results ? "chart.bar.fill" : "clock.fill",
                label: selected == .results ? "Results" : "History",
                tab: selected == .results ? .results : .history
            )
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 28)
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.08), radius: 12, y: -4)
        )
    }

    private func tabButton(icon: String, label: String, tab: AppState.Tab) -> some View {
        Button {
            selected = tab
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                Text(label)
                    .font(.caption2)
            }
            .foregroundColor(selected == tab ? .vsOrange : .gray)
        }
    }
}

// MARK: - Placeholders

struct EmptyResultsView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "doc.text.magnifyingglass")
                .font(.system(size: 48))
                .foregroundColor(.vsDarkGray)
            Text("No analysis yet")
                .font(.title3.weight(.medium))
                .foregroundColor(.vsDarkGray)
            Text("Upload or take a screenshot to get started")
                .font(.subheadline)
                .foregroundColor(.gray)
        }
        .navigationTitle("Results")
    }
}

struct HistoryView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "clock")
                .font(.system(size: 48))
                .foregroundColor(.vsDarkGray)
            Text("History coming soon")
                .font(.title3.weight(.medium))
                .foregroundColor(.vsDarkGray)
        }
        .navigationTitle("History")
    }
}
