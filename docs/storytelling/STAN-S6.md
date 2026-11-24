# S6: przejście w okulary Multiego — stan i co dalej (24.11.2026)

Notatka do kontynuacji na innym komputerze. Scenariusz całej sekcji: `SCENARIUSZ.md`, S6.

## Co już działa

- **Szew:** pod koniec LOST MEDIA ekran po cichu staje się szybą okularów (klatka 1:1), potem wybrzuszenie szkła, ciemniejący brzeg.
- **Odjazd:** kamera na sprężynie, zakotwiczona na szybie (nie skacze), dolly zoom, łuk do 3/4; głowa „zauważa” kamerę.
- **Odbicie:** świat z wieżą ściśnięty w szybę jak w wypukłym lustrze; LOST MEDIA gaśnie w szybie, gdy pojawia się głowa; zostaje realistyczne odbicie studia (softbox + turkusowe światło). Po zgaśnięciu świat przestaje się renderować.
- **Głowa:** model z Meshy (zmniejszony skryptem), zdjęcie Multiego rzutowane z przodu (`PHOTO_FIT`).
- **Skan:** laserowa linia, przekrój świeci; nad linią głowa z kropek w kolorach zdjęcia (puentylizm), kursor rozpycha kropki.
- Bez plików modelu/zdjęcia strona pokazuje zastępczą głowę (kula + okulary z kodu) i nic się nie wywala.

## Pliki, których NIE MA w gicie (trzeba przenieść ręcznie!)

Foldery `public/studio/` i `art/` są w `.gitignore` (wizerunek Multiego + zdjęcie bez zgody na publikację).
Na drugi komputer skopiuj:

| Plik | Skąd | Uwagi |
|---|---|---|
| `art/meshy/multi-head-raw.glb` | z Meshy: `Meshy_AI_Neon_Dread_Silence_20261124_generate.glb` (91 MB) | surowy model, wejście skryptu |
| `public/studio/multi-portrait.jpg` | Apple Music, 2400×2400: `https://is1-ssl.mzstatic.com/image/thumb/Features211/v4/c4/4d/b9/c44db9b2-22f9-a832-4d11-8cd946436bc2/mzl.arviawea.jpg/2400x2400bb.jpg` | zdjęcie rzutowane na głowę |
| `public/studio/multi-ai-input.png` | (opcjonalnie) | rozjaśniony kadr głowy, wejście do generatorów 3D |

`public/studio/multi-head.glb` i `public/studio/multi-head-dots.bin` się NIE kopiuje — generuje je skrypt.

## Uruchomienie

```powershell
npm install
```

```powershell
node --max-old-space-size=6144 scripts/prepare-head.mjs art/meshy/multi-head-raw.glb public/studio 150000 150000
```

```powershell
npm run dev
```

Przejście jest na scrollu ok. 860–1160 vh (konsola: `window.__story.state.vh`).
Uwaga: po edycji `Studio.jsx` / `Tower.jsx` hot-reload potrafi zepsuć scenę (zła skala, brak koloru) — wtedy zwykłe przeładowanie strony.

## W TRAKCIE (od tego zacząć)

**Szyba z modelu jako soczewka** (zamiast okularów z kodu, które „walczyły” z szybą modelu).
`scripts/prepare-head.mjs` buduje szybę tak:

1. dopasowuje gładką powierzchnię `z = a + b·x² + c·y + d·y²` do najbardziej wysuniętych punktów czystego pasa szyby (pod dredami),
2. czyta **kontur** szyby wiersz po wierszu (`visorOutline`),
3. generuje czystą siatkę szyby w tym konturze na gładkiej powierzchni (`visorGrid`), z UV do odbicia,
4. usuwa powłokę szyby AI z głowy i z kropek (`inVisorShell`); dredy przed szybą zostają,
5. zapisuje dane szyby (punkt startu kamery, normalna, rozmiar) w `extras` węzła `MultiVisor`.

**Ostatnia poprawka nie była jeszcze uruchomiona ani sprawdzona:** kontur wychodził za wąski
(`visor outline: y 0.210..0.290`), więc poluzowałem kryterium wierszy (wypukłe przetłoczenie na środku liczy się jako szyba, start wiersza szukany blisko środka).
Po uruchomieniu skryptu sprawdź log:

- oczekiwane mniej więcej: `visor outline: y ~0.00..0.40, x ~-0.36..0.36`,
- `visor {"anchor":[0, ~0.14, ...]` — punkt startu kamery w dolnej, wolnej od dredów części szyby.

Potem w przeglądarce:

- vh 863 → 865: szew identyczny (nie czarny ekran!),
- vh ~912–930: na całej szybie widać odbicie wieży / LOST MEDIA; żadnych czarnych łat z głowy na szybie,
- jeśli coś zasłania szybę na środku: w skrypcie `inVisorShell` (zakres `d`) i blok „nothing may stand in front of it” w podziale trójkątów.

Jeśli kontur nadal nie wychodzi, można awaryjnie ustawić pas szyby zmiennymi: `VISOR_Y0`, `VISOR_Y1` (jednostki modelu).

## Następne kroki

1. Dokończyć szybę z modelu (wyżej) i ewentualnie przestawić softbox (`studioEnv` w `Studio.jsx`, wektor `L`) pod normalną nowej szyby, tak żeby odblask był widoczny w końcowym kadrze.
2. Tekst „O mnie” w momencie przytrzymania (HOLD, ok. 1012–1120 vh) + kotwica `o-mnie` w menu.
3. Test na telefonie (kadr, wielkość kropek, wydajność: 150k kropek + świat w teksturze).
4. **Prawa:** zgoda na zdjęcie z Apple Music i wizerunek (YFL / wytwórnia / fotograf) zanim pliki pójdą na produkcję. Do tego czasu produkcja pokazuje zastępczą głowę.
5. Dopracowanie dyskografii (patrz notatka przy S5 w `SCENARIUSZ.md`).

## Mapa kodu

| Plik | Co robi |
|---|---|
| `src/story/story.config.js` | rozdział `reveal`, beaty `REVEAL` (switch, pull, scan, hold, end) |
| `src/story/StoryDirector.jsx` | wartości przejścia na stan (`revBulge`, `revPull`, `revScan`, `revHold`, `studioOn`) |
| `src/story/Compositor.jsx` | od szwu: świat → tekstura (`worldRT`), studio → ekran |
| `src/story/studio/Studio.jsx` | scena studia: kamera, szyba (shader odbicia), głowa ze zdjęciem, kropki, skan |
| `src/story/studio/headParts.js` | zastępcza głowa i okulary z kodu (fallback) |
| `src/story/studio/headAsset.js` | ładowanie modelu/kropek/zdjęcia; `HEAD_FIT`, `PHOTO_FIT` |
| `scripts/prepare-head.mjs` | surowy model → lekka głowa + szyba + kropki |

Strojenie na żywo w dev (konsola): `window.__headFit`, `window.__photoFit`, potem `window.__applyHeadFit()`.
