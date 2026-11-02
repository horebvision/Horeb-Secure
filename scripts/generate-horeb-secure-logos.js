const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const sourceImg = 'C:\\Users\\HP ELTEBOO\\.gemini\\antigravity-ide\\brain\\93d9f448-ddbe-41dd-b3dc-65ee68df058a\\.user_uploaded\\media_1792569403758.jpg';

async function main() {
  console.log('--- GÉNÉRATION DES LOGOS HOREB SECURE ---');

  if (!fs.existsSync(sourceImg)) {
    throw new Error('Image source introuvable : ' + sourceImg);
  }

  // 1. Logo complet haute résolution (1024x1024)
  console.log('1. Génération logo complet 1024x1024...');
  await sharp(sourceImg)
    .png()
    .toFile(path.join(publicDir, 'logo.png'));

  await sharp(sourceImg)
    .png()
    .toFile(path.join(publicDir, 'securia-full-logo.png'));

  await sharp(sourceImg)
    .png()
    .toFile(path.join(publicDir, 'horeb-secure-logo.png'));

  // 2. Emblème (Bouclier métallique avec anneau et feuille verte)
  // Coordonnées centrées sur le symbole : left 262, top 105, 500x500
  console.log('2. Découpe de l\'emblème bouclier...');
  const emblemBuffer = await sharp(sourceImg)
    .extract({ left: 262, top: 105, width: 500, height: 500 })
    .png()
    .toBuffer();

  await sharp(emblemBuffer)
    .resize(512, 512)
    .toFile(path.join(publicDir, 'logo-shield.png'));

  await sharp(emblemBuffer)
    .resize(512, 512)
    .toFile(path.join(publicDir, 'logo-shield-transparent.png'));

  // 3. Icônes PWA et mobiles
  console.log('3. Génération des icônes PWA...');
  await sharp(emblemBuffer)
    .resize(512, 512)
    .toFile(path.join(publicDir, 'icon.png'));

  await sharp(emblemBuffer)
    .resize(512, 512)
    .toFile(path.join(publicDir, 'icon-512.png'));

  await sharp(emblemBuffer)
    .resize(192, 192)
    .toFile(path.join(publicDir, 'icon-192.png'));

  await sharp(emblemBuffer)
    .resize(180, 180)
    .toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // 4. Favicon
  console.log('4. Génération favicon...');
  await sharp(emblemBuffer)
    .resize(64, 64)
    .toFile(path.join(publicDir, 'favicon.png'));

  // Copie en favicon.ico (compatibilité navigateurs)
  await sharp(emblemBuffer)
    .resize(48, 48)
    .toFile(path.join(publicDir, 'favicon.ico'));

  console.log('✔ Tous les logos et icônes Horeb Secure ont été générés avec succès !');
}

main().catch(err => {
  console.error('Erreur:', err);
  process.exit(1);
});
