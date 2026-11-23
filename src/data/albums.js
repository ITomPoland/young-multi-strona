// Discography shown on the album ring (story chapter S5). Tracklists are kept for the
// album "scene" opened on click (next step).
import nowaFala from '../assets/NowafalaCover.avif?w=1024&format=avif';
import trapstar from '../assets/trapstarCover.avif?w=1024&format=avif';
import tad from '../assets/tadCover.avif?w=1024&format=avif';
import toxic from '../assets/toxicCover.avif?w=1024&format=avif';

export const ALBUMS = [
  {
    id: 'nowa-fala',
    title: 'NOWA FALA',
    year: '2017',
    cover: nowaFala,
    note: 'Debiut. 1. miejsce OLiS, Platyna.',
    tracklist: ['Nowa Fala', 'Pytasz mnie', 'Plecak', 'Pogba', 'Diamenty (feat. Bedoes)']
  },
  {
    id: 'trapstar',
    title: 'TRAPSTAR',
    year: '2018',
    cover: trapstar,
    note: 'Znowu szczyt OLiS. Peja, Bedoes, Żabson.',
    tracklist: ['Trapstar', 'Skrzydła', 'Podziały (feat. Peja)', 'Kosmita (feat. Żabson)', 'Kiedy odejdę (feat. Bedoes)']
  },
  {
    id: 'trap-after-death',
    title: 'TRAP AFTER DEATH',
    year: '2019',
    cover: tad,
    note: 'Całość: Fast Life Sharky. Ciemno i ciężko.',
    tracklist: ['9 żyć', 'Skate 3', 'Torba', 'Modelki (feat. Aleshen)', 'K4fle! (feat. Żabson)']
  },
  {
    id: 'toxic',
    title: 'TOXIC',
    year: '2021',
    cover: toxic,
    note: 'Powrót w stylu rage. Platyna.',
    tracklist: ['Toxic Luv (feat. White 2115)', 'Bez serca', 'Beksa', 'Oscar (feat. White Widow)', 'Sól']
  }
];
