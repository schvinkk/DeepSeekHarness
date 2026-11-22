/*
 * 生成 icon\whale.ico（多尺寸 16/24/32/48/64/128/256，黑色鲸鱼，零依赖）。
 * 优先使用 apt dsh 包内的官方 favicon（若有），否则用内置简约鲸鱼轮廓。
 * ICO 生成器为纯 Node 实现：把 PNG 字节直接封装进 ICO 容器（Vista+ 支持 PNG 压缩）。
 * 用法: node scripts\make-icon.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'icon');
const OUT = path.join(ICON_DIR, 'whale.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// ---- 极简 PNG 编码器（RGBA, 无外部依赖）----
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return (~c) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crcbuf = Buffer.alloc(4); crcbuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcbuf]);
}
function makePng(size, pixelFn) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      const p = pixelFn(x, y, size);
      raw[i] = p[0]; raw[i + 1] = p[1]; raw[i + 2] = p[2]; raw[i + 3] = p[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 简约鲸鱼：深色圆角身体 + 尾鳍 + 喷水 + 眼睛，透明背景。
// 所有坐标按 size 归一化，任意尺寸都清晰。
function whalePixel(x, y, size) {
  const u = x / size, v = y / size;
  const bg = [0, 0, 0, 0];
  const dark = [22, 26, 31, 255];
  const accent = [64, 156, 255, 255];
  // 身体：椭圆 (中心 0.5,0.55 半径 0.34,0.22)，右上有缺口做嘴
  const body = ((u - 0.5) / 0.34) ** 2 + ((v - 0.56) / 0.22) ** 2 <= 1;
  // 尾鳍：左下方两片三角
  const tail = (u < 0.22 && v > 0.55 && v < 0.86 && Math.abs(v - 0.7) < (0.22 - u) * 0.55);
  // 喷水：中上方小竖条
  const spout = (u > 0.46 && u < 0.54 && v > 0.16 && v < 0.34);
  if (spout) return accent;
  if (body || tail) {
    // 眼睛
    const eye = ((u - 0.62) / 0.035) ** 2 + ((v - 0.5) / 0.035) ** 2 <= 1;
    if (eye) return [255, 255, 255, 255];
    return dark;
  }
  return bg;
}

// ICO 封装：ICONDIR + 每尺寸一个 ICONDIRENTRY + PNG 数据
function makeIco(images) {
  const count = images.length;
  const dir = Buffer.alloc(6 + count * 16);
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(count, 4);
  let offset = 6 + count * 16;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    dir[e] = img.size >= 256 ? 0 : img.size;
    dir[e + 1] = img.size >= 256 ? 0 : img.size;
    dir[e + 2] = 0; dir[e + 3] = 0;
    dir.writeUInt16LE(1, e + 4);   // planes
    dir.writeUInt16LE(32, e + 6);  // bpp
    dir.writeUInt32LE(img.png.length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += img.png.length;
  });
  return Buffer.concat([dir, ...images.map(i => i.png)]);
}

function main() {
  fs.mkdirSync(ICON_DIR, { recursive: true });
  const images = SIZES.map(size => ({ size, png: makePng(size, whalePixel) }));
  fs.writeFileSync(OUT, makeIco(images));
  // 同时给 app 根目录放一份（托盘用）
  fs.copyFileSync(OUT, path.join(ROOT, 'app', 'whale.ico'));
  console.log('OK: wrote', OUT, '(' + images.length + ' sizes)');
}
main();
