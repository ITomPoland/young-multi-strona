# YOUNG MULTI — scenariusz storytellingowej przebudowy

> Status: plan / pre-produkcja. Nic z tego nie jest jeszcze zaimplementowane.
> Drugi plik: [PRODUKCJA.md](PRODUKCJA.md) — stack, architektura, brief assetów 3D (Blender), budżety wydajności i kolejność prac.

---

## 0. Idea w jednym zdaniu

**Jedno ciągłe ujęcie kamery.** Zaczynamy w pokoju z kafelkami, przebijamy się przez ścianę, odkrywamy dyskografię ukrytą za nią, a na końcu okazuje się, że cały ten świat był odbiciem w okularach Multiego. Odjeżdżamy od jego twarzy (O mnie), widzimy całą sylwetkę i zostaje tylko koszulka (sklep).

Strona nie składa się z sekcji, tylko z **rozdziałów jednego filmu**, a scroll działa jak przewijanie taśmy. Działa w obie strony: scroll w górę cofa film klatka po klatce.

### Spinające motywy (dlaczego to się "klei")

| Motyw | Gdzie wraca |
|---|---|
| **Pył** | Multi rozpada się w pył (S1), pył zostaje wciągnięty w pęknięcia ściany (S2). Na końcu reszta Multiego znika tym samym pyłem i zostaje koszulka (S7). Historia zaczyna się i kończy tym samym efektem. |
| **Kafelek** | Ściana z kafelków to granica między "teraz" (nowy singiel) a "przeszłością" (albumy za ścianą). Kafelek z singlem to fragment tej granicy. |
| **Światło przez dziurę** | Za ścianą jest ciemno, a jedynym źródłem światła jest dziura do pokoju. Albumy są oświetlone tym światłem. |
| **Bayer dither / turkus** | Wygląd hero (4×4 Bayer, 3 poziomy, paleta `#080A0C → #284650 → #C2D6E0`) zostaje globalnym post-processem całej historii. Wszystko wygląda jak jeden materiał, a przy okazji wybacza low-poly modele (patrz PRODUKCJA.md). |
| **LOST MEDIA** | Singiel jest z albumu LOST MEDIA (11.12.2026). Ostatni "album" na karuzeli to zapowiedź LOST MEDIA. Opowieść zatacza koło: przeszłość → zapowiedź przyszłości. |

---

## 1. Mapa przestrzeni (widok z góry)

```
                         ŚCIANA Z KAFELKAMI
   POKÓJ (hero)          ║                     PUSTKA ZA ŚCIANĄ (dyskografia)
                         ║
   [kamera S0] ──► ──► ──╬══► (dziura) ──►  ⟲ obrót 180°
       ▲                 ║                     ╭───────────╮
   Multi (znika S1)      ║                    │  o  album  o │   ← pierścień albumów
                         ║                    │ o  [kam S5] o │      wokół kamery
   kafelki lecą ◄────────╢                    │  o    o    o │
   w stronę kamery (S2)  ║                     ╰───────────╯
                         ║                    patrzymy z powrotem na dziurę
                         ║                    i oświetlony pokój za nią

   ─────────────── CIĘCIE NIEWIDOCZNE (render target) ───────────────

   STUDIO (czarne tło, turkusowy rim light)
        [kamera S6] ──odjazd──► głowa Multiego ──odjazd──► cała sylwetka (S7)
        (zaczyna się "w" soczewce okularów)
```

Pokój + ściana + pustka to **jedna scena 3D**. Studio z Multim to **druga scena**. Łączy je trik z odbiciem w okularach: pierwsza scena jest renderowana do tekstury, a ta tekstura jest szkłem okularów w drugiej scenie (szczegóły w S6).

---

## 2. Timeline (budżet scrolla)

Długości podane w `vh` scrolla. Wartości startowe do strojenia na żywo. W kodzie trzymamy je w jednym pliku konfiguracyjnym (`story.config.js`), a nie w procentach rozsianych po komponentach jak teraz.

| # | Rozdział | Długość | Narastająco | Treść/CTA | Kotwica w menu |
|---|---|---|---|---|---|
| S0 | Hero, spoczynek | 0 (ekran startowy) | 0 | YOUNG MULTI | `home` |
| S1 | Multi znika, kamera rusza | 100vh | 100 | — | |
| S2 | Pęknięcia → wybuch ściany | 120vh | 220 | — | |
| S3 | Kafelek-singiel (slow-mo) + **HOLD** | 160vh | 380 | ZA KAŻDYM RA2EM, streamingi, teledysk | `nowa-piosenka` |
| S4 | Wlot w dziurę + obrót 180° | 120vh | 500 | — | |
| S5 | Karuzela albumów (4 + zapowiedź) | 5 × 80vh = 400vh | 900 | tytuł, rok, linki | `dyskografia` |
| S6 | Odbicie w okularach → głowa → O mnie + **HOLD** | 220vh | 1120 | tekst o mnie, interakcja z głową | `o-mnie` |
| S7 | Sylwetka → koszulka → Selected Goods | 120vh + 3 × 80vh = 360vh | 1480 | produkty, ceny, sklep | `merch` |
| S8 | Kontakt | zwykły scroll | — | kontakt, social | `kontakt` |

**HOLD** = fragment, w którym animacja prawie stoi, żeby dało się przeczytać treść i kliknąć. Bez holdów storytelling zamienia się w pokaz slajdów, przez który nie da się nic kliknąć.

Łącznie ok. 1500vh, czyli trochę więcej niż obecne 1350vh. Dlatego potrzebny jest **wskaźnik rozdziałów** (patrz §4).

---

## 3. Rozdziały — szczegółowo

Każdy rozdział ma ten sam układ: **co widzi user / kamera / akcja / treść (DOM) / technika / dźwięk / mobile**.

---

### S0 — Hero, spoczynek *(istnieje, zostaje)*

- **Co widzi user:** obecne hero: Multi w pokoju z kafelkami, ogromna typografia za nim, płynna smuga za kursorem, dither.
- **Zmiana względem teraz:** prawie żadna. Jedyna różnica: ściana w tle musi być "przygotowana" do rozbicia (patrz technika w S1–S2).
- **Wskazówka scrolla:** mała, subtelna. Np. kafelek w środku ściany co kilka sekund leciutko drga, jakby coś za nim było. To zapowiedź tego, co się stanie, zanim user w ogóle zacznie scrollować.

---

### S1 — Multi znika, kamera rusza *(0 → 100vh)*

- **Co widzi user:** Multi rozpada się w pył (istniejący efekt dezintegracji). Typografia gaśnie. Kamera zaczyna **powolny dolly do przodu**, w stronę tylnej ściany.
- **Kamera:** pozycja startowa = dokładnie kamera, z której zrobione jest zdjęcie/wideo hero. Ruch: prosto do przodu o ok. 40% głębokości pokoju, ease-in (rusza powoli, przyspiesza). Paralaksa myszy wygasa.
- **Akcja:** pył Multiego **nie znika w powietrzu**, tylko dryfuje w stronę ściany i osiada na fugach między kafelkami w środku ściany. Fugi zaczynają się lekko jarzyć (turkus). "Multi wszedł za ścianę".
  - *Zmiana względem teraz:* obecnie pył składa się w okładkę singla. W nowej wersji okładka pojawia się na kafelku (S3), więc pył może robić coś innego.
- **Treść:** brak.
- **Technika (najważniejszy moment całego projektu): przekazanie 2D → 3D.**
  1. Obecny shader hero renderuje wideo, a po starcie przejścia przełącza tło na `hero-empty-room.jpg` (pusty pokój). To świetny punkt przekazania, bo pusty pokój to statyczne zdjęcie.
  2. Odtwarzamy pokój jako proste pudło 3D, na które **rzutujemy to zdjęcie z pozycji oryginalnej kamery** (*camera projection mapping*). Z pozycji startowej obraz 3D jest identyczny ze zdjęciem co do piksela. Gdy kamera rusza do przodu, pojawia się prawdziwa paralaksa i głębia.
  3. W klatce, w której Multi już zniknął, podmieniamy canvas hero na canvas 3D. Ta sama klatka, ten sam dither, więc user nic nie zauważy.
  4. **Nie wymaga Blendera.** Parametry kamery ze zdjęcia (FOV, nachylenie) wyciąga się darmowym, lekkim programem **fSpy** (z linii zbiegu kafelków). Kafelki są idealne do fSpy, bo to siatka prostych linii.
- **Dźwięk (opcjonalnie):** cichy "szum taśmy", narastający niski dron.
- **Mobile:** to samo, krótszy dolly.

---

### S2 — Pęknięcia → wybuch ściany *(100 → 220vh)*

Rozbite na 3 takty, bo wybuch bez zapowiedzi nie robi wrażenia:

**Takt 1: antycypacja (pierwsze ~35%)**
- W środku ściany, tam gdzie osiadł pył, przez kafelki przebiegają pęknięcia (nie tylko fugi, rysy w poprzek kafelków).
- **Przez pęknięcia przebija się światło z drugiej strony.** Ciepłe/białe, kontrastujące z turkusem. To pierwsza wskazówka, że za ścianą coś jest.
- Mikro-drgania kamery (camera shake), kilka kafelków lekko wysuwa się ze ściany.

**Takt 2: wybuch (~35% → 70%)**
- Fala uderzeniowa od środka na zewnątrz: kafelki odrywają się po kolei od centrum (opóźnienie zależne od odległości od środka), z rotacją, **lecą w stronę kamery** i lekko na boki.
- Podział ściany na 3 strefy:
  - **środek** (ok. 40% szerokości ściany): kafelki odlatują, powstaje dziura o poszarpanym brzegu,
  - **pierścień wokół dziury:** kafelki pękają, wiszą krzywo, niektóre spadają z opóźnieniem,
  - **reszta ściany:** zostaje, najwyżej rysy.
- Za dziurą: na razie tylko ciemność i snop światła.

**Takt 3: zwolnienie (~70% → 100%)**
- Czas zwalnia (bullet time). Kafelki prawie stają w powietrzu. Kamera wyłapuje **jeden kafelek** lecący wprost na nas, który odwraca się powoli przodem do kamery. Przejście do S3.

- **Kamera:** dalej dolly do przodu, ale wolniej. W takcie 3 lekki obrót/przesunięcie, żeby "złapać" bohaterski kafelek w kadrze (śledzenie celu, `lookAt` płynnie przechodzi ze środka ściany na kafelek).
- **Technika:**
  - Wszystkie kafelki to **jeden InstancedMesh** (jeden draw call, ok. 300–800 kafelków). Geometria kafelka to zaokrąglony box generowany w kodzie, więc **bez Blendera**.
  - Każdy kafelek ma teksturę z tego samego rzutowanego zdjęcia (zapamiętane UV z pozycji startowej), więc leci "swój" kawałek obrazu, a nie gołe białe kafle.
  - **Ruch nie jest symulacją fizyki**, tylko deterministyczną funkcją postępu scrolla (pozycja = start + prędkość·t + grawitacja·t², rotacja = oś·prędkość kątowa·t). Dzięki temu scroll w górę idealnie składa ścianę z powrotem, a działa to szybko nawet na słabym sprzęcie.
  - Slow-motion to tylko krzywa przemapowania czasu (`t = remap(progress)`), która spłaszcza się w takcie 3.
  - Pęknięcia: shader na kafelkach (wzór Voronoi + maska rosnąca od środka). Światło w pęknięciach to emisja + bloom.
  - Bohaterski kafelek **nie jest w instancingu**, tylko to osobny mesh z własną ścieżką (krzywa Béziera do pozycji "prezentacji" przed kamerą).
- **Dźwięk:** pękanie ceramiki (takt 1), wybuch/rumor (takt 2), w takcie 3 dźwięk spowalnia i zostaje sam "pogłos".
- **Mobile:** ok. 150–250 kafelków zamiast 800, bez bloomu (świecenie fałszujemy kolorem).

---

### S3 — Kafelek-singiel *(220 → 380vh, w tym HOLD ~90vh)*

- **Co widzi user:** w zwolnionym tempie wokół wiszą odłamki, a na środku ekranu unosi się jeden kafelek, ale większy, prawie jak plakat. Na jego licu jest **okładka ZA KAŻDYM RA2EM** w ditherze (ten sam wygląd co obecny `ReleaseDitherCanvas`). Tylna strona kafelka to ceramika/klej/tynk, co widać, gdy się obraca.
- **Kamera:** prawie stoi. Delikatny "oddech" (powolne kołysanie), lekki tilt za myszką (jak teraz przy monolicie).
- **Akcja:**
  - Kafelek wpada w kadr, obraca się przodem i zatrzymuje (ease-out). Okładka "wyświetla się" na nim (ten sam efekt odsłaniania szumem co teraz przy monolicie).
  - Pozostałe odłamki dryfują bardzo powoli (czas prawie stoi), dalej w tle widać dziurę ze światłem.
  - **HOLD:** przez ~90vh nic się nie dzieje poza mikro-ruchem. User czyta i klika.
- **Treść (DOM, nie WebGL, żeby była ostra, klikalna i widoczna dla SEO):**
  - kicker: `NOWY SINGIEL · 19.11.2026`
  - tytuł ZA KAŻDYM / RA2EM, ta sama kompozycja z typografią przed i za kafelkiem co teraz (część tytułu za kafelkiem, część przed nim, efekt kanapki)
  - `YOUNG MULTI FT. JULA`, `LOST MEDIA (11.12.2026)`, `PROD. KUBI PRODUCENT & MARCELI`
  - linki: Spotify / Apple Music / YouTube Music / Tidal
  - CTA: `OBEJRZYJ TELEDYSK ↗` (klik w kafelek = YouTube)
  - Te dane już są w `LATEST_RELEASE` w `NewSong.jsx` i przenosimy je 1:1.
- **Wyjście z rozdziału:** kafelek **przelatuje obok kamery** (za lewe ramię), a kamera rusza w stronę dziury.
  - **Mini-player (rekomendacja):** po wylocie kafelka w rogu ekranu zostaje mały DOM-owy badge `▶ ZA KAŻDYM RA2EM`. Singiel jest najważniejszym CTA strony i nie powinien zniknąć po 160vh.
- **Dźwięk:** (gdy dźwięk włączony) **przytłumiony fragment piosenki**, jakby grał za ścianą, który staje się wyraźniejszy, gdy kafelek jest w centrum. To najmocniejszy możliwy "hook" dla singla.
- **Mobile:** tekst pod kafelkiem zamiast obok. Kafelek zajmuje ok. 70% szerokości.

---

### S4 — Wlot w dziurę + obrót 180° *(380 → 500vh)*

- **Co widzi user:**
  1. Kamera leci na dziurę, ściana rośnie i wypełnia ekran.
  2. Przelot przez dziurę: przez ułamek sekundy widać **grubość ściany** (warstwa tynku/cegły na krawędziach, wiszące kafelki tuż przy kamerze, motion blur). Prawie czarna klatka.
  3. Po drugiej stronie: ciemna pustka. Kamera płynnie **obraca się o 180°** (yaw).
  4. Kadr końcowy: **patrzymy z powrotem na dziurę**. W niej widać jasny pokój z kafelkami, w którym byliśmy (poszarpany otwór, latające jeszcze odłamki, snop światła wpadający do ciemności). Wokół nas, w ciemności, zapalają się jeden po drugim albumy ustawione w pierścień.
- **Kamera:** lot prosto przez środek dziury, potem obrót z lekkim "przechyłem" (roll ±5°) na łuku. Żeby nie wyglądało to jak obrót kamerą w edytorze, kamera dalej delikatnie płynie do przodu, a obrót ma ease-in-out.
- **Technika:**
  - **Czarna klatka przy przelocie to prezent:** w tym momencie można bezpiecznie podmienić LOD-y, odpalić kompilację shaderów karuzeli, schować pokój i pokazać pustkę. User nic nie zobaczy.
  - Pokój widziany od tyłu przez dziurę = ta sama geometria pokoju z S1–S2, nic nowego nie trzeba budować. To, że jest jedną spójną sceną, sprzedaje iluzję.
  - Snop światła: fałszywy volumetric (stożek z addytywnym materiałem + szum), bez kosztownego ray-marchingu.
  - Pył/kurz w snopie światła (istniejące `AmbientDust` można przepisać na cząsteczki 3D).
- **Dźwięk:** "whoosh" przy przelocie, po drugiej stronie wyraźnie inna akustyka (pogłos, pusta hala).
- **Mobile:** bez rollu, krótszy obrót.

---

### S5 — Karuzela albumów *(500 → 900vh)*

- **Co widzi user:** kamera stoi w środku pierścienia. Wokół w ciemności wiszą okładki albumów (lekko zakrzywione panele, jak wycinki walca). Scroll obraca pierścień (albo kamerę, efekt ten sam). Za albumami, w przerwach między nimi, cały czas widać jasną dziurę do pokoju jako punkt orientacyjny.
- **Kolejność (chronologicznie):**
  1. **NOWA FALA** — 2017
  2. **TRAPSTAR** — 2018
  3. **TRAP AFTER DEATH** — 2019
  4. **TOXIC** — 2021
  5. **LOST MEDIA** — 11.12.2026 → *zapowiedź*: okładka zakryta/zaszumiona/"uszkodzona taśma", migocze. Album, z którego jest singiel z S3, więc narracja się domyka. *(Do decyzji: patrz §5.)*
- **Każdy album (80vh):** ~25vh obrotu do centrum, ~40vh HOLD, ~15vh odjazdu.
  - Album w centrum: podjeżdża bliżej kamery, prostuje się (mniejsza krzywizna), oświetla go światło z dziury, reszta przygasa.
  - Tytuł/rok/linki w DOM-ie. Przy przewijaniu tytuł "przewija się" jak licznik.
- **Efekty (klasyka Codrops, dobrze się sprawdza):**
  - zakrzywianie paneli i rozjazd RGB proporcjonalny do **prędkości scrolla** (szybki scroll = mocniejszy efekt, stop = czysto),
  - hover na albumie: dither się "rozpuszcza" i pod spodem pokazuje się kolorowa, czysta okładka (to samo, co robi smuga myszy w hero, więc spójnie),
  - albumy lekko się bujają, jakby wisiały w nieważkości.
- **Technika:** 5 planów z teksturami okładek (są w `src/assets/*Cover.avif`). **Bez Blendera**, geometria w kodzie.
- **Wyjście:** patrz S6. Przejście zaczyna się na ostatnim albumie.
- **Dźwięk:** przy każdym albumie krótki "tick"/szum winyla. Opcjonalnie kilkusekundowe fragmenty utworów (do decyzji, kwestia praw/plików).
- **Mobile:** pierścień zamieniony na poziomy pas (albumy przewijają się w bok), mniejsza krzywizna, brak RGB shift.

---

### S6 — Odbicie w okularach → głowa → O mnie *(900 → 1120vh, w tym HOLD ~100vh)*

To jest zwrot akcji ("aha!") całej strony i wymaga najwięcej precyzji.

**Takt 1: zakrzywienie świata (900 → ~960vh)**
- Na ostatnim albumie obraz zaczyna się **wybrzuszać** (barrel distortion jak w soczewce wypukłej), krawędzie kadru ciemnieją i zaokrąglają się w kształt szkła okularów, a pojawia się delikatny przyciemniający tint.
- Po obrazie przesuwa się ukośny refleks światła, czyli odblask na szkle. W tym momencie user zaczyna rozumieć, że patrzy przez szkło, a nie w przestrzeń.

**Takt 2: szybki odjazd (~960 → ~1020vh)**
- Kamera **szybko odjeżdża** (mocny ease-out: start bardzo szybki, hamuje). Widzimy, że cały świat z albumami to odbicie w soczewce okularów przeciwsłonecznych, okulary są na twarzy Multiego, a twarz należy do głowy w ciemnym studiu z turkusowym rim lightem.
- Opcjonalnie lekki *dolly zoom* (zmiana FOV w trakcie odjazdu) dla efektu zawrotu głowy.

**Takt 3: O mnie (~1020 → 1120vh, HOLD)**
- Kamera zatrzymuje się na głowie w ujęciu 3/4. Głowa delikatnie śledzi kursor (tak jak teraz w `About`).
- Tekst o mnie wjeżdża w DOM (split-text reveal, linia po linii).
- **Interakcja (reużycie pomysłu z obecnego About):** hover na elementach głowy (okulary, dredy, usta) pokazuje "fakty" w dymku (`SpeechBubble`). Dredy mogą się bujać przy ruchu (`JellyDread` przepisany na 3D: kości/spring w shaderze).
- W odbiciu w okularach **dalej na żywo widać świat z albumami.** To jest detal, który nagradza uważnych.

- **Technika (kluczowy trik): render target.**
  1. Scenę "pokój + pustka + albumy" renderujemy do tekstury (FBO), a nie na ekran.
  2. W scenie "studio" materiał soczewek okularów używa tej tekstury (z wypukłym zniekształceniem, tintem i fresnelem).
  3. Na końcu S5 na ekranie jest pełnoekranowa tekstura z zniekształceniem soczewki. Na początku S6 kamera stoi tuż przy soczewce, więc obraz jest **identyczny**. Przełączenie jest niewidoczne, a dalej to już zwykły odjazd kamery.
  4. W modelu głowy soczewki muszą być osobnymi meshami z UV 0–1 (patrz kontrakt w PRODUKCJA.md).
- **Uwaga: lustro.** Prawdziwe odbicie jest odwrócone w poziomie, więc napisy na okładkach byłyby lustrzane. Rekomendacja: **ignorujemy fizykę** (artystyczna licencja). Nikt tego nie sprawdzi, a lustrzane tytuły psują czytelność. Ewentualnie odwracamy obraz w najszybszym momencie odjazdu, gdy jest motion blur.
- **Dźwięk:** przy odkryciu wszystkie dźwięki przestrzeni "zamykają się" do cichego, bliskiego tonu (jakbyśmy wyszli z głowy na zewnątrz).
- **Mobile:** głowa wyżej w kadrze, tekst pod spodem. Odbicie w okularach odświeżane rzadziej (np. co 2–3 klatki).

---

### S7 — Sylwetka → koszulka → Selected Goods *(1120 → 1480vh)*

**Takt 1: cała sylwetka (1120 → ~1180vh)**
- Kamera odjeżdża dalej, aż widzimy całego Multiego stojącego w ciemnym studiu (statyczna poza lub subtelna animacja idle).

**Takt 2: zostaje tylko koszulka (~1180 → ~1240vh)**
- Światło się zmienia: rim light gaśnie, a **koszulka zaczyna świecić** (podświetlenie od środka/spot tylko na nią).
- Reszta Multiego **rozpada się w pył**. To ten sam shader dezintegracji co w hero, więc historia zamyka się klamrą.
- Koszulka zostaje sama, unosi się w powietrzu i lekko się kołysze (jakby wciąż ktoś w niej był, a potem "flaczeje").

**Takt 3: Selected Goods (~1240 → 1480vh)**
- Nagłówek `SELECTED GOODS` wjeżdża za koszulką (typografia kanapkowa jak w S3).
- Koszulka = produkt #1: **STEALTH ERA T-SHIRT — 179,00 ZŁ**.
- Scroll dalej: koszulka odjeżdża w bok, z ciemności wjeżdżają kolejne produkty (każdy ~80vh, HOLD w środku):
  - **YFL PATCH HOODIE — 499,00 ZŁ**
  - **YFL EMBOSSED HOODIE — 459,00 ZŁ**
- Interakcja: przeciąganie obraca produkt 360°, klik prowadzi do sklepu. Cena i nazwa w DOM.
- Na hover: dither ustępuje i pokazuje prawdziwe kolory/fakturę materiału (spójnie z albumami).

- **Technika:**
  - Model sylwetki musi mieć **koszulkę jako osobny obiekt/mesh**, bo inaczej nie da się jej wyizolować (kontrakt w PRODUKCJA.md).
  - Jeśli nie będzie modeli 3D bluz: produkty jako płaskie plany ze zdjęciami (już są w `src/assets/`) z lekką krzywizną i ditherem. Wygląda to dobrze i jest gotowe od razu. Model 3D koszulki jest wtedy potrzebny tylko dla przejścia z sylwetki.
- **Mobile:** produkty w pionowym stosie, bez obrotu 360° (zamiast tego swipe).

---

### S8 — Kontakt *(zwykły scroll)*

- Kanwa 3D gaśnie (ostatnia klatka: pusta, ciemna przestrzeń z unoszącym się pyłem). Pod nią zwykła sekcja `Contact` na normalnym scrollu.
- Opcjonalnie stopka-easter egg: mały kafelek w rogu, który po kliknięciu "pęka".

---

## 4. Rzeczy wspólne dla całej historii

### Wskaźnik rozdziałów (nawigacja)
1500vh to dużo, więc potrzebna jest boczna (lub dolna) oś z rozdziałami: `01 SINGIEL · 02 DYSKOGRAFIA · 03 O MNIE · 04 SKLEP`. Pokazuje postęp, a po kliknięciu skacze do początku HOLD-u danego rozdziału. Menu (`MenuOverlay`) korzysta z tych samych kotwic z `story.config.js` zamiast obecnych procentów w `App.jsx`.

### Scroll w obie strony
Wszystko jest funkcją postępu scrolla (żadnych animacji odpalanych jednorazowo w trakcie historii). Scroll w górę = film do tyłu. Ściana się skleja, Multi wraca z pyłu.

### Przycisk dźwięku
Dźwięk domyślnie wyłączony, przełącznik w headerze. Cały sound design z rozdziałów jest opcjonalny i dochodzi na końcu.

### prefers-reduced-motion / słaby sprzęt
- `prefers-reduced-motion`: bez lotów kamery. Rozdziały przechodzą krótkim przenikaniem, treść jest normalnymi sekcjami.
- Słaby sprzęt (obecny `PerformanceContext` + `useFpsMonitor`): tryb "lite", szczegóły w PRODUKCJA.md.

### SEO / dostępność
Cała treść (tytuły, linki, ceny, tekst o mnie) jest w DOM jako normalne nagłówki i linki. Canvas ma `aria-hidden`. Dla czytników ekranu i Google strona jest zwykłym dokumentem.

---

## 5. Decyzje do podjęcia

| # | Pytanie | Rekomendacja |
|---|---|---|
| D1 | LOST MEDIA jako 5. "album" (zapowiedź) na karuzeli? | **Tak.** Domyka historię singla. Wymaga zgody, żeby pokazać okładkę/teaser przed premierą (można zakryć szumem). |
| D2 | Co z kafelkiem-singlem po S3? | **Przelatuje obok kamery i zostaje mini-player w rogu.** Alternatywa: zostaje w pokoju i widać go przez dziurę po obrocie. |
| D3 | Lustrzane odbicie w okularach? | **Ignorujemy fizykę** (napisy czytelne). |
| D4 | Fragmenty muzyki (singiel w S3, albumy w S5)? | Singiel tak (najmocniejszy hook). Albumy opcjonalnie, zależnie od plików/praw. |
| D5 | Produkty w sklepie: modele 3D czy zdjęcia? | **Start na zdjęciach** (zero kosztu). 3D tylko koszulka (potrzebna do przejścia z sylwetki). Bluzy 3D później, jeśli będą skany. |
| D6 | Pył Multiego zasila pęknięcia ściany (S1→S2)? | **Tak**, bo to łącznik narracyjny, który kosztuje niewiele. |
| D7 | Animacja idle sylwetki (oddech/kołysanie)? | Na start statyczna poza, idle później (Mixamo). |

---

## 6. Co ze starymi komponentami

| Komponent | Los |
|---|---|
| `Hero`, `HeroVideoShader` | **Zostają** jako S0–S1, z punktem przekazania do kanwy 3D. Dezintegracja i dither są reużywane. |
| `NewSong` (dane `LATEST_RELEASE`, layout tekstu) | Dane i DOM-owa treść przenoszą się do S3. Monolit zastąpiony kafelkiem. |
| `ReleaseDitherCanvas`, `AmbientDust` | Logika ditheru i pyłu przepisana na shadery/cząsteczki 3D. |
| `Gramophone`, `ScrollStack`, `GlitchTearWebGL` | **Do usunięcia.** Zastępuje je karuzela S5. Dane albumów (`Gramophone.jsx`) przenosimy. |
| `About` (+ `FaceFeatures`, `JellyDread`, `SpeechBubble`, `SpectralGuide`) | Tekst i pomysł interakcji przenoszą się do S6. `SpeechBubble` zostaje (DOM). Reszta przepisana na 3D. |
| `SmokeTransition` (+ `smoke-transition.mp4`) | **Do usunięcia.** Przejście do sklepu robi pył. |
| `Merch` | Dane produktów przenoszą się do S7. |
| `Contact`, `Header`, `MenuOverlay`, `Preloader`, `CustomCursor`, `SmoothScroll` | Zostają (menu dostaje kotwice z configu). |
