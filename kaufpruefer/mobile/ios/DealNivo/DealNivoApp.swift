import SwiftUI
import WebKit

/// Schlanker nativer Rahmen um die DEAL-NIVO-Web-App.
/// Aufgaben: Web-App anzeigen, geteilte Inhalte der Share Extension (App Group)
/// übernehmen und Deep Links `dealnivo://teilen?...` öffnen.
/// Enthält keine API-Schlüssel – alle Prüfungen laufen serverseitig.
@main
struct DealNivoApp: App {
    @Environment(\.scenePhase) private var phase
    @StateObject private var model = WebModel()

    var body: some Scene {
        WindowGroup {
            WebView(model: model)
                .ignoresSafeArea(edges: .bottom)
                .onOpenURL { model.handleDeepLink($0) }
                .onChange(of: phase) { _, p in if p == .active { model.consumePendingShare() } }
        }
    }
}

final class WebModel: ObservableObject {
    static let base = URL(string: "https://dealnivo.onrender.com")!
    static let appGroup = "group.de.dealnivo.app"
    let webView: WKWebView

    init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default() // Login bleibt erhalten
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.allowsBackForwardNavigationGestures = true
        webView.load(URLRequest(url: Self.base))
        consumePendingShare()
    }

    /// Übernimmt einen von der Share Extension hinterlegten Teilen-Eingang (max. 30 min alt).
    func consumePendingShare() {
        guard let d = UserDefaults(suiteName: Self.appGroup),
              let inbox = d.string(forKey: "pendingShareInbox"),
              inbox.range(of: "^sh_[a-z0-9]{6,32}$", options: .regularExpression) != nil else { return }
        let at = d.double(forKey: "pendingShareAt")
        d.removeObject(forKey: "pendingShareInbox")
        d.removeObject(forKey: "pendingShareAt")
        guard Date().timeIntervalSince1970 - at < 30 * 60 else { return }
        var c = URLComponents(url: Self.base.appendingPathComponent("teilen"), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "inbox", value: inbox)]
        webView.load(URLRequest(url: c.url!))
    }

    /// dealnivo://teilen?url=… → https://…/teilen?url=… (nur bekannte Parameter)
    func handleDeepLink(_ url: URL) {
        guard url.scheme == "dealnivo", url.host == "teilen" else { return }
        let incoming = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var c = URLComponents(url: Self.base.appendingPathComponent("teilen"), resolvingAgainstBaseURL: false)!
        c.queryItems = incoming.filter { ["url", "text", "title", "inbox"].contains($0.name) }
        webView.load(URLRequest(url: c.url!))
    }
}

struct WebView: UIViewRepresentable {
    @ObservedObject var model: WebModel
    func makeUIView(context: Context) -> WKWebView { model.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
