import UIKit
import UniformTypeIdentifiers

/// DEAL-NIVO Share Extension
///
/// Nimmt geteilte URLs, Texte und Bilder aus anderen Apps (eBay, Kleinanzeigen,
/// mobile.de, AutoScout24, Vinted …) entgegen und übergibt sie an DEAL-NIVO:
///
/// 1. Inhalte werden per HTTPS an den öffentlichen Teilen-Eingang
///    `POST /share-target` gesendet (derselbe Endpunkt wie das PWA-Share-Target).
///    Der Server antwortet mit einer Weiterleitung auf `/teilen?inbox=<id>`.
/// 2. Die Inbox-ID wird über die App Group an die Haupt-App übergeben.
/// 3. Die Haupt-App öffnet beim nächsten Start/Vordergrund `/teilen?inbox=<id>`.
///
/// Sicherheit: Die Extension enthält KEINE API-Schlüssel. Der Eingang ist
/// kurzlebig (30 min), einmalig abholbar und startet keine kostenpflichtige
/// Analyse – der Nutzer bestätigt in der App.
final class ShareViewController: UIViewController {
    static let baseURL = URL(string: "https://dealnivo.onrender.com")!
    static let appGroup = "group.de.dealnivo.app"
    static let maxImages = 8

    private let statusLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        statusLabel.text = "Wird an DEAL-NIVO übergeben …"
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(statusLabel)
        NSLayoutConstraint.activate([
            statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            statusLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            statusLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
        ])
        Task { await handleShare() }
    }

    private func handleShare() async {
        var url: String?
        var texts: [String] = []
        var images: [Data] = []

        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            if let title = item.attributedContentText?.string, !title.isEmpty { texts.append(title) }
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let u = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL,
                   u.scheme == "https" || u.scheme == "http" {
                    url = url ?? u.absoluteString
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let t = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String {
                    texts.append(t)
                } else if images.count < Self.maxImages, provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
                    if let data = await loadImageData(provider) { images.append(data) }
                }
            }
        }

        do {
            let inbox = try await upload(url: url, text: texts.joined(separator: "\n"), images: images)
            let defaults = UserDefaults(suiteName: Self.appGroup)
            defaults?.set(inbox, forKey: "pendingShareInbox")
            defaults?.set(Date().timeIntervalSince1970, forKey: "pendingShareAt")
            let opened = await MainActor.run { openMainApp(inbox: inbox) }
            await MainActor.run {
                statusLabel.text = opened ? "Öffne DEAL-NIVO …" : "Fertig! Öffne DEAL-NIVO, um die Prüfung zu starten."
            }
            try? await Task.sleep(nanoseconds: opened ? 400_000_000 : 1_200_000_000)
            extensionContext?.completeRequest(returningItems: nil)
        } catch {
            await MainActor.run { statusLabel.text = "Übergabe fehlgeschlagen. Bitte kopiere den Link und füge ihn in DEAL-NIVO ein." }
            try? await Task.sleep(nanoseconds: 1_800_000_000)
            extensionContext?.cancelRequest(withError: error)
        }
    }

    /// Öffnet die Haupt-App direkt (dealnivo://teilen?inbox=…). Klappt das nicht,
    /// übernimmt die App den Eingang beim nächsten Öffnen aus der App Group.
    @MainActor
    private func openMainApp(inbox: String) -> Bool {
        guard let url = URL(string: "dealnivo://teilen?inbox=\(inbox)") else { return false }
        var responder: UIResponder? = self
        while let r = responder {
            if let app = r as? UIApplication {
                app.open(url, options: [:], completionHandler: nil)
                return true
            }
            responder = r.next
        }
        return false
    }

    private func loadImageData(_ provider: NSItemProvider) async -> Data? {
        if let u = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier) as? URL, let d = try? Data(contentsOf: u) {
            return Self.jpeg(d)
        }
        if let img = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier) as? UIImage {
            return img.jpegData(compressionQuality: 0.85)
        }
        return nil
    }

    /// Neukodierung als JPEG (max. 2000 px) – entfernt nebenbei EXIF/GPS-Daten.
    private static func jpeg(_ data: Data) -> Data? {
        guard let img = UIImage(data: data) else { return nil }
        let maxSide: CGFloat = 2000
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let resized = UIGraphicsImageRenderer(size: size).image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }
        return resized.jpegData(compressionQuality: 0.85)
    }

    /// Sendet die Inhalte als multipart/form-data und liest die Inbox-ID aus der Weiterleitung.
    private func upload(url: String?, text: String, images: [Data]) async throws -> String {
        let boundary = "dn-\(UUID().uuidString)"
        var body = Data()
        func field(_ name: String, _ value: String) {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
        }
        if let url { field("url", url) }
        if !text.isEmpty { field("text", String(text.prefix(4000))) }
        for (i, img) in images.enumerated() {
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"files\"; filename=\"bild\(i).jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(img)
            body.append("\r\n".data(using: .utf8)!)
        }
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)

        var req = URLRequest(url: Self.baseURL.appendingPathComponent("share-target"))
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        req.httpBody = body
        req.timeoutInterval = 60

        let session = URLSession(configuration: .ephemeral, delegate: NoRedirect(), delegateQueue: nil)
        let (_, response) = try await session.data(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 303,
              let location = http.value(forHTTPHeaderField: "Location"),
              let comps = URLComponents(string: location),
              let inbox = comps.queryItems?.first(where: { $0.name == "inbox" })?.value,
              inbox.range(of: "^sh_[a-z0-9]{6,32}$", options: .regularExpression) != nil
        else { throw URLError(.badServerResponse) }
        return inbox
    }
}

/// Weiterleitungen nicht folgen – wir brauchen nur den Location-Header.
private final class NoRedirect: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}
