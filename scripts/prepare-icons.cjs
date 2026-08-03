#!/usr/bin/env node
/**
 * Builds Electron icons from build/hafezway-logo.png:
 * - build/icon.png (1024²) — shared / mac window
 * - build/icon.ico — Windows exe, shortcut, NSIS installer UI
 * - build/icon.icns — macOS (when iconutil is available)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const source = path.join(buildDir, 'hafezway-logo.png');
const outPng = path.join(buildDir, 'icon.png');
const outIco = path.join(buildDir, 'icon.ico');
const outIcns = path.join(buildDir, 'icon.icns');

async function contentBoundingBox(buffer, threshold = 25) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 10) continue;
      if (r > threshold || g > threshold || b > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width, height };
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

async function makeSquarePng(size) {
  const sourceBuf = await sharp(source).ensureAlpha().png().toBuffer();
  const box = await contentBoundingBox(sourceBuf);
  // Keep a little breathing room around the cropped mark.
  const margin = Math.round(Math.max(box.width, box.height) * 0.03);
  const meta = await sharp(sourceBuf).metadata();
  const left = Math.max(0, box.left - margin);
  const top = Math.max(0, box.top - margin);
  const width = Math.min((meta.width || box.width) - left, box.width + margin * 2);
  const height = Math.min((meta.height || box.height) - top, box.height + margin * 2);
  const cropped = await sharp(sourceBuf).extract({ left, top, width, height }).png().toBuffer();

  const pad = Math.round(size * 0.02);
  const maxInner = size - pad * 2;
  const cMeta = await sharp(cropped).metadata();
  const scale = Math.min(maxInner / (cMeta.width || 1), maxInner / (cMeta.height || 1));
  const w = Math.max(1, Math.round((cMeta.width || 1) * scale));
  const h = Math.max(1, Math.round((cMeta.height || 1) * scale));
  const resized = await sharp(cropped).resize(w, h, { fit: 'inside' }).png().toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

async function main() {
  if (!fs.existsSync(source)) {
    console.error(`Missing logo source: ${source}`);
    process.exit(1);
  }
  fs.mkdirSync(buildDir, { recursive: true });

  // Cropped logo for in-app header (fills the UI box better than the padded source).
  const sourceBuf = await sharp(source).ensureAlpha().png().toBuffer();
  const box = await contentBoundingBox(sourceBuf);
  const uiMargin = Math.round(Math.max(box.width, box.height) * 0.08);
  const sMeta = await sharp(sourceBuf).metadata();
  const uiLeft = Math.max(0, box.left - uiMargin);
  const uiTop = Math.max(0, box.top - uiMargin);
  const uiW = Math.min((sMeta.width || box.width) - uiLeft, box.width + uiMargin * 2);
  const uiH = Math.min((sMeta.height || box.height) - uiTop, box.height + uiMargin * 2);
  const uiLogo = await sharp(sourceBuf)
    .extract({ left: uiLeft, top: uiTop, width: uiW, height: uiH })
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toBuffer();
  const publicLogo = path.join(root, 'public', 'hafezway-logo.png');
  fs.writeFileSync(publicLogo, uiLogo);
  console.log(`Wrote ${path.relative(root, publicLogo)}`);

  const master = await makeSquarePng(1024);
  fs.writeFileSync(outPng, master);
  console.log(`Wrote ${path.relative(root, outPng)}`);

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngs = [];
  for (const size of icoSizes) {
    icoPngs.push(await makeSquarePng(size));
  }
  const icoBuf = await pngToIco(icoPngs);
  fs.writeFileSync(outIco, icoBuf);
  console.log(`Wrote ${path.relative(root, outIco)}`);

  // macOS .icns via iconutil when available (darwin)
  if (process.platform === 'darwin') {
    const iconset = path.join(buildDir, 'icon.iconset');
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset, { recursive: true });
    const map = [
      [16, 'icon_16x16.png'],
      [32, 'diana.k@example.org'],
      [32, 'icon_32x32.png'],
      [64, 'ivan.p@example.net'],
      [128, 'icon_128x128.png'],
      [256, 'wendy.h@example.net'],
      [256, 'icon_256x256.png'],
      [512, 'wendy.h@example.net'],
      [512, 'icon_512x512.png'],
      [1024, 'walt.e@example.net'],
    ];
    for (const [size, name] of map) {
      fs.writeFileSync(path.join(iconset, name), await makeSquarePng(size));
    }
    try {
      execFileSync('iconutil', ['-c', 'icns', iconset, '-o', outIcns], { stdio: 'inherit' });
      console.log(`Wrote ${path.relative(root, outIcns)}`);
    } catch (e) {
      console.warn('iconutil failed; mac builds can still use icon.png:', e.message);
    }
    fs.rmSync(iconset, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
