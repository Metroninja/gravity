/**
 * Generate PWA icons from the magenta J source mark.
 *
 * Output:
 *   public/icons/icon-192.png            (square, transparent)
 *   public/icons/icon-512.png            (square, transparent)
 *   public/icons/icon-maskable-512.png   (square, seashell background, with
 *                                         the J inside the maskable safe zone)
 *   public/icons/favicon-32.png          (favicon)
 *
 * Re-run with `node scripts/generate-icons.mjs` if the source mark changes.
 */
import path from "node:path";

import sharp from "sharp";

const SRC = path.resolve("public/brand/icon-magenta.png");
const OUT_DIR = path.resolve("public/icons");

const SEASHELL = { r: 0xf7, g: 0xed, b: 0xe8, alpha: 1 };

async function makeSquare(size, outName) {
  const file = path.join(OUT_DIR, outName);
  await sharp(SRC)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("wrote", file);
}

async function makeMaskable(size, outName) {
  // Maskable icons need ~80% safe zone in the center. We composite the J on a
  // seashell-colored square so the masking doesn't crop the brand mark.
  const file = path.join(OUT_DIR, outName);
  const inner = Math.round(size * 0.7);
  const buf = await sharp(SRC)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
  const offset = Math.round((size - inner) / 2);
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: SEASHELL,
    },
  })
    .composite([{ input: buf, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("wrote", file);
}

await makeSquare(192, "icon-192.png");
await makeSquare(512, "icon-512.png");
await makeMaskable(512, "icon-maskable-512.png");
await makeSquare(32, "favicon-32.png");
