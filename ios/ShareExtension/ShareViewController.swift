import UIKit
import UniformTypeIdentifiers

/// Rozszerzenie „Udostępnij”: zapisuje artykuł / link / tekst do wspólnej skrzynki.
/// Aplikacja „Szybkie czytanie” przy następnym otwarciu dodaje go do biblioteki i otwiera w czytniku.
final class ShareViewController: UIViewController {
    private let titleLabel = UILabel()
    private let statusLabel = UILabel()
    private let spinner = UIActivityIndicatorView(style: .large)

    override func viewDidLoad() {
        super.viewDidLoad()
        buildUI()
        Task { await run() }
    }

    private func buildUI() {
        view.backgroundColor = UIColor.black.withAlphaComponent(0.35)
        let card = UIView()
        card.backgroundColor = .systemBackground
        card.layer.cornerRadius = 18
        card.translatesAutoresizingMaskIntoConstraints = false
        titleLabel.text = "Szybkie czytanie"
        titleLabel.font = .preferredFont(forTextStyle: .headline)
        statusLabel.text = "Zapisywanie…"
        statusLabel.numberOfLines = 0
        statusLabel.textAlignment = .center
        statusLabel.textColor = .secondaryLabel
        spinner.startAnimating()
        let stack = UIStackView(arrangedSubviews: [titleLabel, spinner, statusLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(stack)
        view.addSubview(card)
        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            card.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            card.widthAnchor.constraint(equalToConstant: 290),
            stack.topAnchor.constraint(equalTo: card.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -22),
            stack.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -18),
        ])
    }

    @MainActor private func show(_ text: String, done: Bool) {
        spinner.stopAnimating()
        spinner.isHidden = true
        statusLabel.text = text
        statusLabel.textColor = done ? .label : .systemRed
    }

    private func run() async {
        do {
            let item = try await extractItem()
            try SharedInbox.save(item)
            show("Zapisano w Bibliotece ✓\nOtwórz „Szybkie czytanie”, aby czytać.", done: true)
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            extensionContext?.completeRequest(returningItems: nil)
        } catch {
            show("Nie udało się zapisać.\n\(error.localizedDescription)", done: false)
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            extensionContext?.cancelRequest(withError: error)
        }
    }

    enum ShareError: LocalizedError {
        case nothing
        var errorDescription: String? { "Nie znaleziono tekstu ani linku do zapisania." }
    }

    private static let userAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    private func wordCount(_ s: String) -> Int { s.split(whereSeparator: { $0.isWhitespace }).count }

    private func fetchPage(_ url: URL) async throws -> SharedInbox.Item {
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
        let (data, _) = try await URLSession.shared.data(for: request)
        let html = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
        return SharedInbox.Item(title: "", html: html, url: url.absoluteString)
    }

    private func extractItem() async throws -> SharedInbox.Item {
        let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }

        // 1) Safari: wynik GetArticle.js (artykuł wyciągnięty z otwartej strony, także po zalogowaniu).
        let plist = UTType.propertyList.identifier
        for provider in providers where provider.hasItemConformingToTypeIdentifier(plist) {
            if let dict = try? await provider.loadItem(forTypeIdentifier: plist) as? NSDictionary,
               let result = dict[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any] {
                let title = result["title"] as? String ?? ""
                let url = result["url"] as? String
                if let text = result["text"] as? String, wordCount(text) >= 20 {
                    return SharedInbox.Item(title: title, text: text, url: url)
                }
                if let html = result["html"] as? String, !html.isEmpty {
                    return SharedInbox.Item(title: title, html: html, url: url)
                }
            }
        }

        // 2) Link (z dowolnej aplikacji) — pobierz stronę; artykuł wyciągnie aplikacja.
        let urlType = UTType.url.identifier
        for provider in providers where provider.hasItemConformingToTypeIdentifier(urlType) {
            if let url = try? await provider.loadItem(forTypeIdentifier: urlType) as? URL,
               url.scheme == "http" || url.scheme == "https" {
                return try await fetchPage(url)
            }
        }

        // 3) Zwykły tekst (zaznaczony / skopiowany). Jeśli to sam link — pobierz stronę.
        let textType = UTType.plainText.identifier
        for provider in providers where provider.hasItemConformingToTypeIdentifier(textType) {
            if let text = try? await provider.loadItem(forTypeIdentifier: textType) as? String {
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.contains(" "), let url = URL(string: trimmed), url.scheme == "http" || url.scheme == "https" {
                    return try await fetchPage(url)
                }
                if !trimmed.isEmpty {
                    let firstLine = trimmed.split(separator: "\n").first.map(String.init) ?? ""
                    return SharedInbox.Item(title: String(firstLine.prefix(70)), text: trimmed)
                }
            }
        }
        throw ShareError.nothing
    }
}
