# YOUNG MULTI — produkcja: stack, assety 3D, wydajność, kolejność prac

> Uzupełnienie do [SCENARIUSZ.md](SCENARIUSZ.md). Tu jest *jak*, tam jest *co*.

---

## 1. Najważniejsza zasada: placeholdery najpierw, Blender na końcu

Słaby laptop bez Blendera **nie blokuje** prac. Cała historia da się zbudować i dopracować na placeholderach:

| Element | Placeholder (laptop, bez Blendera) | Finalny asset |
|---|---|---|
| Pokój | pudło + rzutowane zdjęcie `hero-empty-room.jpg` | **to samo**, to jest wersja finalna |
| Kafelki, ściana, dziura | generowane w kodzie | **to samo** |
| Albumy | plany z okładkami | **to samo** |
| Głowa Multiego z okularami | kula/kapsuła + 2 prostokąty jako soczewki (albo darmowy model głowy CC0) | skan / model z Blendera |
| Sylwetka + koszulka | domyślna postać z Mixamo + osobny mesh "koszulki" | skan / model z Blendera |
| Produkty | zdjęcia na planach | (opcjonalnie) skany 3D |

Gdy przyjdzie finalny model, podmieniamy plik `.glb`. Działa to, **o ile model spełnia kontrakt** z §4 (nazwy meshów, skala, orientacja). To jest cała tajemnica bezbolesnej podmiany.

**Dither wybacza.** Globalny post-process Bayer 4×4 / 3 poziomy z hero sprawia, że model na 15k trójkątów wygląda tak samo dobrze jak na 500k. Detal ginie w kropkach, liczy się sylwetka i światło. To oznacza mniejsze modele, szybszą stronę i mniej pracy w Blenderze.

---

## 2. Stack

| Warstwa | Wybór | Uzasadnienie |
|---|---|---|
| 3D | **three.js** + **@react-three/fiber** + **@react-three/drei** | Projekt już jest w React 19. Fiber v9 wspiera React 19. drei daje gotowe `useGLTF`, `useFBO`, `RoundedBox`, `Instances`, `PerformanceMonitor`. |
| Post-process | własny pass (dither) albo `@react-three/postprocessing` | Dither to i tak własny shader (przeniesiony z `HeroVideoShader`). Bloom z biblioteki. |
| Scroll | **Lenis** (już jest) → jedna wartość `progress` | Jedno źródło prawdy dla całej historii. |
| Choreografia | **GSAP timeline** (już jest w deps) sterowany przez `progress` (scrub) | Długie, wieloetapowe sekwencje (kamera + uniformy + DOM) najwygodniej pisze się jako jeden timeline z etykietami rozdziałów. |
| Ścieżka kamery | w kodzie: `CatmullRomCurve3` (pozycja) + osobna krzywa celu (`lookAt`) | Bez Blendera. Alternatywa: kamera zanimowana w Blenderze i wyeksportowana w glTF, scrub przez `AnimationMixer.setTime()`. |
| Strojenie | `leva` (suwaki) + `r3f-perf` tylko w dev (`?debug`) | Dopasowywanie wartości na żywo bez przeładowań. |
| Obecne | framer-motion | Zostaje dla DOM-owych overlayów (teksty, menu). Nie steruje już kamerą. |

> Theatre.js (wizualne keyframe'owanie kamery w przeglądarce) byłoby idealne na słaby laptop, ale przed użyciem sprawdź, czy projekt jest dalej aktywnie rozwijany. GSAP + suwaki leva w zupełności wystarczą.

### Do doinstalowania (wersje sprawdzić przy instalacji)
```
three @react-three/fiber @react-three/drei
@react-three/postprocessing postprocessing   (jeśli bloom z biblioteki)
leva r3f-perf                                 (devDependencies)
```

---

## 3. Architektura

### Jedna kanwa, jeden zegar
```
<body>
 ├─ <Hero>                       ← istniejący canvas (S0–S1), znika po przekazaniu
 ├─ <StoryCanvas>  (position: fixed, pełny ekran, aria-hidden)
 │    ├─ WorldScene   (pokój, ściana, kafelki, dziura, pustka, albumy)  → render do FBO
 │    ├─ StudioScene  (głowa, sylwetka, koszulka, produkty)
 │    └─ DitherPass   (globalny post-process)
 ├─ <StoryOverlays>  (DOM: teksty, linki, ceny — sticky, zsynchronizowane z progress)
 ├─ <StoryScrollSpacer style="height: 1480vh">   ← tylko daje wysokość scrolla
 └─ <Contact>
```

- **WorldScene → FBO:** w S1–S5 FBO trafia pełnoekranowo na ekran. Od S6 trafia na soczewki okularów w StudioScene. Jedno źródło, dwa zastosowania (szczegóły: SCENARIUSZ.md, S6).
- Renderujemy **tylko to, co widać**: w S1–S5 StudioScene się nie renderuje. Od połowy S6 WorldScene renderuje się w niższej rozdzielczości (jest tylko odbiciem w okularach). Po S7 wcale.

### Proponowana struktura plików
```
src/story/
  story.config.js        ← rozdziały: nazwy, długości vh, kotwice menu, HOLD-y
  useStoryProgress.js    ← Lenis → progress 0..1 + lokalny progress rozdziału
  StoryCanvas.jsx
  StoryOverlays.jsx
  timeline.js            ← GSAP master timeline (etykiety = rozdziały)
  world/
    ProjectedRoom.jsx    ← pudło + projekcja zdjęcia (S1)
    TileWall.jsx         ← InstancedMesh kafelków, pęknięcia, wybuch (S2)
    HeroTile.jsx         ← kafelek z singlem (S3)
    HoleAndVoid.jsx      ← grubość ściany, snop światła, pustka (S4)
    AlbumRing.jsx        ← karuzela (S5)
  studio/
    MultiHead.jsx        ← głowa + soczewki z FBO (S6)
    MultiBody.jsx        ← sylwetka, dezintegracja, koszulka (S7)
    MerchShowcase.jsx    ← produkty (S7)
  shaders/
    dither.glsl          ← wyciągnięty z HeroVideoShader (bayer4x4 + paleta)
    dissolve.glsl        ← wyciągnięty z HeroVideoShader (disintegrationField)
    tileExplode.glsl
    lens.glsl            ← barrel distortion + tint + refleks
```

### `story.config.js`: jedno źródło prawdy
```js
// szkic, wartości z tabeli w SCENARIUSZ.md §2
export const CHAPTERS = [
  { id: 'hero',      vh: 0 },
  { id: 'dissolve',  vh: 100 },
  { id: 'explode',   vh: 120 },
  { id: 'single',    vh: 160, hold: [0.35, 0.9], anchor: 'nowa-piosenka' },
  { id: 'dive',      vh: 120 },
  { id: 'albums',    vh: 400, anchor: 'dyskografia' },
  { id: 'reveal',    vh: 220, hold: [0.55, 1.0], anchor: 'o-mnie' },
  { id: 'merch',     vh: 360, anchor: 'merch' },
];
```
Z tego wyliczają się: wysokość spacera, pozycje kotwic dla menu i wskaźnika rozdziałów oraz lokalne progressy. Koniec z ręcznymi `0.14 / 0.29 / 0.76` w `App.jsx`.

### Narzędzia dev (ważne przy słabym laptopie)
- `?debug`: leva + r3f-perf + widoczna ścieżka kamery.
- `?chapter=albums`: start od razu w danym rozdziale (bez przewijania 900vh przy każdym teście).
- `?dpr=0.5`: renderowanie w połowie rozdzielczości podczas pracy.
- Hot reload shaderów (vite-plugin-glsl albo stringi w `.js`).

---

## 4. Brief assetów 3D (dla Blendera / skanu / zlecenia)

Ta sekcja jest pisana tak, żeby można ją było **przekazać komuś 1:1** (modelarzowi albo sobie na mocniejszym komputerze).

### Kontrakt wspólny dla wszystkich modeli
- Format: **glTF binary (`.glb`)**.
- Jednostki: **1 unit = 1 metr**. Multi ma ok. 1.80 wysokości.
- Orientacja: **+Y w górę, przód postaci patrzy w +Z** (domyślny eksport glTF z Blendera: "+Y Up").
- Origin: między stopami na podłodze (sylwetka), środek szyi u podstawy (głowa).
- Transformacje zaaplikowane (Apply All Transforms), brak skali ≠ 1.
- Nazwy obiektów **dokładnie jak niżej**, bo kod szuka ich po nazwie.
- Tekstury: max **2048 px**, docelowo konwersja do KTX2/WebP (robimy to sami w pipeline, patrz §5).
- Materiały: zwykły Principled BSDF (eksportuje się do glTF PBR). Bez skomplikowanych node'ów, bo nie przetrwają eksportu.

### A1. Głowa Multiego w okularach (S6) — **priorytet 1**
| | |
|---|---|
| Budżet | ≤ 30 000 trójkątów łącznie |
| Obiekty | `Head`, `Hair` (dredy, osobno żeby mogły się bujać), `Glasses_Frame`, `Lens_L`, `Lens_R` |
| Soczewki | **osobne meshe**, lekko wypukłe, **UV rozłożone płasko 0–1 na całą soczewkę** (na nie trafia tekstura świata z albumami) |
| Tekstury | albedo 2k (twarz), normal opcjonalnie |
| Okulary | przeciwsłoneczne, duże soczewki (im większa powierzchnia soczewki, tym czytelniejszy zwrot akcji z odbiciem). Najlepiej model okularów, które Multi faktycznie nosi. |
| Dredy | jeśli mają się bujać: prosty rig (łańcuch 3–4 kości na pasmo) albo osobne meshe pasm, a bujanie zrobimy w shaderze |

### A2. Sylwetka Multiego (S7) — **priorytet 2**
| | |
|---|---|
| Budżet | ≤ 60 000 trójkątów łącznie (z głową, może to być ten sam model co A1, tylko w niższym LOD) |
| Obiekty | `Body` (wszystko oprócz koszulki), **`Shirt`** (sama koszulka, osobny obiekt), opcjonalnie `Pants`, `Shoes` |
| Koszulka | **STEALTH ERA T-SHIRT**: musi wyglądać jak produkt ze sklepu (nadruk/grafika na teksturze), bo staje się produktem #1 |
| Poza | stojąca, naturalna (nie T-pose). Opcjonalnie rig pod animację idle. |
| `Shirt` osobno jako drugi plik | `shirt_solo.glb`: ta sama koszulka "wypełniona" (jakby ktoś w niej był) + opcjonalnie shape key "flaczeje" |

### A3. Produkty (S7) — **opcjonalne**
| | |
|---|---|
| Pliki | `hoodie_patch.glb`, `hoodie_embossed.glb` (+ koszulka z A2) |
| Budżet | ≤ 20 000 trójkątów każdy |
| Wygląd | zgodny ze zdjęciami w `src/assets/hoodie1.avif`, `hoodie2.avif`, `tshirt.avif` |
| Fallback | jeśli nie powstaną, zostają zdjęcia na planach, a strona działa bez nich |

### Czego NIE trzeba robić w Blenderze
Pokój, kafelki, ściana, dziura, grubość ściany, snop światła, albumy, pył, kamera. Wszystko to jest w kodzie.

### Skąd wziąć modele bez Blendera na tym laptopie
| Sposób | Na co | Uwagi |
|---|---|---|
| **Skan telefonem** (aplikacje do fotogrametrii / skanowania 3D, np. Polycam, KIRI Engine, RealityScan) | głowa, sylwetka, ubrania | Najlepsze podobieństwo do prawdziwego Multiego i prawdziwych bluz. Obliczenia robi chmura, nie laptop. Potrzebne dobre, równe światło i ktoś nieruchomy przez ~1–2 min. Okulary często skanują się źle (szkło), więc lepiej je zdjąć i dołożyć jako osobny model. |
| **Mixamo** (przeglądarka) | auto-rig + animacja idle | Darmowe, działa w przeglądarce. Wrzucasz `.fbx`/`.obj` postaci i dostajesz rig. |
| **AI image-to-3D** (różne serwisy) | szybkie placeholdery, okulary, ubrania | Jakość nierówna, ale po ditherze często wystarcza. Sprawdź licencję komercyjną. |
| **Zlecenie modelarzowi** | A1 + A2 | Ta sekcja (§4) jest gotowym briefem. |
| **Mocniejszy komputer znajomego / uczelni** | czyszczenie skanów, podział na obiekty (`Shirt` osobno!), UV soczewek | To jedyny krok, który realnie wymaga Blendera. Zwykle ~1 wieczór pracy. |

---

## 5. Pipeline assetów (działa na słabym laptopie)

```
skan / Blender  →  .glb  →  gltf-transform (CLI, Node)  →  public/models/*.glb
```
- **gltf-transform** to lekkie narzędzie CLI w Node, więc chodzi na laptopie. Robi:
  - kompresję geometrii (**meshopt** albo Draco),
  - kompresję tekstur do **KTX2** (albo WebP),
  - dedup, prune, resize tekstur.
- Szybki podgląd i sprawdzenie, czy nazwy meshów się zgadzają: przeglądarkowy viewer glTF (np. gltf.report / three.js editor), bez instalowania czegokolwiek.
- Każdy model po optymalizacji mieści się w budżecie z §6, w przeciwnym razie wraca do zmniejszenia.

### fSpy: kalibracja kamery pokoju (S1)
1. Otwierasz `public/hero-empty-room.jpg` w fSpy (darmowy, lekki program).
2. Ustawiasz 2 osie linii zbiegu na fugach kafelków.
3. Odczytujesz FOV + rotację kamery i wpisujesz do `ProjectedRoom.jsx`.
4. Wymiary pudła pokoju stroisz na oko suwakami leva, aż projekcja "siedzi".

---

## 6. Budżety wydajności

| | Desktop (średni laptop) | Mobile |
|---|---|---|
| FPS cel | 60 | 30+ (cel 60 na nowszych) |
| DPR | max 1.5 | max 1.25 (lite: 1.0) |
| Draw calls | < 80 | < 40 |
| Kafelki | 600–800 (1 draw call) | 150–250 |
| Trójkąty na klatkę | < 300k | < 120k |
| Pobranie na start (do S3) | ≤ 2.5 MB (bez wideo hero) | ≤ 1.5 MB |
| Modele studia (S6–S7) | ≤ 3 MB łącznie, **dociągane w tle podczas S2–S5** | to samo, niższy LOD |
| Bloom | tak | nie (świecenie fałszujemy kolorem) |

### Strategia ładowania
- Preloader (istniejący) ładuje tylko S0–S3.
- Modele z S6–S7 ładują się w tle, gdy user jest w S2–S5 (zwykle ma na to 20+ sekund).
- **Czarna klatka przelotu przez dziurę (S4)** to bezpieczny moment na kompilację shaderów studia (`gl.compile(scene, camera)`), żeby nie było przycięcia przy odkryciu w S6.

### Tryby jakości (rozbudowa istniejącego `PerformanceContext` / `useFpsMonitor`)
| Tryb | Kiedy | Co się zmienia |
|---|---|---|
| **high** | desktop, stabilne 55+ fps | wszystko |
| **medium** | spadki fps / słabsze GPU | mniej kafelków, bez bloomu, FBO świata w połowie rozdzielczości |
| **lite** | mobile low-end / < 30 fps | bez lotów 3D w S4 (przenikanie), karuzela jako płaski pasek, produkty jako zdjęcia |
| **reduced-motion** | `prefers-reduced-motion` | brak ruchu kamery, rozdziały jako zwykłe sekcje z przenikaniem |

---

## 6b. Stan prac (23.11.2026)

**Faza 0 i 1: zrobione** (S1–S3 + lekka wersja S4, która oddaje stronę starej dyskografii przez czarną klatkę).

| Plik | Co robi |
|---|---|
| `src/story/story.config.js` | rozdziały i ich długości w vh: jedyne źródło prawdy, z niego liczą się kotwice menu |
| `src/story/useStoryScroll.js` | scroll → "story vh" (stabilne 100vh, bez skoków paska adresu na telefonie) |
| `src/story/world/calibration.js` | kalibracja pokoju zmierzona ze zdjęcia: 28×22 kafelki, ogniskowa 465 px, punkt główny (479.4, 210) |
| `src/story/StoryDirector.jsx` | kamera, soczewka (kadr = crop hero 1:1), krzywa bullet-time, lot kafelka-singla, pixel-lock do slotu w DOM |
| `src/story/world/Room.jsx` | pokój z rzutowanym zdjęciem, tynk z dziurą, światło zza ściany, snop światła |
| `src/story/world/TileWall.jsx` | 616 kafelków w 1 draw callu, pęknięcia, wybuch, wiszące kafelki (wszystko funkcją scrolla) |
| `src/story/world/HeroTile.jsx` | kafelek → okładka (hover / dotyk = czyste kolory bez ditheru) |
| `src/story/DitherPass.jsx` | globalny dither z hero + glow z HDR |
| `src/story/StorySection.jsx/.css` | DOM: tytuł, linki, slot kafelka, mini-player, układ płynny 320 px → 4K |

Zmierzone na słabym laptopie (panel podglądu): stare hero ~12 fps, nowa scena 3D ~30 fps. Three.js ładuje się leniwie (poza startowym bundlem).

Faktyczne długości rozdziałów (po strojeniu): S1 100vh, S2 110vh, S3 190vh, S4 140vh.

**Poprawki po pierwszym przeglądzie:**
- pył z hero ląduje na fugach pierwszych pękniętych kafelków (ta sama funkcja pęknięć `GLSL_CRACKS` w hero i w 3D), więc rysuje "prześwietlone" kafelki, a nie koło;
- za ścianą nie ma żadnego źródła światła: dziura jest ciemna, jedynym światłem jest pokój widoczny od tyłu;
- ściana ma prawdziwą grubość (30 cm, wytłoczona bryła z tym samym profilem dziury co shader i kafelki), tył ściany i krawędź otworu;
- pył nie gaśnie przed przejściem: zostaje na fugach, a scena 3D ma te same fugi zapalone od pierwszej klatki, więc pył przechodzi płynnie w prześwietlenie;
- kafelek z singlem to kawałek ściany z dwóch sklejonych kafelków (2:1), lecący po zwykłej trajektorii balistycznej z tym samym zegarem co reszta (`storyThree.js` → `heroTileAt`). To kamera podlatuje do niego w bullet time i potem go puszcza; odłamki go omijają i nie przenikają przez niego ani przez obiektyw;
- kamera: zbliżenie przy wybuchu, obrót o 180° zaczyna się już podczas wybuchu, kafelek z singlem przelatuje obok i zwalnia (bullet time + HOLD), potem czas przyspiesza, kafelek odlatuje, a kamera przelatuje przez dziurę i patrzy na pokój od tyłu.

## 7. Kolejność prac (fazy)

Każda faza kończy się czymś, co da się odpalić i obejrzeć. Fazy 0–4 nie wymagają żadnych zewnętrznych assetów.

| Faza | Zakres | Assety | Kryterium "gotowe" |
|---|---|---|---|
| **0. Szkielet** | instalacja R3F, `story.config.js`, `useStoryProgress`, pusty `StoryCanvas`, spacer, wskaźnik rozdziałów, `?debug` i `?chapter=` | brak | przewijam 1480vh, widzę w debugu który rozdział i lokalny progress |
| **1. Pokój → wybuch → singiel** (S1–S3) | fSpy + projekcja pokoju, przekazanie z hero (niewidoczne!), ściana z kafelków, pęknięcia, wybuch, slow-mo, kafelek z singlem + DOM z linkami, mini-player, globalny dither | brak (wszystko już jest) | przejście hero → singiel wygląda jak jedno ujęcie i działa w obie strony. **To jest to, co user wskazał jako teraz najsłabsze, więc robimy to najpierw.** |
| **2. Dziura → albumy** (S4–S5) | przelot, grubość ściany, obrót 180°, snop światła, karuzela, efekty prędkości, hover | okładki (są) | cała dyskografia przeglądalna, kotwica `dyskografia` działa |
| **3. Odbicie w okularach** (S6, mechanika) | FBO świata, shader soczewki, odjazd od placeholderowej głowy (kula + prostokątne soczewki) | placeholder | zwrot akcji "to było odbicie" działa i jest niewidoczny w szwie, nawet na brzydkim placeholderze |
| **4. O mnie + sylwetka + sklep** (S6–S7, placeholdery) | tekst o mnie, hotspoty na głowie, postać Mixamo, dezintegracja wszystkiego poza `Shirt`, Selected Goods na zdjęciach | placeholder Mixamo | cała historia od początku do końca, na placeholderach |
| **5. Podmiana assetów** | finalna głowa, sylwetka, koszulka (+ ew. bluzy) | A1, A2, (A3) | modele przechodzą kontrakt (§4), budżety (§6) |
| **6. Szlif** | tryby jakości, mobile, reduced-motion, a11y, SEO, dźwięk, usunięcie starych komponentów (lista w SCENARIUSZ.md §6) | dźwięki | Lighthouse OK, mobile 30+ fps, nic nie przycina przy przejściach |

### Hasła do szukania (Codrops i podobne)
Poradniki pod konkretne fazy. Szukaj po tematach, nie po konkretnych artykułach:
- *scroll-driven camera animation three.js / R3F*: faza 0–1
- *camera projection mapping three.js*: faza 1 (pokój)
- *instanced mesh explosion / shatter effect shader*: faza 1 (wybuch)
- *WebGL curved image carousel / infinite gallery velocity distortion*: faza 2
- *render target texture three.js / portal effect / FBO*: faza 3 (okulary)
- *dissolve effect shader three.js*: faza 4 (sylwetka → koszulka, choć ten shader już masz w hero)
- *ordered dithering post-processing three.js*: globalny dither
