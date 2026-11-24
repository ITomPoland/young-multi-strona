# S6: przejście w okulary Multiego — stan i co dalej (24.11.2026, wieczór)

Notatka do kontynuacji na innym komputerze. Scenariusz całej sekcji: `SCENARIUSZ.md`, S6.

## Co już działa

- **Reveal zaraz po LOST MEDIA:** rozdział albumów kończy się na LOST MEDIA (810 vh), ekran staje się szybą przy 814, odjazd 824–904, skan 896–938, HOLD („O mnie”) 938–1190, koniec 1230.
- **„O mnie” jako odczyt skanu, kropki zmieniają kształt** (`AboutOverlay.jsx`, oś czasu `ABOUT` w `story.config.js`, kształty w `studio/aboutShapes.js`): głowa z kropek zostaje na środku (kamera prawie na wprost). „SKAN ZAKOŃCZONY”, imię się dekoduje, potem trzy rozdziały w lewej kolumnie (zdanie podświetlane słowo po słowie, kluczowe słowa turkusowe), a kropki przy każdym rozdziale przelewają się w kształt tematu: 01 pad (gry, YouTube), 02 winyl (Nowa Fala; etykieta w kolorze okładki, kręci się), 03 logo YFL (z `logoyflbiale.avif`). Przelot: każda kropka rusza o swojej porze, w locie wiruje wokół osi i płynie w polu turbulencji, świeci i turkusowieje od prędkości (jak na igloo.inc); między rozdziałami kształty lekko się bujają, kursor rozpycha kropki. Po prawej spis rozdziałów (aktywny podświetlony) i „FORMA: …”. Na liczbach kropki wracają w głowę Michała. Tekst w trzeciej osobie (strona fanowska). Stara sekcja `About` (po historii, przed merchem) jest usunięta, `NewSong` zaczyna się od razu od dymu.
- **Wieża się nie zatrzymuje:** za LOST MEDIA kamera jedzie dalej w górę wieży, okładki się powtarzają (`TOWER_PANELS` w `story.config.js`), ale widać je już tylko w odbiciu. Powtórzone okładki są od razu czyste (bez glitcha i pękania), a w trakcie reveal żadna okładka nie „odpala się” ponownie.
- **Szew:** ekran po cichu staje się szybą okularów (klatka 1:1), potem wybrzuszenie szkła, ciemniejący brzeg. Odjazd rusza jeszcze w trakcie wybrzuszenia, łagodnie od zera (krzywa `1 - (1-t)^3 (1+3t)`, bez kopa na starcie).
- **Odjazd:** kamera na sprężynie, zakotwiczona na szybie nad lewym okiem (nie skacze), dolly zoom, łuk do 3/4; głowa „zauważa” kamerę.
- **Odbicie przyklejone do szyby:** środek świata zostaje w punkcie, z którego startowała kamera (nad lewym okiem), i nigdy się nie przesuwa. Najpierw świat stoi na ekranie, a głowa pojawia się wokół niego; potem zostaje w końcowej skali (`HY_END` w `Studio.jsx`), więc okładki nigdy nie są mniejsze niż na końcu i nie „rozjeżdżają się”. Pokrywa całą szybę. Tekstura świata zawiera tylko widoczną część szyby (`lensRect`, kamera świata z przyciętym/poszerzonym kadrem w `Compositor.jsx`), więc obraz jest ostry z każdej odległości. Świat nie znika do skanu: przygasa do ~60% i kręci się dalej w okularach.
- **Szyba Balenciagi:** zbudowana od zera w `scripts/prepare-head.mjs`. Kontur obrysowany na zdjęciu (`VISOR_TRACE`, piksele zdjęcia), krzywizna dopasowana do powierzchni modelu (wielomian, dredy odrzucone), szyba ~1 mm przed powłoką AI. Model z Meshy był robiony z tego zdjęcia i pokrywa się z nim z przodu (`PHOTO_REG`), więc kontur ze zdjęcia leży idealnie na modelu.
- **Wygląd szyby:** czarny połysk, pasek światła nad planem (cienka linia odblasku), szary gradient u góry jak na zdjęciu, polerowana krawędź łapiąca światło, softbox i turkusowy rim.
- **Głowa:** zdjęcie rzutowane z przodu (`PHOTO_FIT` przeliczony na nowe zdjęcie 2000 px). Światło punktowe na twarz: ramiona i ucięte krawędzie popiersia znikają w ciemności.
- **Skan:** laser zjeżdża po głowie, nad linią głowa zamienia się w kropki w kolorach zdjęcia. Szyba też: nad linią znika, zamiast niej kropki, a gdy laser minie szybę, odbicie znika i świat przestaje się renderować. Poświata lasera gaśnie razem ze światłem punktowym (bez świecącego obrysu uciętego popiersia).
- **HOLD:** głowa śledzi kursor, kursor rozpycha kropki, wracają po zatrzymaniu.
- **Telefon:** na wąskim ekranie kamera kończy dalej i przesuwa kadr, żeby głowa mieściła się w poprzek.
- Bez plików modelu/zdjęcia strona pokazuje zastępczą głowę (kula + okulary z kodu) i nic się nie wywala.

## Pliki, których NIE MA w gicie (trzeba przenieść ręcznie!)

Foldery `public/studio/` i `art/` są w `.gitignore` (wizerunek Multiego + zdjęcie bez zgody na publikację).
Na drugi komputer skopiuj:

| Plik | Skąd | Uwagi |
|---|---|---|
| `art/meshy/multi-head-raw.glb` | z Meshy: `Meshy_AI_Neon_Dread_Silence_20261124_generate.glb` (91 MB) | surowy model, wejście skryptu |
| `public/studio/multi-portrait.jpg` | zbliżenie twarzy 2000×2000 (to z okularami i dredami, kadr do ust), zapisane jako JPG | zdjęcie rzutowane na głowę; `PHOTO_FIT`, `PHOTO_REG` i `VISOR_TRACE` są skalibrowane DOKŁADNIE pod ten kadr |
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

## Jak przestroić szybę

Kontur szyby jest w `scripts/prepare-head.mjs` → `VISOR_TRACE` (piksele zdjęcia: lewa/prawa krawędź, góra, promienie rogów, punkty dolnej krawędzi z wcięciem na nos). Po zmianie uruchom skrypt ponownie i przeładuj stronę. Inne zdjęcie = trzeba na nowo zmierzyć `PHOTO_REG` (nakładka krawędzi modelu na zdjęcie) i `VISOR_TRACE`, a potem przeliczyć `PHOTO_FIT` (wzór w komentarzu w `headAsset.js`).

## Wydajność: preloader ładuje wszystko

- Preloader czeka na: fonty, pierwszą klatkę historii (zdjęcie pokoju, okładki), **głowę (model, kropki, zdjęcie) i logo YFL**, a potem na **rozgrzewkę GPU** (`warmUp` w `Compositor.jsx`, `whenStoryWarm` w `storyReady.js`): wszystkie shadery obu scen skompilowane (także ukryta wieża, studio i pył z hero), wszystkie tekstury i modele wgrane, poza ekranem, do celu tego samego typu co prawdziwe. Pasek staje na 94%, dopóki rozgrzewka się nie skończy (limit 9 s).
- Zmierzone (dev): po preloaderze, przez całą historię do przodu i do tyłu, **0 kompilacji shaderów i 0 nowych tekstur/buforów**.
- Pułapki, które to psuły: przebiegi Kompozytora przebudowywały się przy zmianie poziomu jakości (koniec preloadera) i wyrzucały rozgrzane programy (teraz `glow` to uniform); bufory pyłu i odbicia przydzielały się przy pierwszym użyciu (teraz przy zmianie rozmiaru).
- Uwaga: `npm run build` kopiuje lokalne `public/studio/` (głowa, zdjęcie) do `dist/`. Wdrożenie z gita ich nie ma (pokazuje zastępczą głowę), ale ręczne wrzucenie lokalnego `dist/` opublikowałoby wizerunek i zdjęcie bez zgody.

## Naprawione błędy

- Poświata albumów (kolor pustki wokół wieży) nie działała przy pierwszym przejściu: materiały wieży trzymały własną kopię liczby `uTintAmt` z chwili montażu (wtedy 0). Teraz pętla klatek ustawia ją w każdym materiale (`Tower.jsx`).

- Przeskok na szwie (wszystko na chwilę się pomniejszało i powiększało, LOST MEDIA „odsłaniała się” drugi raz). Przyczyna: na końcu sekcji albumów pojawia się mini-odtwarzacz, co odświeża `StorySection` → `StoryCanvas` → `Tower`. Wieża miała uniformy okładek i ich `userData` (stan zablokowania) wpisane w JSX, więc każde odświeżenie dawało materiałom świeże obiekty: fokus, wygięcie i odsłonięcie wracały do zera i animowały się od nowa. To samo powodowało wcześniej brak poświaty. Teraz wszystkie uniformy i `userData` wieży są tworzone raz (`useMemo` w `Tower.jsx`), a `StoryCanvas` jest w `React.memo`. Przy okazji: studio jest kompilowane z wyprzedzeniem (PREWARM w `Studio.jsx`), zacięta klatka nie liczy się jako prędkość scrolla (`StoryDirector.jsx`), sprężyna kamery studia startuje od bieżącego scrolla.

- Przeskok przy cofaniu z okularów do albumów: kamera studia jedzie na sprężynie i przy szybkim scrollu w górę była jeszcze w połowie odjazdu, gdy ekran wracał do wieży. Teraz reżyser oddaje ekran światu dopiero, gdy kamera wróci na szybę (`s.studioU` ≈ 0, `StoryDirector.jsx`).

## Następne kroki

1. S7: kropki z głowy spływają i składają się w koszulkę STEALTH ERA (z `tshirt.avif`), potem bluzy, każda odsłania się jak okładka albumu.
2. Test na prawdziwym telefonie (wydajność: 150k kropek + świat w teksturze; kadr sprawdzony tylko w emulacji 390×844).
3. **Prawa:** zgoda na zdjęcie z Apple Music i wizerunek (YFL / wytwórnia / fotograf) zanim pliki pójdą na produkcję. Do tego czasu produkcja pokazuje zastępczą głowę.
4. Dopracowanie dyskografii (patrz notatka przy S5 w `SCENARIUSZ.md`).

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
