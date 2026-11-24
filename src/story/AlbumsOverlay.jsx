import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { ALBUMS } from '../data/albums';
import { CHAPTER_RANGES, FIRST_ALBUM_VH, albumFocus } from './story.config';
import { requestOpen, requestClose } from './sceneState';
import { lockScroll, unlockScroll } from '../lib/scrollLock';
import AlbumScene from './AlbumScene';
import { cssColor } from './world/albumColor';

// S5 overlay: the name of the album in focus (DOM = crisp, indexable). It swaps as the
// camera flies past one billboard to the next. Clicking the album in focus (anywhere on
// the frame, or its button) opens its scene: the 3D cover flies onto the view and becomes
// the backdrop (Tower + sceneState.js), the tracklist barrel comes in (AlbumScene).
export default function AlbumsOverlay({ storyVh, state }) {
  const [, albumsEnd] = CHAPTER_RANGES.albums;
  const [focus, setFocus] = useState(-1);
  const [open, setOpen] = useState(-1);
  const openVh = useRef(0);

  useMotionValueEvent(storyVh, 'change', (v) => {
    // the page moved anyway while a scene was open (menu jump, focus): let it go
    if (open >= 0 && Math.abs(v - openVh.current) > 12) close();
    const f = albumFocus(v);
    const i = Math.round(f);
    // only name an album while the camera is (almost) on it
    const next = i >= 0 && i < ALBUMS.length && Math.abs(f - i) < 0.28 ? i : -1;
    setFocus((prev) => (prev === next ? prev : next));
  });

  const opacity = useTransform(
    storyVh,
    [FIRST_ALBUM_VH - 26, FIRST_ALBUM_VH - 8, albumsEnd - 44, albumsEnd - 26],
    [0, 1, 1, 0]
  );
  const album = focus >= 0 ? ALBUMS[focus] : null;

  const openAlbum = (e) => {
    if (focus < 0 || open >= 0) return;
    const frame = e.currentTarget.closest('.story-sticky')?.getBoundingClientRect();
    let x = 0.2;
    let y = 0;
    // pointer click: pull from where it was clicked (keyboard: from the middle)
    if (frame && e.detail > 0) {
      x = ((e.clientX - frame.left) / frame.width) * 2 - 1;
      y = -(((e.clientY - frame.top) / frame.height) * 2 - 1);
    }
    requestOpen(state.current, focus, x, y);
    openVh.current = storyVh.get();
    lockScroll();
    setOpen(focus);
  };

  const close = useCallback(() => {
    requestClose(state.current);
    unlockScroll();
    setOpen(-1);
  }, [state]);

  // never leave the page locked if the overlay goes away while open
  useEffect(() => () => {
    if (state.current.scene?.target) {
      requestClose(state.current);
      unlockScroll();
    }
  }, [state]);

  const canOpen = album && open < 0;
  // the album's own colour (read from its cover by the Tower), for its accents
  const tintOf = (i) => {
    const c = state.current.albumColors?.[i];
    return c ? cssColor(c) : undefined;
  };

  return (
    <motion.div className="story-albums" style={{ opacity }}>
      <h2 className="story-sr-only">Dyskografia</h2>

      {/* the whole frame is the album while one is in focus */}
      {canOpen && (
        <button type="button" className="story-albums-hit" onClick={openAlbum} tabIndex={-1} aria-hidden="true" />
      )}

      <div className={`story-albums-head${open >= 0 ? ' is-hidden' : ''}`} aria-hidden="true">
        <span>DYSKOGRAFIA</span>
        <span className="story-albums-count">
          {String(Math.max(focus, 0) + 1).padStart(2, '0')} / {String(ALBUMS.length).padStart(2, '0')}
        </span>
      </div>
      <AnimatePresence mode="wait">
        {canOpen && (
          <motion.div
            key={album.id}
            className="story-albums-name"
            style={{ '--album-tint': tintOf(focus) }}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <span className="story-albums-year">{album.upcoming ? `ZAPOWIEDŹ · ${album.year}` : album.year}</span>
            <h3 className="story-albums-title">{album.title}</h3>
            <p className="story-albums-note">{album.note}</p>
            <button type="button" className="story-albums-open" onClick={openAlbum}>
              <span className="story-albums-open-line" aria-hidden="true" />
              {album.upcoming ? 'ODTWÓRZ TAŚMĘ' : 'TRACKLISTA'}
              <span aria-hidden="true"> ↗</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{open >= 0 && <AlbumScene key={ALBUMS[open].id} album={ALBUMS[open]} tint={tintOf(open)} onClose={close} />}</AnimatePresence>
    </motion.div>
  );
}
