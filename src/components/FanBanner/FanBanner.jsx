import React, { useEffect, useRef } from 'react';
import { FaInstagram } from 'react-icons/fa';
import './FanBanner.css';

function FanBanner() {
  const ref = useRef(null);

  // Publish the banner's real height (it wraps to 2–3 lines on phones) so fixed UI
  // like the story overlay and the mini-player can sit above it on every screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--fan-banner-h', `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <aside ref={ref} className="fan-banner" aria-label="Informacja o stronie fanowskiej">
      <div className="fan-banner-inner">
        <span className="fan-banner-item">
          <span className="fan-banner-badge">FAN SITE</span>
          <span>To jest nieoficjalna strona fanowska.</span>
          <span className="fan-banner-sep" aria-hidden="true">•</span>
          <span>
            Oficjalna strona:{' '}
            <a
              href="https://yfl.pl"
              target="_blank"
              rel="noopener noreferrer"
              className="fan-banner-link"
            >
              yfl.pl ↗
            </a>
          </span>
        </span>

        <span className="fan-banner-item fan-banner-author">
          <span>Wykonał: Tomasz Szmajda (iTom)</span>
          <a
            href="https://www.instagram.com/itom.dev/"
            target="_blank"
            rel="noopener noreferrer"
            className="fan-banner-link fan-banner-ig"
            aria-label="Instagram twórcy @itom.dev"
          >
            <FaInstagram aria-hidden="true" />
            <span>@itom.dev ↗</span>
          </a>
        </span>
      </div>
    </aside>
  );
}

export default FanBanner;
