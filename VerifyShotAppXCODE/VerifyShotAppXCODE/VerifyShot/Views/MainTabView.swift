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

            // Custom bottom bar
            CustomTabBar(selected: $appState.selectedTab)
        }
        .edgesIgnoringSafeArea(.bottom)
    }
}

// MARK: - Custom Tab Bar

struct CustomTabBar: View {
    @Binding var selected: AppState.Tab

    var body: some View {
        HStack {
            Spacer()
            tabButton(icon: "house.fill", label: "Home", tab: .home)
            Spacer()

            // Center search button → results
            Button {
                selected = .results
            } label: {
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

            tabButton(icon: "clock.fill", label: "History", tab: .history)
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

// MARK: - Empty Results placeholder

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

// MARK: - History View

struct HistoryView: View {
    @EnvironmentObject var appState: AppState

    var body: some View {
        Group {
            if appState.history.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 12) {
                        ForEach(appState.history) { result in
                            HistoryRow(result: result)
                                .onTapGesture {
                                    appState.analysisResult = result
                                    appState.selectedTab = .results
                                }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 120)
                }
            }
        }
        .background(Color.vsBackground)
        .navigationTitle("History")
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "clock")
                .font(.system(size: 48))
                .foregroundColor(.vsDarkGray)
            Text("No history yet")
                .font(.title3.weight(.medium))
                .foregroundColor(.vsDarkGray)
            Text("Your past analyses will appear here")
                .font(.subheadline)
                .foregroundColor(.gray)
        }
    }
}

// MARK: - History Row

struct HistoryRow: View {
    let result: AnalysisResult

    private var formattedDate: String {
        let iso = result.generatedAt
        if iso.count >= 10 { return String(iso.prefix(10)) }
        return iso
    }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color.forTrustScore(result.aggregateTrustScore).opacity(0.15))
                    .frame(width: 52, height: 52)
                Text("\(result.aggregateTrustScore)%")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.forTrustScore(result.aggregateTrustScore))
            }

            VStack(alignment: .leading, spacing: 4) {
                Text(result.claims.first?.text ?? "Analysis")
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.vsNavy)
                    .lineLimit(2)

                HStack(spacing: 8) {
                    Text(result.trustLabel)
                        .font(.caption.weight(.semibold))
                        .foregroundColor(.forTrustScore(result.aggregateTrustScore))
                    Text("•")
                        .foregroundColor(.vsDarkGray)
                    Text(formattedDate)
                        .font(.caption)
                        .foregroundColor(.vsDarkGray)
                }
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.vsDarkGray)
        }
        .padding(16)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 2)
    }
}
