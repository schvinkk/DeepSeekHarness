// Generate the DeepSeek whale app icon: whale.svg -> PNGs -> whale.ico
// Run with NODE_PATH pointing at the dsh package node_modules so `sharp` resolves.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const SVG = path.join(ROOT, "icon", "whale.svg");
const OUT_PNG_DIR = path.join(ROOT, "icon", "png");
const OUT_ICO = path.join(ROOT, "icon", "whale.ico");
const OUT_512 = path.join(ROOT, "icon", "whale-512.png");

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const PAD = 0.06; // 6% transparent padding around the whale

async function main() {
  fs.mkdirSync(OUT_PNG_DIR, { recursive: true });

  const base = 1024;
  const baseBuf = await sharp(SVG).resize(base, base).png().toBuffer();

  // 512 PNG (installer banner / About image)
  const b512 = await sharp(baseBuf).resize(512, 512).png().toBuffer();
  fs.writeFileSync(OUT_512, b512);

  const pngs = [];
  for (const s of SIZES) {
    const scale = 1 - PAD * 2;
    const whaleSize = Math.max(1, Math.round(s * scale));
    const offset = Math.round((s - whaleSize) / 2);
    const whaleSized = await sharp(baseBuf).resize(whaleSize, whaleSize, { fit: "inside" }).png().toBuffer();
    const padded = await sharp({
      create: { width: s, height: s, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: whaleSized, left: offset, top: offset }])
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(OUT_PNG_DIR, `whale-${s}.png`), padded);
    pngs.push({ size: s, data: padded });
  }

  // Pack PNG entries into an ICO (PNG-compressed entries, Vista+ compatible).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size === 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // color count
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(data.length, 8); // bytes in resource
    e.writeUInt32LE(offset, 12); // image offset
    entries.push(e);
    offset += data.length;
  }

  fs.writeFileSync(OUT_ICO, Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]));
  console.log("wrote", OUT_ICO, fs.statSync(OUT_ICO).size, "bytes");
  console.log("wrote", OUT_512);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
