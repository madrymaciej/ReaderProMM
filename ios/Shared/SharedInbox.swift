import Foundation

/// Skrzynka we wspólnym katalogu aplikacji i rozszerzenia (App Group).
/// Rozszerzenie „Udostępnij” zapisuje tu teksty; aplikacja przy uruchomieniu przekazuje je do biblioteki.
enum SharedInbox {
    static let groupID = "group.com.madrymaciej.szybkieczytanie"

    struct Item: Codable {
        var id: String = UUID().uuidString
        var title: String = ""
        var text: String? = nil
        var html: String? = nil
        var url: String? = nil
        var created: Double = Date().timeIntervalSince1970
    }

    enum InboxError: LocalizedError {
        case noContainer
        var errorDescription: String? { "Brak wspólnego katalogu aplikacji (App Group). Sprawdź podpisywanie w Xcode." }
    }

    static var directory: URL? {
        guard let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) else { return nil }
        let dir = base.appendingPathComponent("Inbox", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func save(_ item: Item) throws {
        guard let dir = directory else { throw InboxError.noContainer }
        let data = try JSONEncoder().encode(item)
        try data.write(to: dir.appendingPathComponent("\(item.id).json"), options: .atomic)
    }

    static func all() -> [Item] {
        guard let dir = directory,
              let files = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return files
            .filter { $0.pathExtension == "json" }
            .compactMap { url -> Item? in
                guard let data = try? Data(contentsOf: url) else { return nil }
                return try? JSONDecoder().decode(Item.self, from: data)
            }
            .sorted { $0.created < $1.created }
    }

    static func remove(ids: [String]) {
        guard let dir = directory else { return }
        for id in ids { try? FileManager.default.removeItem(at: dir.appendingPathComponent("\(id).json")) }
    }
}
