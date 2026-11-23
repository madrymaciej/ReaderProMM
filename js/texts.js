// Teksty treningowe (oryginalne, napisane na potrzeby aplikacji).
// p = indeks akapitu, którego dotyczy pytanie (pytamy tylko o przeczytane akapity).

export const TEXTS = [
  {
    id: 'oczy',
    title: 'Jak oko czyta tekst',
    body: `Kiedy czytamy, mamy wrażenie, że wzrok płynnie sunie po linijce. W rzeczywistości oko porusza się skokami. Te szybkie skoki nazywa się sakkadami, a krótkie zatrzymania między nimi — fiksacjami. Informację odbieramy niemal wyłącznie podczas fiksacji. W trakcie sakkady obraz jest rozmyty, a mózg po prostu go ignoruje.

Typowa fiksacja trwa około jednej czwartej sekundy. W tym czasie ostro widzimy tylko niewielki fragment tekstu, bo za szczegóły odpowiada mały obszar siatkówki zwany dołkiem środkowym. Wszystko, co leży dalej od punktu fiksacji, widzimy coraz mniej wyraźnie. To jest widzenie peryferyjne. Choć nie pozwala ono przeczytać słowa, podpowiada mózgowi, gdzie zaczyna się kolejny wyraz i jak jest długi. Dzięki temu następna sakkada trafia we właściwe miejsce.

Na tempo czytania wpływają trzy rzeczy. Pierwsza to liczba fiksacji w linijce. Druga to czas każdej fiksacji. Trzecia to regresje, czyli powroty wzroku do tekstu, który już był przeczytany. Część regresji jest potrzebna, bo pomaga zrozumieć trudniejsze zdania. Wiele z nich wynika jednak z nawyku i braku skupienia.

Ćwiczenia szybkiego czytania celują właśnie w te elementy. Tablice Schulte’a i ćwiczenia widzenia sferycznego uczą korzystania z obrazu poza punktem fiksacji. Śledzenie punktu porządkuje ruchy oczu. Prezentacja słowo po słowie ogranicza regresje, bo nie ma do czego wracać. Trzeba jednak pamiętać o granicy. Badania nad czytaniem pokazują, że przy bardzo dużych prędkościach spada zrozumienie. Dlatego celem treningu jest szybsze czytanie z zachowaniem sensu, a nie samo przesuwanie wzroku po stronie.`,
    questions: [
      { p: 0, q: 'Kiedy oko odbiera informację z tekstu?', a: ['Głównie podczas fiksacji', 'Głównie podczas sakkad', 'Tak samo w obu fazach', 'Tylko przy regresjach'], ok: 0 },
      { p: 1, q: 'Do czego służy widzenie peryferyjne podczas czytania według tekstu?', a: ['Do czytania całych zdań naraz', 'Do planowania miejsca kolejnej sakkady', 'Do rozpoznawania kolorów', 'Do zapamiętywania treści'], ok: 1 },
      { p: 3, q: 'Co według tekstu dzieje się przy bardzo dużych prędkościach czytania?', a: ['Rośnie liczba fiksacji', 'Znikają sakkady', 'Spada zrozumienie', 'Wydłuża się każda fiksacja'], ok: 2 },
    ],
  },
  {
    id: 'papier',
    title: 'Krótka historia papieru',
    body: `Papier wydaje się dziś czymś zupełnie zwyczajnym, a jego historia liczy blisko dwa tysiące lat. Przyjmuje się, że wynaleziono go w Chinach. Tradycja łączy ten wynalazek z urzędnikiem dworu cesarskiego Cai Lunem, który na początku drugiego wieku naszej ery przedstawił cesarzowi metodę produkcji papieru z kory drzew, konopi, starych szmat i sieci rybackich. Znaleziska archeologiczne pokazują jednak, że prostsze odmiany papieru istniały w Chinach już wcześniej. Cai Lun najpewniej udoskonalił i upowszechnił technikę, którą znano przed nim.

Przez kilkaset lat sposób wytwarzania papieru pozostawał tajemnicą Wschodu. W ósmym wieku papiernie powstały w Samarkandzie, a później w Bagdadzie i innych miastach świata islamu. To tam papier zaczął wypierać droższy pergamin i papirus. Księgi stawały się tańsze, a biblioteki większe.

Do Europy technika dotarła przez Hiszpanię i Italię. W kolejnych stuleciach papiernie pojawiały się w wielu krajach, a podstawowym surowcem stały się lniane szmaty. Prawdziwym przełomem okazał się wiek piętnasty, kiedy Jan Gutenberg zastosował w Moguncji ruchomą czcionkę. Druk wymagał ogromnych ilości taniego materiału, a papier spełniał ten warunek znacznie lepiej niż pergamin.

W dziewiętnastym wieku nauczono się produkować papier z masy drzewnej. Dzięki temu stał się on dostępny na masową skalę i umożliwił rozwój gazet codziennych. Dziś, mimo ekranów, wciąż zużywamy go ogromne ilości, choć coraz częściej pochodzi z recyklingu.`,
    questions: [
      { p: 0, q: 'Z kim tradycja łączy wynalezienie papieru?', a: ['Z Gutenbergiem', 'Z Cai Lunem', 'Z kalifem Bagdadu', 'Z mnichami z Italii'], ok: 1 },
      { p: 1, q: 'W którym mieście, według tekstu, powstały papiernie w ósmym wieku?', a: ['W Moguncji', 'W Rzymie', 'W Samarkandzie', 'W Krakowie'], ok: 2 },
      { p: 3, q: 'Co w dziewiętnastym wieku umożliwiło masową produkcję papieru?', a: ['Masa drzewna', 'Papirus', 'Pergamin', 'Ruchoma czcionka'], ok: 0 },
    ],
  },
  {
    id: 'nawyk',
    title: 'Jak powstaje nawyk',
    body: `Każdy dzień składa się z setek drobnych czynności, które wykonujemy bez namysłu. Myjemy zęby, sięgamy po telefon, wybieramy tę samą drogę do pracy. Psychologowie opisują nawyk jako zachowanie uruchamiane automatycznie przez znany kontekst. Nie decydujemy o nim za każdym razem od nowa. Sytuacja sama podsuwa działanie.

Często mówi się o pętli złożonej z trzech elementów. Najpierw pojawia się wyzwalacz, na przykład pora dnia, miejsce albo emocja. Potem następuje zachowanie. Na końcu przychodzi nagroda, która sprawia, że następnym razem chętniej powtórzymy to samo. Im częściej pętla się zamyka, tym silniej wyzwalacz kojarzy się z działaniem.

Popularne twierdzenie, że nowy nawyk powstaje dokładnie w dwadzieścia jeden dni, nie ma solidnych podstaw. W jednym z bardziej znanych badań uczestnicy potrzebowali średnio około dwóch miesięcy, by nowe zachowanie stało się automatyczne. Rozrzut był jednak bardzo duży: u jednych trwało to kilka tygodni, u innych znacznie dłużej niż pół roku. Pojedynczy opuszczony dzień nie przekreślał postępów.

Z tej wiedzy wynika kilka praktycznych wskazówek. Warto łączyć nowe zachowanie z istniejącym wyzwalaczem, na przykład wykonywać krótkie ćwiczenie zaraz po porannej kawie. Dobrze jest zaczynać od wersji tak małej, że trudno ją pominąć. Pomaga też ułatwienie startu, czyli usunięcie przeszkód między wyzwalaczem a działaniem. Trening szybkiego czytania działa najlepiej właśnie wtedy, gdy jest codziennym, krótkim nawykiem, a nie rzadkim, długim wysiłkiem.`,
    questions: [
      { p: 1, q: 'Jakie są trzy elementy pętli nawyku opisane w tekście?', a: ['Plan, wysiłek, wynik', 'Wyzwalacz, zachowanie, nagroda', 'Cel, motywacja, kara', 'Pora, miejsce, emocja'], ok: 1 },
      { p: 2, q: 'Ile średnio trwało utrwalenie nawyku w badaniu przywołanym w tekście?', a: ['Dokładnie 21 dni', 'Około tygodnia', 'Około dwóch miesięcy', 'Ponad dwa lata'], ok: 2 },
      { p: 2, q: 'Co według tekstu dzieje się po jednym opuszczonym dniu?', a: ['Postępy zostają przekreślone', 'Trzeba zacząć od nowa', 'Nie przekreśla to postępów', 'Nawyk utrwala się szybciej'], ok: 2 },
    ],
  },
];
