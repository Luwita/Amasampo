// Draws the Zed Market app icons (emerald tile, white "Z", gold base) as PNG files in public/.
// No image libraries needed: shapes are rasterised here and encoded with Node's zlib.
// Run with: node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const EMERALD = [14, 107, 82];
const EMERALD_LIGHT = [28, 150, 110];
const GOLD = [242, 181, 58];
const WHITE = [255, 255, 255];

// The letter Z as polygons in a 0..1 box: top bar, diagonal and bottom bar.
const LETTER = [
  [
    [0.27, 0.2],
    [0.73, 0.2],
    [0.73, 0.295],
    [0.27, 0.295],
  ],
  [
    [0.6, 0.295],
    [0.73, 0.295],
    [0.4, 0.645],
    [0.27, 0.645],
  ],
  [
    [0.27, 0.645],
    [0.73, 0.645],
    [0.73, 0.74],
    [0.27, 0.74],
  ],
];

function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedSquare(x, y, r) {
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// Colour of one sample point, or null for transparent.
function sample(x, y, { radius, letterScale }) {
  if (radius > 0 && !inRoundedSquare(x, y, radius)) return null;
  // Letter coordinates, scaled about the centre (maskable icons keep the letter in the safe zone).
  const lx = (x - 0.5) / letterScale + 0.5;
  const ly = (y - 0.47) / letterScale + 0.47;
  if (LETTER.some((p) => inPolygon(lx, ly, p))) return WHITE;
  if (y > 0.87) return GOLD;
  const t = (x + y) / 2;
  return EMERALD.map((c, i) => Math.round(c + (EMERALD_LIGHT[i] - c) * t * 0.9));
}

function render(size, options) {
  const SS = 4; // 4×4 samples per pixel for smooth edges
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxi = 0; pxi < size; pxi++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((pxi + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, options);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a += 1;
          }
        }
      }
      const o = (py * size + pxi) * 4;
      px[o] = a ? Math.round(r / a) : 0;
      px[o + 1] = a ? Math.round(g / a) : 0;
      px[o + 2] = a ? Math.round(b / a) : 0;
      px[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  return encodePng(size, size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'public');
const icons = [
  ['icon-192.png', 192, { radius: 0.22, letterScale: 1 }],
  ['icon-512.png', 512, { radius: 0.22, letterScale: 1 }],
  // Maskable: full-bleed background, letter inside the central safe zone.
  ['icon-maskable-512.png', 512, { radius: 0, letterScale: 0.72 }],
  // iOS rounds the corners itself.
  ['apple-touch-icon.png', 180, { radius: 0, letterScale: 0.9 }],
  ['favicon-32.png', 32, { radius: 0.2, letterScale: 1.05 }],
];
for (const [name, size, options] of icons) {
  fs.writeFileSync(path.join(out, name), render(size, options));
  console.log('wrote public/' + name);
}

// Expo app (mobile/): app icon (iOS rounds the corners itself) and the Android adaptive icon.
const expoAssets = path.join(__dirname, '..', 'mobile', 'assets');
if (fs.existsSync(expoAssets)) {
  fs.writeFileSync(path.join(expoAssets, 'icon.png'), render(1024, { radius: 0, letterScale: 0.9 }));
  fs.writeFileSync(path.join(expoAssets, 'android-icon-foreground.png'), render(1024, { radius: 0, letterScale: 0.55 }));
  // Launch screen: the rounded icon on white (see expo-splash-screen in mobile/app.json).
  fs.writeFileSync(path.join(expoAssets, 'splash-icon.png'), render(512, { radius: 0.22, letterScale: 1 }));
  console.log('wrote Expo app icons');
}
