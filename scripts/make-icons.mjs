// Generates PWA icons: the 英 kanji drawn from KanjiVG stroke paths (so no
// CJK font is needed at render time) on an indigo background. The stroke
// paths are inlined below (KanjiVG, CC BY-SA 3.0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'public', 'icons');
mkdirSync(iconDir, { recursive: true });

// 英 (U+82F1)
const PATHS = [
  "M21.25,25.52c2.62,0.61,5.04,0.45,7.5,0.26c12.73-0.97,38.06-2.66,51.75-2.97c2.6-0.06,5.2-0.16,7.75,0.47",
  "M38,14c1.01,0.63,1.87,1.83,1.98,2.7c0.94,7.23,1.85,13.14,2.52,18.92",
  "M67.61,11.62c0.62,0.88,0.96,2.15,0.68,3.52c-1.79,8.8-2.07,11.06-3.79,19.36",
  "M31.82,44.53c1.06,0.93,1.7,2.4,1.85,3.53c1.08,7.94,1.83,13.56,2.09,16.43",
  "M33.78,46.09c3.6-0.37,34-3.9,38.89-4.18c2.82-0.16,5.32,0.84,4.54,4.43c-0.91,4.17-2.93,14.03-3.35,16.09",
  "M18.05,65.13c2.77,1.11,5.8,0.75,8.69,0.56c14-0.94,37.44-2.18,55.15-3.25c3.63-0.22,8.35-0.18,11.43,0.62",
  "M53.05,33.5c0.79,0.79,1.18,2.07,1.18,3.9c0,38.26-9.73,46.22-31.42,57.85",
  "M54.12,64.88c7.38,7.75,18.62,17.55,26.7,23.84c2.36,1.84,5.49,3.89,8.3,5.03"
];

const BG = '#3f4fc8';

function makeSvg({ glyphScale }) {
  // KanjiVG viewBox is 109×109; centre and scale the glyph on a 512 canvas.
  const s = (512 * glyphScale) / 109;
  const offset = (512 - 109 * s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(${offset} ${offset}) scale(${s})"
     fill="none" stroke="#ffffff" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">
    ${PATHS.map((d) => `<path d="${d}"/>`).join('\n    ')}
  </g>
</svg>`;
}

const normal = makeSvg({ glyphScale: 0.74 });
const maskable = makeSvg({ glyphScale: 0.56 });

const jobs = [
  ['icon-192.png', normal, 192],
  ['icon-512.png', normal, 512],
  ['icon-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', normal, 180],
];
for (const [name, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(iconDir, name));
  console.log(`wrote icons/${name}`);
}

writeFileSync(join(root, 'public', 'favicon.svg'), normal);
console.log('wrote favicon.svg');
