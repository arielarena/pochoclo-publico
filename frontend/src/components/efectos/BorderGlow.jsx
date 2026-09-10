import { useRef, useCallback, useState, useEffect } from 'react';
import { prefiereMenosMovimiento } from '../../utils/movimiento.js';

/**
 * Adaptado de reactbits.dev/components/border-glow (variante TS-TW, sin
 * dependencias externas). Colores por defecto ajustados a la paleta
 * "cine a medianoche" de Pochoclo (dorado manteca + rojo terciopelo) en vez
 * de los violeta/rosa/celeste originales. Se usa para el botón de "Me
 * siento con suerte" en cada formulario de búsqueda.
 */
function parseHSL(hslStr) {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 38, s: 89, l: 55 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

function buildBoxShadow(glowColor, intensity) {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const layers = [
    [0, 0, 0, 1, 100, true],
    [0, 0, 1, 0, 60, true],
    [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true],
    [0, 0, 15, 0, 30, true],
    [0, 0, 25, 2, 20, true],
    [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false],
    [0, 0, 3, 0, 50, false],
    [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false],
    [0, 0, 25, 2, 20, false],
    [0, 0, 50, 2, 10, false],
  ];
  return layers
    .map(([x, y, blur, spread, alpha, inset]) => {
      const a = Math.min(alpha * intensity, 100);
      return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`;
    })
    .join(', ');
}

function easeOutCubic(x) {
  return 1 - Math.pow(1 - x, 3);
}
function easeInCubic(x) {
  return x * x * x;
}

function animateValue({ start = 0, end = 100, duration = 1000, delay = 0, ease = easeOutCubic, onUpdate, onEnd }) {
  const t0 = performance.now() + delay;
  function tick() {
    const elapsed = performance.now() - t0;
    const t = Math.min(elapsed / duration, 1);
    onUpdate(start + (end - start) * ease(t));
    if (t < 1) requestAnimationFrame(tick);
    else if (onEnd) onEnd();
  }
  setTimeout(() => requestAnimationFrame(tick), delay);
}

const GRADIENT_POSITIONS = ['80% 55%', '69% 34%', '8% 6%', '41% 38%', '86% 85%', '82% 18%', '51% 4%'];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildMeshGradients(colors) {
  const gradients = [];
  for (let i = 0; i < 7; i++) {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    gradients.push(`radial-gradient(at ${GRADIENT_POSITIONS[i]}, ${c} 0px, transparent 50%)`);
  }
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`);
  return gradients;
}

export default function BorderGlow({
  children,
  className = '',
  edgeSensitivity = 30,
  /**
   * Piso de "proximidad al borde" mientras el puntero esté encima (o el
   * teclado tenga el foco adentro).
   *
   * El componente original calcula la intensidad a partir de qué tan cerca
   * del borde está el cursor, y en el centro exacto esa distancia es 0. En
   * una card grande eso está bien: se entra por un borde y el efecto se
   * enciende al pasar. En un botón de 318x44 no, porque el usuario apunta al
   * medio para hacer click, y ahí el efecto se apagaba entero (medido: las
   * tres capas en opacidad 0 con el mouse en el centro). O sea que el brillo
   * no se veía nunca en el único momento en que importaba.
   *
   * Con un piso, el borde queda encendido apenas el puntero entra, y acercarse
   * a un lado sigue intensificándolo. En 0 se comporta como el original.
   */
  proximidadMinima = 0,
  /**
   * Manteca exacta, en HSL porque buildBoxShadow necesita descomponerla para
   * armar las 13 capas del resplandor. #f2a317 es hsl(38.4 89.4% 52%); acá
   * decía 58% de luminosidad, o sea un dorado que NO era el de la paleta.
   */
  glowColor = '38.4 89.4% 52%',
  /**
   * El token, no el hex: era `#241a2e` escrito a mano, que es superficie
   * duplicada. Entra en un `background` y dentro de un linear-gradient, y las
   * variables CSS funcionan en los dos lugares.
   */
  backgroundColor = 'var(--color-superficie)',
  borderRadius = 999,
  glowRadius = 28,
  glowIntensity = 1.1,
  coneSpread = 25,
  animated = false,
  /**
   * Los colores de la malla animada del borde. Los dos primeros son tokens;
   * el tercero es un dorado más claro que servía de brillo y estaba escrito
   * como `#ffd37a`, un OCTAVO color que no está en la paleta. Ahora se deriva
   * de manteca, así que no hay ningún color suelto que se pueda desincronizar
   * del resto si algún día se ajusta el dorado.
   */
  colors = [
    'var(--color-manteca)',
    'var(--color-terciopelo)',
    'color-mix(in srgb, var(--color-manteca) 60%, white)',
  ],
  fillOpacity = 0.5,
}) {
  const cardRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  /**
   * Con teclado no hay puntero, así que sin esto el botón enfocado con Tab no
   * mostraba ninguna de las señales que sí ve quien usa mouse.
   */
  const [tieneFoco, setTieneFoco] = useState(false);
  const [cursorAngle, setCursorAngle] = useState(45);
  const [edgeProximity, setEdgeProximity] = useState(0);
  const [sweepActive, setSweepActive] = useState(false);

  const getCenterOfElement = useCallback((el) => {
    const { width, height } = el.getBoundingClientRect();
    return [width / 2, height / 2];
  }, []);

  const getEdgeProximity = useCallback(
    (el, x, y) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      let kx = Infinity;
      let ky = Infinity;
      if (dx !== 0) kx = cx / Math.abs(dx);
      if (dy !== 0) ky = cy / Math.abs(dy);
      return Math.min(Math.max(1 / Math.min(kx, ky), 0), 1);
    },
    [getCenterOfElement]
  );

  const getCursorAngle = useCallback(
    (el, x, y) => {
      const [cx, cy] = getCenterOfElement(el);
      const dx = x - cx;
      const dy = y - cy;
      if (dx === 0 && dy === 0) return 0;
      const radians = Math.atan2(dy, dx);
      let degrees = radians * (180 / Math.PI) + 90;
      if (degrees < 0) degrees += 360;
      return degrees;
    },
    [getCenterOfElement]
  );

  const handlePointerMove = useCallback(
    (e) => {
      const card = cardRef.current;
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setEdgeProximity(getEdgeProximity(card, x, y));
      setCursorAngle(getCursorAngle(card, x, y));
    },
    [getEdgeProximity, getCursorAngle]
  );

  useEffect(() => {
    if (!animated) return;
    const angleStart = 110;
    const angleEnd = 465;

    /**
     * Con movimiento reducido, el barrido de luz se reemplaza por un
     * resplandor QUIETO en vez de no mostrar nada. Sin esto el botón se
     * quedaría sin ningún borde encendido hasta que alguien le pase el mouse
     * por encima, o sea nunca en una pantalla táctil, y el efecto que le da
     * identidad desaparecería para quien pidió menos movimiento, que no es lo
     * mismo que pedir menos diseño.
     */
    if (prefiereMenosMovimiento()) {
      setSweepActive(true);
      setCursorAngle(angleStart);
      setEdgeProximity(1);
      return;
    }

    setSweepActive(true);
    setCursorAngle(angleStart);

    animateValue({ duration: 500, onUpdate: (v) => setEdgeProximity(v / 100) });
    animateValue({
      ease: easeInCubic,
      duration: 1500,
      end: 50,
      onUpdate: (v) => {
        setCursorAngle(((angleEnd - angleStart) * v) / 100 + angleStart);
      },
    });
    animateValue({
      ease: easeOutCubic,
      delay: 1500,
      duration: 2250,
      start: 50,
      end: 100,
      onUpdate: (v) => {
        setCursorAngle(((angleEnd - angleStart) * v) / 100 + angleStart);
      },
    });
    animateValue({
      ease: easeInCubic,
      delay: 2500,
      duration: 1500,
      start: 100,
      end: 0,
      onUpdate: (v) => setEdgeProximity(v / 100),
      onEnd: () => setSweepActive(false),
    });
  }, [animated]);

  const colorSensitivity = edgeSensitivity + 20;
  const isVisible = isHovered || tieneFoco || sweepActive;
  /**
   * El piso solo aplica mientras el puntero o el foco están adentro; durante
   * el barrido de entrada manda la animación, que ya arranca en 0 a propósito.
   */
  const proximidad =
    isHovered || tieneFoco ? Math.max(edgeProximity, proximidadMinima) : edgeProximity;
  const borderOpacity = isVisible ? Math.max(0, (proximidad * 100 - colorSensitivity) / (100 - colorSensitivity)) : 0;
  const glowOpacity = isVisible ? Math.max(0, (proximidad * 100 - edgeSensitivity) / (100 - edgeSensitivity)) : 0;

  const meshGradients = buildMeshGradients(colors);
  const borderBg = meshGradients.map((g) => `${g} border-box`);
  const fillBg = meshGradients.map((g) => `${g} padding-box`);
  const angleDeg = `${cursorAngle.toFixed(3)}deg`;

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onFocusCapture={() => setTieneFoco(true)}
      onBlurCapture={() => setTieneFoco(false)}
      className={`relative isolate inline-grid border border-linea ${className}`}
      style={{
        background: backgroundColor,
        borderRadius: `${borderRadius}px`,
        transform: 'translate3d(0, 0, 0.01px)',
      }}
    >
      <div
        className="absolute inset-0 rounded-[inherit] -z-[1]"
        style={{
          border: '1px solid transparent',
          background: [`linear-gradient(${backgroundColor} 0 100%) padding-box`, 'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box', ...borderBg].join(
            ', '
          ),
          opacity: borderOpacity,
          maskImage: `conic-gradient(from ${angleDeg} at center, black ${coneSpread}%, transparent ${coneSpread + 15}%, transparent ${100 - coneSpread - 15}%, black ${100 - coneSpread}%)`,
          WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black ${coneSpread}%, transparent ${coneSpread + 15}%, transparent ${100 - coneSpread - 15}%, black ${100 - coneSpread}%)`,
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        }}
      />

      <div
        className="absolute inset-0 rounded-[inherit] -z-[1]"
        style={{
          border: '1px solid transparent',
          background: fillBg.join(', '),
          maskImage: [
            'linear-gradient(to bottom, black, black)',
            'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
            'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
            `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
          ].join(', '),
          WebkitMaskImage: [
            'linear-gradient(to bottom, black, black)',
            'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
            'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
            'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
            `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
          ].join(', '),
          maskComposite: 'subtract, add, add, add, add, add',
          WebkitMaskComposite: 'source-out, source-over, source-over, source-over, source-over, source-over',
          opacity: borderOpacity * fillOpacity,
          mixBlendMode: 'soft-light',
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        }}
      />

      <span
        className="absolute pointer-events-none z-[1] rounded-[inherit]"
        style={{
          inset: `${-glowRadius}px`,
          maskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
          WebkitMaskImage: `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`,
          opacity: glowOpacity,
          mixBlendMode: 'plus-lighter',
          transition: isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out',
        }}
      >
        <span
          className="absolute rounded-[inherit]"
          style={{
            inset: `${glowRadius}px`,
            boxShadow: buildBoxShadow(glowColor, glowIntensity),
          }}
        />
      </span>

      <div className="relative z-[1] flex flex-col overflow-visible">{children}</div>
    </div>
  );
}
