import React, { useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { MERCH, ECHO } from './story.config';
import { LOST_MEDIA_PRODUCT } from '../data/merch';

// =====================================================================
// S7: LOST MEDIA CD (DVD BOX) — Awwwards Spatial 3D Artifact Stage
// Zero generic "left product / right sidebar" split!
//  - Center stage: the physical 3D LOST MEDIA DVD Box stands dead center
//    with full-viewport 360° drag & central 3D optical magnifying loupe.
//  - Perimeter HUD: lightweight asymmetrical editorial flanks (left: title
//    & clinical specs, right: live view telemetry, price & full-drop link)
//    + subtle 1px clinical viewfinder corner brackets.
//  - Bottom center: floating glassmorphic Command Dock (3D Flip / Open +
//    primary pre-order CTA) keeping the 3D stage completely uncluttered.
// =====================================================================

export default function MerchOverlay({ storyVh, state }) {
  const rootOpacity = useTransform(
    storyVh,
    [MERCH.uiIn[0], MERCH.uiIn[1], MERCH.uiOut[0], MERCH.uiOut[1]],
    [0, 1, 1, 0]
  );
  const interactive = useTransform(storyVh, (v) =>
    v > MERCH.uiIn[0] + 4 && v < MERCH.uiOut[1] - 2 ? 'auto' : 'none'
  );
  const dockY = useTransform(storyVh, [MERCH.uiIn[0], MERCH.uiIn[1]], [28, 0]);
  const flankX = useTransform(storyVh, [MERCH.uiIn[0], MERCH.uiIn[1]], [18, 0]);
  const flankNegX = useTransform(storyVh, [MERCH.uiIn[0], MERCH.uiIn[1]], [-18, 0]);
  const [flipped, setFlipped] = useState(false);
  const [opened, setOpened] = useState(false);

  // leaving S7 (either way, or round the loop): the box goes back to its front, closed
  useMotionValueEvent(storyVh, 'change', (v) => {
    const away = v < MERCH.uiIn[0] - 20 || v > ECHO.chan1[1]; // (after the TV has switched away from it)
    if (!away || (!flipped && !opened)) return;
    setFlipped(false);
    setOpened(false);
    if (state?.current) {
      state.current.dvdFlip = 0;
      state.current.dvdOpen = 0;
    }
  });

  const toggleFlip = () => {
    setFlipped((prev) => {
      const next = !prev;
      if (state?.current) {
        state.current.dvdFlip = next ? 1 : 0;
        if (next) {
          state.current.dvdOpen = 0;
          setOpened(false);
        }
      }
      return next;
    });
  };

  const toggleOpen = () => {
    setOpened((prev) => {
      const next = !prev;
      if (state?.current) {
        state.current.dvdOpen = next ? 1 : 0;
        if (next) {
          state.current.dvdFlip = 0;
          setFlipped(false);
        }
      }
      return next;
    });
  };

  const p = LOST_MEDIA_PRODUCT;
  const viewMode = opened
    ? 'WIDOK // 03 · PŁYTA + BOOKLET'
    : flipped
      ? 'WIDOK // 02 · TYŁ · TRACKLISTA'
      : 'WIDOK // 01 · OKŁADKA DVD';

  return (
    <>
      <motion.section
        className="story-merch"
        style={{ opacity: rootOpacity }}
        aria-labelledby="merch-heading"
      >
      {/* Subtle 1px clinical viewfinder brackets framing the centered 3D artifact */}
      <div className="story-merch-frame" aria-hidden="true">
        <span className="story-merch-corner is-tl" />
        <span className="story-merch-corner is-tr" />
        <span className="story-merch-corner is-bl" />
        <span className="story-merch-corner is-br" />
      </div>

      {/* Top perimeter telemetry bar */}
      <header className="story-merch-head">
        <span>{p.code}</span>
        <span className="story-merch-hint">PRZECIĄGNIJ 360° · LUPA OPTYCZNA</span>
        <span className="story-merch-count">DVD BOX · CD</span>
      </header>

      {/* Left editorial flank — open typography, zero card clutter */}
      <motion.div className="story-merch-flank story-merch-left" style={{ x: flankNegX }}>
        <div className="story-merch-kicker-row">
          <span className="story-merch-dot" aria-hidden="true" />
          <span className="story-merch-kicker">{p.kicker}</span>
        </div>
        <h2 id="merch-heading" className="story-merch-title">
          {p.title}
        </h2>
        <span className="story-merch-edition">{p.edition}</span>
        <ul className="story-merch-specs">
          {p.specs.map((spec) => (
            <li key={spec}>{spec}</li>
          ))}
        </ul>
      </motion.div>

      {/* Right telemetry flank — balanced price, live 3D inspection state & full drop link */}
      <motion.div className="story-merch-flank story-merch-right" style={{ x: flankX }}>
        <span className="story-merch-viewmode">{viewMode}</span>
        <p className="story-merch-price">{p.price}</p>
        <span className="story-merch-tax">Z VAT · DOSTAWA GRUDZIEŃ 2026</span>
        <motion.a
          className="story-merch-secondary"
          style={{ pointerEvents: interactive }}
          href={p.secondaryLink}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>{p.secondaryCta}</span>
          <span aria-hidden="true">↗</span>
        </motion.a>
      </motion.div>

      {/* Compact mobile meta bar sitting cleanly above the dock */}
      <div className="story-merch-mobile-meta">
        <div>
          <span className="story-merch-mobile-kicker">{p.kicker}</span>
          <span className="story-merch-mobile-title">{p.title}</span>
        </div>
        <span className="story-merch-mobile-price">{p.price}</span>
      </div>

      {/* Bottom-center Awwwards Floating Command Dock */}
      <motion.nav
        className="story-merch-dock"
        style={{ y: dockY, pointerEvents: interactive }}
        aria-label="Sterowanie modelem 3D i zamówienie płyty"
      >
        <button
          type="button"
          className={`story-merch-dock-btn${flipped ? ' is-on' : ''}`}
          onClick={toggleFlip}
        >
          <span aria-hidden="true">↻</span>
          <span>{flipped ? 'PRZÓD' : 'TYŁ 180°'}</span>
        </button>

        <button
          type="button"
          className={`story-merch-dock-btn${opened ? ' is-on' : ''}`}
          onClick={toggleOpen}
        >
          <span aria-hidden="true">{opened ? '×' : '+'}</span>
          <span>{opened ? 'ZAMKNIJ' : 'OTWÓRZ'}</span>
        </button>

        <span className="story-merch-dock-sep" aria-hidden="true" />

        <a
          className="story-merch-dock-cta"
          href={p.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="story-merch-cta-line" aria-hidden="true" />
          <span>ZAMÓW · {p.price}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </motion.nav>
    </motion.section>

    </>
  );
}
