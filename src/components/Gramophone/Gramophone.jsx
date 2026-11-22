// Plik: /src/components/Gramophone/Gramophone.jsx

import React, { useState, useEffect } from 'react';
import { useTransform, motion } from 'framer-motion';
import './Gramophone.css';
import ScrollStack, { ScrollStackItem } from '../ScrollStack/ScrollStack';

// Responsive image imports with srcset
import nowaFalaSrcset from '../../assets/NowafalaCover.avif?w=150;300;450&format=avif&as=srcset';
import nowaFalaFallback from '../../assets/NowafalaCover.avif?w=300&format=avif';
import trapstarSrcset from '../../assets/trapstarCover.avif?w=150;300;450&format=avif&as=srcset';
import trapstarFallback from '../../assets/trapstarCover.avif?w=300&format=avif';
import tadSrcset from '../../assets/tadCover.avif?w=150;300;450&format=avif&as=srcset';
import tadFallback from '../../assets/tadCover.avif?w=300&format=avif';
import toxicSrcset from '../../assets/toxicCover.avif?w=150;300;450&format=avif&as=srcset';
import toxicFallback from '../../assets/toxicCover.avif?w=300&format=avif';

const albums = [
  {
    id: 1,
    title: 'NOWA FALA',
    year: '2017',
    styleId: 'nowa-fala',
    srcset: nowaFalaSrcset,
    fallback: nowaFalaFallback,
    desc: 'Oficjalny debiut, który zadebiutował na 1. miejscu OLiS. Przełomowy moment przejścia z YouTube do rapu. Album finalnie pokrył się Platyną, a single takie jak "Plecak" czy "Pytasz mnie" stały się wiralami.',
    tracklist: ['1. Nowa Fala', '2. Pytasz mnie', '3. Plecak', '4. Pogba', '5. Diamenty (feat. Bedoes)', '6. ....']
  },
  {
    id: 2,
    title: 'TRAPSTAR',
    year: '2018',
    styleId: 'trapstar',
    srcset: trapstarSrcset,
    fallback: trapstarFallback,
    desc: 'Album ugruntowujący pozycję na scenie newschoolu. Dojrzalsze brzmienie i mocni goście – m.in. Peja (na tracku "Podziały"), Bedoes i Żabson. Projekt ponownie trafił na szczyt listy OLiS.',
    tracklist: ['1. Trapstar', '2. Skrzydła', '3. Podziały (feat. Peja)', '4. Kosmita (feat. Żabson)', '5. Kiedy odejdę (feat. Bedoes)', '6. ....']
  },
  {
    id: 3,
    title: 'TRAP AFTER DEATH',
    year: '2019',
    styleId: 'tad',
    srcset: tadSrcset,
    fallback: tadFallback,
    desc: 'Mroczny, spójny materiał wyprodukowany w całości przez Fast Life Sharky\'ego. Mniej komercyjny, nastawiony na cięższy trap i eksperymenty. Gościnnie m.in. Żabson i Aleshen.',
    tracklist: ['1. 9 żyć', '2. Skate 3', '3. Torba', '4. Modelki (feat. Aleshen)', '5. K4fle! (feat. Żabson)', '6. ....']
  },
  {
    id: 4,
    title: 'TOXIC',
    year: '2021',
    styleId: 'toxic',
    srcset: toxicSrcset,
    fallback: toxicFallback,
    desc: 'Wielki powrót w stylu rage/hyperpop po przerwie wydawniczej. Album uzyskał status Platynowej Płyty. Gościnnie pojawili się m.in. White 2115, White Widow i Miszel.',
    tracklist: ['1. Toxic Luv (feat. White 2115)', '2. Bez serca', '3. Beksa', '4. Oscar (feat. White Widow)', '5. Sól', '6. ....']
  },
];

function Gramophone({ contentProgress, isMenuOpen, style }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // === OPTION A: CARDS SCATTER & STAGE BLACKOUT ===
  const scatterProgress = useTransform(contentProgress, [0.57, 0.69], [0, 1]);

  // 3D world breathes gently as cards separate
  const skewX3D = isMobile ? 0 : -25;
  const skewY3D = isMobile ? 0 : 7;
  const scale3D = isMobile ? 1 : 0.85;

  const skewX = useTransform(scatterProgress, [0, 1], [skewX3D, isMobile ? 0 : -8]);
  const skewY = useTransform(scatterProgress, [0, 1], [skewY3D, isMobile ? 0 : 2]);
  const worldScale = useTransform(scatterProgress, [0, 1], [scale3D, isMobile ? 0.94 : 0.78]);
  const bgGridScale = useTransform(scatterProgress, [0, 1], [scale3D, isMobile ? 0.9 : 0.72]);

  // Heading floats upward & vanishes cleanly before About rises
  const titleY = useTransform(contentProgress, [0.57, 0.64], [0, -110]);
  const titleOpacity = useTransform(contentProgress, [0.57, 0.635], [1, 0]);
  const titleScale = useTransform(contentProgress, [0.57, 0.64], [1, 0.92]);

  // Smooth architectural-grid -> concert-stage blackout veil
  const blackoutOpacity = useTransform(contentProgress, [0.585, 0.675], [0, 1]);

  return (
    <motion.div
      className="Gramophone-section"
      style={style}
    >
      <motion.div
        className="gramophone-background-boxes"
        style={{
          skewX,
          skewY,
          scale: bgGridScale,
          x: '0%',
          y: '0%',
          z: 0,
          willChange: 'transform'
        }}
      >
        <div className="gramophone-css-grid" />
      </motion.div>

      <motion.div
        className="gramophone-content-world"
        style={{
          skewX,
          skewY,
          scale: worldScale,
          x: '0%',
          willChange: 'transform'
        }}
      >
        <motion.h2
          className="gramophone-title-static"
          style={{ y: titleY, opacity: titleOpacity, scale: titleScale }}
        >
          DYSKOGRAFIA
        </motion.h2>

        <ScrollStack
          className="gramophone-scroller"
          itemDistance={20}
          itemStackDistance={isMobile ? 40 : 20}
          baseScale={0.9}
          stackPosition="0%"
          scaleEndPosition="80%"
          scrollProgress={contentProgress}
          scatterProgress={scatterProgress}
          isMenuOpen={isMenuOpen}
        >
          {albums.map((album) => (
            <ScrollStackItem
              key={album.id}
              itemClassName={`album-card album-style-${album.styleId}`}
            >
              <div className="album-header">
                <h2>{album.title}</h2>
                <p>{album.year}</p>
              </div>

              <div className="album-content">
                <div className="album-desc">
                  <h3>Opis</h3>
                  <p>{album.desc}</p>
                </div>

                <div className="album-cover">
                  <div className="album-cover-standard-container">
                    <img
                      srcSet={album.srcset}
                      src={album.fallback}
                      sizes="(max-width: 768px) 40vw, 20vw"
                      alt={album.title}
                      loading="lazy"
                    />
                  </div>
                </div>

                <div className="album-tracklist">
                  <h3>Tracklista</h3>
                  <ul>
                    {album.tracklist.map(track => <li key={track}>{track}</li>)}
                  </ul>
                </div>
              </div>
            </ScrollStackItem>
          ))}
        </ScrollStack>
      </motion.div>

      {/* Stage blackout veil melting the white architectural grid into pure stage black */}
      <motion.div
        className="gramophone-blackout-veil"
        style={{ opacity: blackoutOpacity }}
        aria-hidden="true"
      />
    </motion.div>
  );
}

export default Gramophone;
