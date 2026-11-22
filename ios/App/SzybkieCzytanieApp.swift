import SwiftUI

@main
struct SzybkieCzytanieApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer().ignoresSafeArea()
        }
    }
}

struct WebContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController { WebViewController() }
    func updateUIViewController(_ controller: WebViewController, context: Context) {}
}
