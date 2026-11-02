const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function processLogo() {
  const inputPath = path.join(__dirname, '../public/logo.png');
  const pubDir = path.join(__dirname, '../public');

  const { data, info } = await sharp(inputPath).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // 1. Find bounding box of the Shield emblem alone
  // From y = 100 to y = 560
  let emblemMinX = width, emblemMaxX = 0, emblemMinY = height, emblemMaxY = 0;
  for (let y = 130; y <= 560; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (data[idx] > 20 || data[idx + 1] > 20 || data[idx + 2] > 20) {
        if (x < emblemMinX) emblemMinX = x;
        if (x > emblemMaxX) emblemMaxX = x;
        if (y < emblemMinY) emblemMinY = y;
        if (y > emblemMaxY) emblemMaxY = y;
      }
    }
  }

  console.log('Emblem bbox:', { emblemMinX, emblemMaxX, emblemMinY, emblemMaxY, w: emblemMaxX - emblemMinX, h: emblemMaxY - emblemMinY });

  // Add a balanced padding to make the emblem square
  const emblemW = emblemMaxX - emblemMinX;
  const emblemH = emblemMaxY - emblemMinY;
  const maxDim = Math.max(emblemW, emblemH);
  const pad = 30;
  const targetDim = maxDim + pad * 2;

  const centerX = Math.round((emblemMinX + emblemMaxX) / 2);
  const centerY = Math.round((emblemMinY + emblemMaxY) / 2);

  const cropLeft = Math.max(0, Math.round(centerX - targetDim / 2));
  const cropTop = Math.max(0, Math.round(centerY - targetDim / 2));
  const cropSize = Math.min(width - cropLeft, height - cropTop, targetDim);

  // Extract emblem with dark background
  await sharp(inputPath)
    .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
    .resize(512, 512)
    .png()
    .toFile(path.join(pubDir, 'logo-shield.png'));

  // Also extract transparent version of the emblem (where pure black #000000 becomes transparent with smooth threshold)
  // Let's create an alpha-matted version:
  const rawEmblem = await sharp(inputPath)
    .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
    .resize(512, 512)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const embBuffer = rawEmblem.data;
  const embChannels = rawEmblem.info.channels;
  const transparentBuffer = Buffer.alloc(512 * 512 * 4);

  for (let i = 0; i < 512 * 512; i++) {
    const srcIdx = i * embChannels;
    const dstIdx = i * 4;
    const r = embBuffer[srcIdx];
    const g = embBuffer[srcIdx + 1];
    const b = embBuffer[srcIdx + 2];

    // Compute luminance / brightness
    const maxVal = Math.max(r, g, b);
    
    transparentBuffer[dstIdx] = r;
    transparentBuffer[dstIdx + 1] = g;
    transparentBuffer[dstIdx + 2] = b;

    if (maxVal < 15) {
      transparentBuffer[dstIdx + 3] = 0; // Pure transparent for black background
    } else if (maxVal < 45) {
      // Smooth feathering
      transparentBuffer[dstIdx + 3] = Math.round(((maxVal - 15) / 30) * 255);
    } else {
      transparentBuffer[dstIdx + 3] = 255;
    }
  }

  await sharp(transparentBuffer, {
    raw: { width: 512, height: 512, channels: 4 }
  })
    .png()
    .toFile(path.join(pubDir, 'logo-shield-transparent.png'));

  // Generate favicon versions
  await sharp(path.join(pubDir, 'logo-shield.png'))
    .resize(32, 32)
    .png()
    .toFile(path.join(pubDir, 'favicon.png'));

  await sharp(path.join(pubDir, 'logo-shield.png'))
    .resize(192, 192)
    .png()
    .toFile(path.join(pubDir, 'icon-192.png'));

  await sharp(path.join(pubDir, 'logo-shield.png'))
    .resize(512, 512)
    .png()
    .toFile(path.join(pubDir, 'icon-512.png'));

  // 2. Also extract horizontal crop (Emblem + SECURIA text)
  // minY = 130 to maxY = 860
  let fullMinX = width, fullMaxX = 0, fullMinY = height, fullMaxY = 0;
  for (let y = 130; y <= 860; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      if (data[idx] > 20 || data[idx + 1] > 20 || data[idx + 2] > 20) {
        if (x < fullMinX) fullMinX = x;
        if (x > fullMaxX) fullMaxX = x;
        if (y < fullMinY) fullMinY = y;
        if (y > fullMaxY) fullMaxY = y;
      }
    }
  }

  const fPad = 40;
  const fullLeft = Math.max(0, fullMinX - fPad);
  const fullTop = Math.max(0, fullMinY - fPad);
  const fullW = Math.min(width - fullLeft, (fullMaxX - fullMinX) + fPad * 2);
  const fullH = Math.min(height - fullTop, (fullMaxY - fullMinY) + fPad * 2);

  await sharp(inputPath)
    .extract({ left: fullLeft, top: fullTop, width: fullW, height: fullH })
    .png()
    .toFile(path.join(pubDir, 'securia-full-logo.png'));

  console.log('All branding assets generated successfully in public/');
}

processLogo().catch(err => {
  console.error(err);
  process.exit(1);
});
