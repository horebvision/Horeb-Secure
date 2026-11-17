/**
 * Génère les icônes de l'application installable (PWA) à partir du logo officiel.
 *
 * - icon-192 / icon-512 (purpose "any") : emblème recadré plein cadre.
 * - icon-maskable-192 / 512 : emblème réduit dans la zone de sécurité (80 % central) sur le fond
 *   bleu du logo, pour qu'Android puisse le découper en cercle ou en goutte sans le rogner.
 * - apple-touch-icon (180) : iOS arrondit lui-même les angles.
 *
 * Usage : node scripts/generate-pwa-icons.js
 */
const path = require('path');
const sharp = require('sharp');

const publicDir = path.resolve(__dirname, '..', 'public');
const source = path.join(publicDir, 'horeb-secure-logo.png'); // 1024x1024

// Emblème (anneau + bouclier + feuille) dans le logo 1024 px
// Le texte « HOREB » commence vers y = 588 : le cadre s'arrête au-dessus.
const EMBLEM = { left: 268, top: 82, width: 496, height: 496 };

/** Masque circulaire à bord progressif : fond l'emblème dans le fond sans arête visible. */
function softCircleMask(size) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="78%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return Buffer.from(svg);
}

async function main() {
  const emblem = await sharp(source).extract(EMBLEM).toBuffer();
  const png = (img) => img.png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 });

  for (const size of [192, 512]) {
    await png(sharp(emblem).resize(size, size)).toFile(path.join(publicDir, `icon-${size}.png`));

    // Maskable : fond = emblème agrandi et flouté (même texture bleue) ; l'emblème net occupe 78 %
    // du côté, détouré en cercle progressif, donc entièrement dans la zone de sécurité.
    const inner = Math.round(size * 0.78);
    const pad = Math.round((size - inner) / 2);
    const background = await sharp(emblem).resize(size, size).blur(size / 12).modulate({ brightness: 0.7 }).toBuffer();
    const sharpEmblem = await sharp(emblem)
      .resize(inner, inner)
      .ensureAlpha()
      .composite([{ input: softCircleMask(inner), blend: 'dest-in' }])
      .png()
      .toBuffer();
    await png(sharp(background).composite([{ input: sharpEmblem, left: pad, top: pad }])).toFile(
      path.join(publicDir, `icon-maskable-${size}.png`)
    );
  }

  await png(sharp(emblem).resize(180, 180)).toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await png(sharp(emblem).resize(64, 64)).toFile(path.join(publicDir, 'favicon.png'));

  console.log('Icônes PWA générées dans public/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
