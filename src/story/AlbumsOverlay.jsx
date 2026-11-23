import React, { useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ALBUMS } from '../data/albums';
import { CHAPTER_RANGES, FIRST_ALBUM_VH, albumFocus } from './story.config';

// S5 overlay: the name of the album in focus (DOM = crisp, indexable). It swaps as the
// camera flies past one billboard to the next; the tracklist comes with the album scene (next step).
export default function AlbumsOverlay({ storyVh }) {
  const [, albumsEnd] = CHAPTER_RANGES.albums;
  const [focus, setFocus] = useState(-1);

  useMotionValueEvent(storyVh, 'change', (v) => {
    const f = albumFocus(v);
    const i = Math.round(f);
    // only name an album while the camera is (almost) on it
    const next = i >= 0 && Math.abs(f - i) < 0.28 ? i : -1;
    setFocus((prev) => (prev === next ? prev : next));
  });

  const opacity = useTransform(
    storyVh,
    [FIRST_ALBUM_VH - 26, FIRST_ALBUM_VH - 8, albumsEnd - 44, albumsEnd - 26],
    [0, 1, 1, 0]
  );
  const album = focus >= 0 ? ALBUMS[focus] : null;

  return (
    <motion.div className="story-albums" style={{ opacity }}>
      <h2 className="story-sr-only">Dyskografia</h2>
      <div className="story-albums-head" aria-hidden="true">
        <span>DYSKOGRAFIA</span>
        <span className="story-albums-count">
          {String(Math.max(focus, 0) + 1).padStart(2, '0')} / {String(ALBUMS.length).padStart(2, '0')}
        </span>
      </div>
      <AnimatePresence mode="wait">
        {album && (
          <motion.div
            key={album.id}
            className="story-albums-name"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="story-albums-year">{album.year}</span>
            <h3 className="story-albums-title">{album.title}</h3>
            <p className="story-albums-note">{album.note}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
