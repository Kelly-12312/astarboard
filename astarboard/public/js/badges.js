/* A*Board champion badges ("Print Shop" set): one printing technique per tier.
   AStarBadges.svg(tier, size) returns inline SVG markup; ids are made unique
   per call so several copies can share a page. */
(function () {
  'use strict';
  let seq = 0;
  const STAR = (cx, cy, r, fill) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 * 3 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.42 : r;
      pts.push((cx + rr * Math.cos(a)).toFixed(1) + ',' + (cy + rr * Math.sin(a)).toFixed(1));
    }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };
  const BURST_OUT = '100.0,6.0 117.4,24.0 140.8,15.3 148.6,39.0 173.5,41.4 170.3,66.2 191.6,79.1 178.0,100.0 191.6,120.9 170.3,133.8 173.5,158.6 148.6,161.0 140.8,184.7 117.4,176.0 100.0,194.0 82.6,176.0 59.2,184.7 51.4,161.0 26.5,158.6 29.7,133.8 8.4,120.9 22.0,100.0 8.4,79.1 29.7,66.2 26.5,41.4 51.4,39.0 59.2,15.3 82.6,24.0';
  const BURST_IN = '100.0,16.0 115.4,32.7 136.4,24.3 143.0,46.1 165.7,47.6 162.2,70.1 181.9,81.3 169.0,100.0 181.9,118.7 162.2,129.9 165.7,152.4 143.0,153.9 136.4,175.7 115.4,167.3 100.0,184.0 84.6,167.3 63.6,175.7 57.0,153.9 34.3,152.4 37.8,129.9 18.1,118.7 31.0,100.0 18.1,81.3 37.8,70.1 34.3,47.6 57.0,46.1 63.6,24.3 84.6,32.7';
  const SCALLOP = 'M172.0 92.0A10.5 10.5 0 0 1 169.1 112.3A10.5 10.5 0 0 1 160.6 130.9A10.5 10.5 0 0 1 147.1 146.4A10.5 10.5 0 0 1 129.9 157.5A10.5 10.5 0 0 1 110.2 163.3A10.5 10.5 0 0 1 89.8 163.3A10.5 10.5 0 0 1 70.1 157.5A10.5 10.5 0 0 1 52.9 146.4A10.5 10.5 0 0 1 39.4 130.9A10.5 10.5 0 0 1 30.9 112.3A10.5 10.5 0 0 1 28.0 92.0A10.5 10.5 0 0 1 30.9 71.7A10.5 10.5 0 0 1 39.4 53.1A10.5 10.5 0 0 1 52.9 37.6A10.5 10.5 0 0 1 70.1 26.5A10.5 10.5 0 0 1 89.8 20.7A10.5 10.5 0 0 1 110.2 20.7A10.5 10.5 0 0 1 129.9 26.5A10.5 10.5 0 0 1 147.1 37.6A10.5 10.5 0 0 1 160.6 53.1A10.5 10.5 0 0 1 169.1 71.7A10.5 10.5 0 0 1 172.0 92.0Z';
  const SERIF = "font-family=\"'Instrument Serif', serif\" font-style=\"italic\"";
  const MONO = "font-family=\"'Rubik Mono One', sans-serif\"";

  const ART = {
    1: (p) => `<defs>
        <filter id="${p}r"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>
        <path id="${p}t" d="M 36 100 A 64 64 0 1 1 164 100"/><path id="${p}b" d="M 26 100 A 74 74 0 0 0 174 100"/></defs>
      <g filter="url(#${p}r)" transform="rotate(-11 100 100)" opacity="0.94">
        <circle cx="100" cy="100" r="90" fill="none" stroke="#1D2B6B" stroke-width="6"/>
        <circle cx="100" cy="100" r="81" fill="none" stroke="#1D2B6B" stroke-width="1.5"/>
        <text ${MONO} font-size="15" fill="#1D2B6B" letter-spacing="3"><textPath href="#${p}t" startOffset="50%" text-anchor="middle">CHAMPION</textPath></text>
        <text ${MONO} font-size="11" fill="#1D2B6B" letter-spacing="2"><textPath href="#${p}b" startOffset="50%" text-anchor="middle">LEVEL 5 CLEARED</textPath></text>
        ${STAR(28, 100, 9, '#1D2B6B')}${STAR(172, 100, 9, '#1D2B6B')}
        <rect x="34" y="74" width="132" height="52" fill="#1D2B6B"/>
        <text x="92" y="117" text-anchor="middle" ${SERIF} font-size="54" fill="#F4F0E8">A</text>
        ${STAR(120, 92, 13, '#F4F0E8')}
      </g>`,
    2: (p) => `<defs>
        <filter id="${p}s" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="3" dy="5" stdDeviation="3" flood-color="#1D2B6B" flood-opacity="0.3"/></filter>
        <pattern id="${p}d" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1.5" fill="#FFFFFF" opacity="0.45"/></pattern></defs>
      <g transform="rotate(8 100 100)">
        <polygon filter="url(#${p}s)" fill="#FFFFFF" points="${BURST_OUT}"/>
        <polygon transform="translate(6 5)" fill="#0078BF" points="${BURST_IN}"/>
        <polygon fill="#E0218A" points="${BURST_IN}"/>
        <polygon fill="url(#${p}d)" points="${BURST_IN}"/>
        <text x="94" y="121" text-anchor="middle" ${SERIF} font-size="80" fill="#1D2B6B">A</text>
        <text x="90" y="117" text-anchor="middle" ${SERIF} font-size="80" fill="#FFFFFF">A</text>
        ${STAR(132, 70, 16, '#1D2B6B')}${STAR(128, 66, 16, '#FFE600')}
        <g transform="rotate(-6 100 144)"><rect x="62" y="134" width="76" height="20" rx="3" fill="#FFE600" stroke="#1D2B6B" stroke-width="2"/>
        <text x="100" y="148" text-anchor="middle" ${MONO} font-size="10" fill="#1D2B6B" letter-spacing="1">PINK INK</text></g>
      </g>`,
    3: (p) => `<defs>
        <pattern id="${p}w" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#0078BF"/><rect width="2.4" height="6" fill="#006AA9"/></pattern>
        <filter id="${p}s"><feDropShadow dx="2" dy="4" stdDeviation="2.5" flood-color="#001067" flood-opacity="0.35"/></filter></defs>
      <path filter="url(#${p}s)" d="M100 10 L178 36 L172 118 Q162 166 100 192 Q38 166 28 118 L22 36 Z" fill="#FFE600" stroke="#1D2B6B" stroke-width="3"/>
      <path d="M100 22 L166 44 L161 116 Q152 156 100 179 Q48 156 39 116 L34 44 Z" fill="url(#${p}w)"/>
      <path d="M100 22 L166 44 L161 116 Q152 156 100 179 Q48 156 39 116 L34 44 Z" fill="none" stroke="#FFF6B0" stroke-width="2" stroke-dasharray="5 4" transform="translate(100 100) scale(0.92) translate(-100 -100)"/>
      <text x="92" y="118" text-anchor="middle" ${SERIF} font-size="70" fill="#FFE600" stroke="#B89A00" stroke-width="1" stroke-dasharray="3 2">A</text>
      ${STAR(124, 76, 13, '#FFE600')}
      <rect x="52" y="134" width="96" height="20" fill="#E0218A" stroke="#1D2B6B" stroke-width="2"/>
      <text x="100" y="148" text-anchor="middle" ${MONO} font-size="9" fill="#FFFFFF" letter-spacing="1">OVERPRINT</text>
      ${STAR(80, 48, 5, '#FFE600')}${STAR(100, 46, 5, '#FFE600')}${STAR(120, 48, 5, '#FFE600')}`,
    4: (p) => `<defs>
        <linearGradient id="${p}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8C6A12"/><stop offset="0.3" stop-color="#FFE27A"/><stop offset="0.5" stop-color="#C9A227"/><stop offset="0.7" stop-color="#FFF3B8"/><stop offset="1" stop-color="#9C7A1A"/></linearGradient>
        <linearGradient id="${p}h" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B8901F"/><stop offset="0.5" stop-color="#FFF0A0"/><stop offset="1" stop-color="#8C6A12"/></linearGradient>
        <filter id="${p}s"><feDropShadow dx="2" dy="4" stdDeviation="2.5" flood-color="#5A4300" flood-opacity="0.35"/></filter></defs>
      <path d="M78 130 L56 194 L70 184 L80 198 L98 140 Z" fill="#E0218A" stroke="#1D2B6B" stroke-width="2"/>
      <path d="M122 130 L144 194 L130 184 L120 198 L102 140 Z" fill="#0078BF" stroke="#1D2B6B" stroke-width="2"/>
      <path filter="url(#${p}s)" d="${SCALLOP}" fill="url(#${p}g)" stroke="#7A5C0C" stroke-width="1.5"/>
      <circle cx="100" cy="92" r="52" fill="url(#${p}h)" stroke="#7A5C0C" stroke-width="1.5"/>
      <circle cx="100" cy="92" r="45" fill="none" stroke="#7A5C0C" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>
      <text x="95.5" y="115.5" text-anchor="middle" ${SERIF} font-size="58" fill="#FFF8D0">A</text>
      <text x="94" y="114" text-anchor="middle" ${SERIF} font-size="58" fill="#6B4F08">A</text>
      ${STAR(123.5, 78.5, 11, '#FFF8D0')}${STAR(122, 77, 11, '#6B4F08')}
      <text x="100" y="62" text-anchor="middle" ${MONO} font-size="7" fill="#6B4F08" letter-spacing="1.5">GOLD FOIL</text>`,
    5: (p) => `<defs>
        <linearGradient id="${p}c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7AC6"/><stop offset="0.25" stop-color="#FFE600"/><stop offset="0.5" stop-color="#7CF0D8"/><stop offset="0.75" stop-color="#6FA8FF"/><stop offset="1" stop-color="#C58CFF"/></linearGradient>
        <linearGradient id="${p}n" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0.35" stop-color="#FFFFFF" stop-opacity="0"/><stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.75"/><stop offset="0.65" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
        <pattern id="${p}l" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><rect width="3" height="8" fill="#FFFFFF" opacity="0.22"/></pattern></defs>
      <g transform="rotate(7 100 100)">
        <g class="holo-face"><rect x="42" y="12" width="116" height="176" rx="12" fill="url(#${p}c)" stroke="#FFFFFF" stroke-width="3"/></g>
        <rect x="42" y="12" width="116" height="176" rx="12" fill="url(#${p}l)"/>
        <rect x="52" y="22" width="96" height="156" rx="6" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <text x="60" y="40" ${MONO} font-size="8" fill="#1D2B6B">No. 05/05</text>
        <text x="92" y="124" text-anchor="middle" ${SERIF} font-size="74" fill="#1D2B6B">A</text>
        ${STAR(124, 80, 14, '#1D2B6B')}
        <text x="100" y="166" text-anchor="middle" ${MONO} font-size="8" fill="#1D2B6B" letter-spacing="1">HOLOGRAPHIC</text>
        <rect class="holo-shine" x="42" y="12" width="116" height="176" rx="12" fill="url(#${p}n)"/>
      </g>
      <path d="M30 40 L33 50 L43 53 L33 56 L30 66 L27 56 L17 53 L27 50 Z" fill="#FFE600" stroke="#1D2B6B" stroke-width="1"/>
      <path d="M172 140 L174 147 L181 149 L174 151 L172 158 L170 151 L163 149 L170 147 Z" fill="#E0218A"/>`,
  };
  const NAMES = { 1: 'Rubber Stamp', 2: 'Riso Sticker', 3: 'Stitched Patch', 4: 'Foil Seal', 5: 'Holo Card' };

  function svg(tier, size, label) {
    const t = Math.max(1, Math.min(5, tier | 0));
    const p = 'bdg' + (++seq) + '-';
    const a11y = label === false ? 'aria-hidden="true"' : `role="img" aria-label="${label || NAMES[t] + ' badge'}"`;
    return `<svg class="badge-art tier-${t}" viewBox="0 0 200 200" width="${size}" height="${size}" ${a11y}>${ART[t](p)}</svg>`;
  }
  window.AStarBadges = { svg, NAMES };
})();
