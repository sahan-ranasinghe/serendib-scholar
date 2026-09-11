/**
 * The PWA icons from the wordmark: the splash's board tile (board paper in
 * a wood frame with the stroke numeral 5) on the teal ground, at 192, 512
 * and a 512 maskable with the tile inside the safe zone.
 *
 *   npx tsx scripts/make-icons.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { GLYPHS, GLYPH_BOX } from "../src/components/board/HandGlyphs";

function icon(size: number, maskable: boolean): string {
  const pad = maskable ? size * 0.2 : size * 0.16;
  const tileW = size - pad * 2;
  const tileH = tileW * 0.75;
  const tileX = pad;
  const tileY = (size - tileH) / 2;
  const border = tileW * 0.0625;
  const shadow = border;
  const radius = tileW * 0.083;
  const glyph = GLYPHS["5"]!;
  const glyphH = tileH * 0.55;
  const scale = glyphH / GLYPH_BOX;
  const gx = tileX + tileW / 2 - (glyph.w * scale) / 2 + 2 * scale;
  const gy = tileY + tileH / 2 - glyphH / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.18}" fill="#0F4C5C"/>
  <rect x="${tileX}" y="${tileY + shadow}" width="${tileW}" height="${tileH}" rx="${radius}" fill="#6B4528"/>
  <rect x="${tileX}" y="${tileY}" width="${tileW}" height="${tileH}" rx="${radius}" fill="#8B5E3C"/>
  <rect x="${tileX + border}" y="${tileY + border}" width="${tileW - border * 2}" height="${tileH - border * 2}" rx="${radius * 0.5}" fill="#F7F3EA"/>
  <path d="${glyph.d}" transform="translate(${gx} ${gy}) scale(${scale})" fill="none" stroke="#2F5FA6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

async function main() {
  const out = path.resolve(process.cwd(), "public/icons");
  await mkdir(out, { recursive: true });
  for (const [name, size, maskable] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["maskable-512.png", 512, true]] as const) {
    const png = await sharp(Buffer.from(icon(size, maskable))).png().toBuffer();
    await writeFile(path.join(out, name), png);
    console.log(`${name} ${png.length} bytes`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
