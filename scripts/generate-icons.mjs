// Renders the JARVIS app icons from an inline SVG with the system Chromium.
// Usage: node scripts/generate-icons.mjs  (needs `playwright` resolvable; the icons are already committed)
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#06202a"/><stop offset="1" stop-color="#010305"/>
    </radialGradient>
    <radialGradient id="core" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.25" stop-color="#b8fbff"/>
      <stop offset="0.6" stop-color="#00e5ff" stop-opacity="0.55"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
    </radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${1 - pad})" fill="none" stroke="#00e5ff">
    <circle r="200" stroke-opacity="0.25" stroke-width="2"/>
    <g stroke-width="10" stroke-linecap="round" filter="url(#glow)" stroke-opacity="0.7">
      <path d="M 0 -170 A 170 170 0 0 1 147 -85"/><path d="M 147 85 A 170 170 0 0 1 -147 85"/>
      <path d="M -147 -85 A 170 170 0 0 1 -60 -159"/>
    </g>
    <g stroke-width="8" stroke-linecap="round">
      <path d="M 0 -170 A 170 170 0 0 1 147 -85"/><path d="M 147 85 A 170 170 0 0 1 -147 85"/>
      <path d="M -147 -85 A 170 170 0 0 1 -60 -159"/>
    </g>
    <circle r="128" stroke-width="5" stroke-dasharray="4 14" stroke-opacity="0.8"/>
    <circle r="150" fill="url(#core)" stroke="none"/>
    <circle r="62" stroke="#e8fdff" stroke-width="3" stroke-opacity="0.85"/>
  </g>
</svg>`;

const targets = [
  { file: "icon-192.png", size: 192, pad: 0.06 },
  { file: "icon-512.png", size: 512, pad: 0.06 },
  { file: "icon-maskable-512.png", size: 512, pad: 0.22 },
  { file: "apple-touch-icon.png", size: 180, pad: 0.08 },
];

await mkdir("public/icons", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:#000">${svg(t.pad).replace('width="512" height="512"', `width="${t.size}" height="${t.size}"`)}</body></html>`,
  );
  await page.screenshot({ path: `public/icons/${t.file}`, clip: { x: 0, y: 0, width: t.size, height: t.size } });
  console.log("wrote", t.file);
}
await browser.close();
