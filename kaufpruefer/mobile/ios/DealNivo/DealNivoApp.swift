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

final class WebModel: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate {
    static let base = URL(string: "https://dealnivo.onrender.com")!
    static let appGroup = "group.de.dealnivo.app"
    let webView: WKWebView

    override init() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default() // Login bleibt erhalten
        cfg.allowsInlineMediaPlayback = true
        cfg.applicationNameForUserAgent = "DealNivoApp/1.0" // Server erkennt die App
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(reload), for: .valueChanged)
        webView.scrollView.refreshControl = refresh
        webView.load(URLRequest(url: Self.base))
        consumePendingShare()
    }

    @objc private func reload() {
        webView.reload()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) { self.webView.scrollView.refreshControl?.endRefreshing() }
    }

    /// Eigene Seiten (und Stripe-Bezahlseite) in der App, alles andere in Safari.
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme else { return decisionHandler(.cancel) }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return decisionHandler(.allow) }
        if scheme == "dealnivo" { handleDeepLink(url); return decisionHandler(.cancel) }
        let host = url.host ?? ""
        let inApp = scheme == "https" && (host == Self.base.host || host == "stripe.com" || host.hasSuffix(".stripe.com"))
        let mainFrame = action.targetFrame?.isMainFrame ?? true
        // Eingebettete Inhalte (iframes, z. B. Stripe) laufen in der Seite; nur Hauptseiten-Wechsel prüfen
        if inApp || !mainFrame { return decisionHandler(.allow) }
        if scheme == "https" || scheme == "http" || scheme == "mailto" || scheme == "tel" {
            UIApplication.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    /// Links mit target="_blank": eigene im selben Fenster, fremde in Safari.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if url.host == Self.base.host { webView.load(action.request) } else { UIApplication.shared.open(url) }
        }
        return nil
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
        UserDefaults(suiteName: Self.appGroup)?.removeObject(forKey: "pendingShareInbox")
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
