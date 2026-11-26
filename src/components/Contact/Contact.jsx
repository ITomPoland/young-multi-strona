import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { motion, useTransform, useSpring, useMotionValue, useMotionTemplate } from 'framer-motion';
import { FaInstagram, FaYoutube, FaSpotify } from 'react-icons/fa';
import { MERCH } from '../../story/story.config';
import MagneticButton from '../MagneticButton/MagneticButton';
import multiImg from '../../assets/multi-dark.avif';
import './Contact.css';

// =====================================================================
// S8 FINALE: YFL HQ // DIRECT LINE (Awwwards Dark Clinical Editorial)
// Synchronized 1:1 with the spinning LOST MEDIA CD center hole!
// As the camera dives through the laser-lit CD aperture (MERCH.portal),
// this stage opens radially from dead-center (50% 50%) with an optical
// cyan/crimson ring flash — zero black cut, seamless spatial arrival.
// =====================================================================

function useWarsawClock() {
  const [clock, setClock] = useState('--:--:--');
  useEffect(() => {
    const fmt = new Intl.DateTimeFormat('pl-PL', {
      timeZone: 'Europe/Warsaw',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    const tick = () => setClock(fmt.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return clock;
}

const Contact = forwardRef(({ storyVh }, ref) => {
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const fallbackVh = useMotionValue(MERCH.portal[1]);
  const vhSource = storyVh ?? fallbackVh;

  useImperativeHandle(ref, () => containerRef.current);

  // Synchronized 1:1 with the CD center-hole breach (MERCH.portal: [b - 58, b - 4])
  const portalProgress = useTransform(vhSource, [MERCH.portal[0], MERCH.portal[1]], [0, 1], { clamp: true });
  // Perspective-matched radial aperture growth (grows gently at first inside the hole, then rushes past the frame!)
  const irisRadius = useTransform(portalProgress, (t) => `${(Math.pow(t, 1.38) * 146).toFixed(2)}%`);
  const contentScale = useTransform(portalProgress, [0, 1], [1.12, 1.0]);
  const contentOpacity = useTransform(portalProgress, [0.04, 0.42], [0, 1], { clamp: true });
  const ringOpacity = useTransform(portalProgress, [0.02, 0.22, 0.78, 0.98], [0, 0.95, 0.7, 0], { clamp: true });
  const ringScale = useTransform(portalProgress, (t) => 0.12 + Math.pow(t, 1.38) * 2.75);
  const layerPointer = useTransform(portalProgress, (t) => (t > 0.25 ? 'auto' : 'none'));

  // Smooth cursor parallax for CEO portrait & giant background typography + reactive spotlight
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springConfig = { damping: 26, stiffness: 130 };
  const portraitX = useSpring(useTransform(mouseX, [-0.5, 0.5], [-16, 16]), springConfig);
  const portraitY = useSpring(useTransform(mouseY, [-0.5, 0.5], [-12, 12]), springConfig);
  const ceoTextX = useSpring(useTransform(mouseX, [-0.5, 0.5], [26, -26]), springConfig);

  const handleMouseMove = (e) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(rect.width, 1);
    const ny = (e.clientY - rect.top) / Math.max(rect.height, 1);
    mouseX.set(nx - 0.5);
    mouseY.set(ny - 0.5);
    el.style.setProperty('--mx', `${(nx * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(ny * 100).toFixed(1)}%`);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const warsawTime = useWarsawClock();
  const currentYear = new Date().getFullYear();

  return (
    <div ref={containerRef} id="kontakt" className="contact-wrapper" data-header-theme="dark">
      <div className="contact-sticky-view" ref={stageRef} onMouseMove={handleMouseMove}>
        {/* Expanding optical cyan/crimson laser ring riding the edge of the CD aperture */}
        <motion.div
          className="contact-portal-ring"
          aria-hidden="true"
          style={{ opacity: ringOpacity, scale: ringScale }}
        />

        <motion.div
          className="contact-iris-layer"
          style={{
            clipPath: useMotionTemplate`circle(${irisRadius} at 50% 50%)`,
            pointerEvents: layerPointer
          }}
        >
          <motion.section
            className="contact-section"
            style={{ scale: contentScale, opacity: contentOpacity }}
            aria-labelledby="contact-heading"
          >
            {/* Reactive studio spotlight & subtle architectural 1px grid */}
            <div className="contact-spotlight" aria-hidden="true" />
            <div className="contact-grid-lines" aria-hidden="true" />

            {/* Top clinical telemetry bar (unified with S6 O MNIE & S7 LOST MEDIA) */}
            <header className="contact-topbar">
              <span className="contact-top-tag">
                <span className="contact-pulse-dot" aria-hidden="true" />
                <span>TRACK 21 // YFL HQ DIRECT</span>
              </span>
              <span className="contact-top-clock">
                WARSAW · {warsawTime} CET · 52°13&apos;47&quot;N 21°00&apos;42&quot;E
              </span>
              <span className="contact-top-status">BOOKING OPEN · {currentYear}</span>
            </header>

            {/* Asymmetrical Awwwards Editorial Stage */}
            <div className="contact-stage">
              {/* Left: Editorial headline + kinetic hover-sweep email rows + magnetic social dock */}
              <div className="contact-editorial">
                <span className="contact-kicker">YOUNG FAMILY LABEL · MANAGEMENT &amp; BOOKING</span>
                <h2 id="contact-heading" className="contact-headline">
                  <span>YFL HQ</span>
                  <span className="contact-headline-accent">CONTACT</span>
                </h2>

                <div className="contact-channels" role="list">
                  <ChannelRow
                    index="01"
                    label="BIZNES & WSPÓŁPRACE"
                    email="BIZNES@YFL.PL"
                  />
                  <ChannelRow
                    index="02"
                    label="KONCERTY & BOOKING"
                    email="BOOKING@YFL.PL"
                  />
                </div>

                <div className="contact-socials" aria-label="Kanały Young Multi">
                  <SocialChip
                    icon={<FaInstagram />}
                    code="IG"
                    name="INSTAGRAM"
                    link="https://www.instagram.com/youngmulti/"
                  />
                  <SocialChip
                    icon={<FaYoutube />}
                    code="YT"
                    name="YOUTUBE"
                    link="https://www.youtube.com/channel/UCiP6-9NHJ36BCxUWL-gNKYg"
                  />
                  <SocialChip
                    icon={<FaSpotify />}
                    code="SP"
                    name="SPOTIFY"
                    link="https://open.spotify.com/artist/5CkZIA3WpaEFxp0wSjMzRI"
                  />
                  <SocialChip
                    code="YFL"
                    name="SKLEP.YFL.PL"
                    link="https://sklep.yfl.pl/"
                  />
                </div>
              </div>

              {/* Right: Architectural CEO Portrait framed with clinical viewfinder corners */}
              <div className="contact-portrait-col">
                <motion.span className="contact-ceo-bg" style={{ x: ceoTextX }} aria-hidden="true">
                  CEO
                </motion.span>
                <div className="contact-portrait-frame">
                  <span className="contact-corner is-tl" aria-hidden="true" />
                  <span className="contact-corner is-tr" aria-hidden="true" />
                  <span className="contact-corner is-bl" aria-hidden="true" />
                  <span className="contact-corner is-br" aria-hidden="true" />

                  <motion.img
                    src={multiImg}
                    alt="Young Multi — Founder & CEO Young Family Label"
                    className="contact-portrait-img"
                    style={{ x: portraitX, y: portraitY }}
                  />

                  <div className="contact-portrait-caption">
                    <span>YOUNG MULTI</span>
                    <span>FOUNDER &amp; CEO · EST. 2018</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Minimalist Editorial Footer */}
            <footer className="contact-footer">
              <span>© {currentYear} YOUNG FAMILY LABEL</span>
              <a
                href="https://itomdev.com"
                target="_blank"
                rel="noopener noreferrer"
                className="contact-creator-link"
              >
                DESIGN &amp; CODE: TOMASZ SZMAJDA (ITOM) · UNIWERSYTET OPOLSKI ↗
              </a>
              <button type="button" className="contact-top-btn" onClick={scrollToTop}>
                <span>POWRÓT NA START</span>
                <span aria-hidden="true">↑</span>
              </button>
            </footer>
          </motion.section>
        </motion.div>
      </div>
    </div>
  );
});

const ChannelRow = ({ index, label, email }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(email.toLowerCase());
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.location.href = `mailto:${email.toLowerCase()}`;
    }
  };

  return (
    <button
      type="button"
      className={`contact-channel${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      aria-label={`Skopiuj adres e-mail ${email}`}
    >
      <span className="contact-channel-sweep" aria-hidden="true" />
      <span className="contact-channel-meta">
        <span className="contact-channel-idx">{index}</span>
        <span className="contact-channel-label">{label}</span>
      </span>
      <span className="contact-channel-main">
        <span className="contact-channel-email">{copied ? 'SKOPIOWANO DO SCHOWKA' : email}</span>
        <span className="contact-channel-pill">
          <span>{copied ? '✓ GOTOWE' : 'KOPIUJ'}</span>
          <span className="contact-channel-arrow" aria-hidden="true">
            {copied ? '' : '↗'}
          </span>
        </span>
      </span>
    </button>
  );
};

const SocialChip = ({ icon, code, name, link }) => (
  <MagneticButton strength={0.28}>
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className="contact-social-chip"
      aria-label={`${name} — otwórz w nowej karcie`}
    >
      <span className="contact-social-icon" aria-hidden="true">
        {icon ?? code}
      </span>
      <span className="contact-social-name">{name}</span>
      <span className="contact-social-arrow" aria-hidden="true">
        ↗
      </span>
    </a>
  </MagneticButton>
);

export default Contact;
