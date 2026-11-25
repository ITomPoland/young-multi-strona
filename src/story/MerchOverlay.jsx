import React, { useState } from 'react';
import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import { MERCH, MERCH_COUNT } from './story.config';
import { storyVhToScroll } from './useStoryScroll';
import { MERCH_ITEMS } from '../data/merch';

// =====================================================================
// S7: SELECTED GOODS — Dark Lost Media archival DOM overlay
// Mirrors AboutOverlay & AlbumsOverlay's surgical typography and layout:
//  - Top bar: SELECTED GOODS · YFL ARCHIVE + 01 / 04
//  - Left column: active item's clinical code, status, title, price, note, shop CTA
//  - Right HUD (wide screens): interactive 4-item index (clicking jumps straight to item)
// Everything is scrubbed by scroll (reversible) and stays 100% clickable & accessible.
// =====================================================================

export default function MerchOverlay({ storyVh }) {
  const rootOpacity = useTransform(
    storyVh,
    [MERCH.uiIn[0], MERCH.uiIn[1], MERCH.uiOut[0], MERCH.uiOut[1]],
    [0, 1, 1, 0]
  );
  const pointerEvents = useTransform(storyVh, (v) =>
    v > MERCH.uiIn[0] + 4 && v < MERCH.uiOut[1] - 2 ? 'auto' : 'none'
  );

  const [active, setActive] = useState(0);
  useMotionValueEvent(storyVh, 'change', (v) => {
    const idx = Math.min(Math.max(Math.round(MERCH.focus(v)), 0), MERCH_COUNT - 1);
    setActive((prev) => (prev === idx ? prev : idx));
  });

  const item = MERCH_ITEMS[active] ?? MERCH_ITEMS[0];

  const jumpTo = (idx) => {
    window.scrollTo({ top: storyVhToScroll(MERCH.vhForItem(idx)), behavior: 'smooth' });
  };

  return (
    <motion.section
      className="story-merch"
      style={{ opacity: rootOpacity, pointerEvents }}
      aria-labelledby="merch-heading"
    >
      <h2 id="merch-heading" className="story-sr-only">
        Selected Goods — Young Family Label
      </h2>

      {/* Top archival header */}
      <header className="story-merch-head">
        <span>SELECTED GOODS · YFL ARCHIVE</span>
        <span className="story-merch-count">
          {String(active + 1).padStart(2, '0')} / {String(MERCH_COUNT).padStart(2, '0')}
        </span>
      </header>

      {/* Left editorial details for the focused 3D item */}
      <div className="story-merch-info" key={item.id}>
        <div className="story-merch-kicker-row">
          <span className="story-merch-code">{item.code}</span>
          <span className={`story-merch-badge${item.statusType === 'live' ? ' is-live' : ''}`}>
            {item.status}
          </span>
        </div>

        <span className="story-merch-cat">{item.category}</span>
        <h3 className="story-merch-title">{item.name}</h3>
        <p className="story-merch-price">{item.price}</p>
        <p className="story-merch-note">{item.note}</p>

        <a
          className="story-merch-cta"
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="story-merch-cta-line" aria-hidden="true" />
          <span>{item.cta}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      {/* Right interactive index (wide screens) */}
      <aside className="story-merch-hud" aria-label="Produkty Selected Goods">
        <div className="about-hud-head">
          <span>ARCHIWUM DROPÓW</span>
          <span className="about-hud-count">YFL</span>
        </div>
        <ol className="about-hud-list">
          {MERCH_ITEMS.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                className={`story-merch-hud-btn${i === active ? ' is-on' : ''}${i < active ? ' is-past' : ''}`}
                onClick={() => jumpTo(i)}
              >
                <span className="about-hud-index">{it.index}</span>
                <span className="about-hud-bar" />
                <span className="story-merch-hud-name">{it.name}</span>
              </button>
            </li>
          ))}
        </ol>
        <a
          className="story-merch-store"
          href="https://sklep.yfl.pl"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>PEŁNY SKLEP YFL</span>
          <span aria-hidden="true">↗</span>
        </a>
      </aside>
    </motion.section>
  );
}
