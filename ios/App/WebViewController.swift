import UIKit
import WebKit

/// Aplikacja webowa „Szybkie czytanie” w WKWebView + most do funkcji natywnych:
/// przekazywanie tekstów z rozszerzenia „Udostępnij”, blokada wygaszania ekranu, eksport kopii danych.
final class WebViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    static let appHost = "madrymaciej.github.io"
    static let appURL = URL(string: "https://madrymaciej.github.io/SzybkieCzytanie/")!

    private var webView: WKWebView!
    private var pageLoaded = false

    override func loadView() {
        let config = WKWebViewConfiguration()
        // Tylko domena aplikacji (Info.plist: WKAppBoundDomains) — dzięki temu działa service worker i tryb offline.
        config.limitsNavigationsToAppBoundDomains = true
        config.allowsInlineMediaPlayback = true
        config.userContentController.add(WeakMessageHandler(self), name: "native")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.isInspectable = true // Safari → Programowanie: podgląd konsoli na Macu
        view = webView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView.load(URLRequest(url: Self.appURL))
        NotificationCenter.default.addObserver(self, selector: #selector(appBecameActive),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc private func appBecameActive() { deliverSharedItems() }

    /// Przekaż oczekujące teksty z rozszerzenia do biblioteki w aplikacji webowej.
    private func deliverSharedItems() {
        guard pageLoaded else { return }
        let items = SharedInbox.all()
        guard !items.isEmpty,
              let data = try? JSONEncoder().encode(items),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.ReaderBridge && window.ReaderBridge.importShared(\(json));", completionHandler: nil)
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        pageLoaded = true
        deliverSharedItems()
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // Linki do innych stron otwieraj w Safari.
        if let url = navigationAction.request.url, let host = url.host, host != Self.appHost,
           url.scheme == "http" || url.scheme == "https" {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate (alert / confirm / prompt z JavaScriptu)

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Anuluj", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Anuluj", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    // MARK: - Wiadomości z JavaScriptu: window.webkit.messageHandlers.native.postMessage({...})

    fileprivate func handle(_ body: Any) {
        guard let msg = body as? [String: Any], let type = msg["type"] as? String else { return }
        switch type {
        case "imported":
            SharedInbox.remove(ids: msg["ids"] as? [String] ?? [])
        case "wake":
            UIApplication.shared.isIdleTimerDisabled = (msg["on"] as? Bool) ?? false
        case "export":
            guard let name = msg["name"] as? String, let json = msg["json"] as? String else { return }
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)
            do {
                try json.write(to: url, atomically: true, encoding: .utf8)
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = view
                share.popoverPresentationController?.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                present(share, animated: true)
            } catch {
                print("Eksport nieudany: \(error)")
            }
        default:
            break
        }
    }
}

/// Słabe odwołanie — WKUserContentController trzyma handler mocno, co inaczej tworzy cykl referencji.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WebViewController?
    init(_ target: WebViewController) { self.target = target }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.handle(message.body)
    }
}
