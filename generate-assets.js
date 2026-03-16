import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import pngToIco from 'png-to-ico';

const INPUT_FILE = 'public/base-logo.png';
const OUTPUT_DIRS = ['public/logo', 'public/favicon', 'public/pwa-icons', 'public/social-preview'];

async function generateAssets() {
  let isInputValid = false;
  if (fs.existsSync(INPUT_FILE)) {
    try {
      await sharp(INPUT_FILE).metadata();
      isInputValid = true;
    } catch (e) {
      console.error(`Warning: Input file ${INPUT_FILE} is corrupted or unsupported. Generating a fallback base-logo.png.`);
    }
  }

  if (!isInputValid) {
    if (!fs.existsSync(INPUT_FILE)) {
      console.error(`Warning: Input file ${INPUT_FILE} not found. Generating a fallback base-logo.png.`);
    }
    try {
      await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 255, g: 75, b: 75, alpha: 1 } // #FF4B4B
        }
      })
      .composite([{
        input: Buffer.from(`<svg width="512" height="512" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`),
        gravity: 'center'
      }])
      .png()
      .toFile(INPUT_FILE);
      console.log('Fallback base-logo.png generated successfully.');
    } catch (e) {
      console.error('Failed to generate fallback base-logo.png. Skipping asset generation:', e);
      return;
    }
  }

  // Create output directories
  OUTPUT_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  console.log('Generating Website Logos...');
  await sharp(INPUT_FILE).resize({ width: 512 }).toFile('public/logo/logo-512.png');
  await sharp(INPUT_FILE).resize({ width: 1024 }).toFile('public/logo/logo-1024.png');
  await sharp(INPUT_FILE).resize({ width: 2048 }).toFile('public/logo/logo-2048.png');
  
  // Generate the transparent logo used in Layout.tsx
  await sharp(INPUT_FILE).resize({ width: 512 }).toFile('public/logo-transparent.png');

  console.log('Generating Favicon Pack...');
  await sharp(INPUT_FILE).resize(16, 16).toFile('public/favicon/favicon-16x16.png');
  await sharp(INPUT_FILE).resize(32, 32).toFile('public/favicon/favicon-32x32.png');
  await sharp(INPUT_FILE).resize(48, 48).toFile('public/favicon/favicon-48x48.png');
  await sharp(INPUT_FILE).resize(64, 64).toFile('public/favicon/favicon-64x64.png');
  
  try {
    const icoBuffer = await pngToIco('public/favicon/favicon-32x32.png');
    fs.writeFileSync('public/favicon/favicon.ico', icoBuffer);
  } catch (e) {
    console.error('Warning: Failed to generate favicon.ico:', e);
  }

  console.log('Generating Apple Touch Icon...');
  await sharp(INPUT_FILE).resize(180, 180).toFile('public/favicon/apple-touch-icon.png');

  console.log('Generating PWA Icons...');
  await sharp(INPUT_FILE).resize(192, 192).toFile('public/pwa-icons/icon-192x192.png');
  await sharp(INPUT_FILE).resize(512, 512).toFile('public/pwa-icons/icon-512x512.png');

  console.log('Generating Social Media Preview...');
  // Create a 1200x630 canvas with transparent background
  // Then composite the logo in the center
  const metadata = await sharp(INPUT_FILE).metadata();
  
  // Calculate dimensions to fit within 1200x630 while maintaining aspect ratio
  // Leave some padding (e.g., max width 800, max height 500)
  const maxWidth = 800;
  const maxHeight = 500;
  
  let logoWidth = metadata.width;
  let logoHeight = metadata.height;
  
  if (logoWidth > maxWidth || logoHeight > maxHeight) {
    const ratio = Math.min(maxWidth / logoWidth, maxHeight / logoHeight);
    logoWidth = Math.round(logoWidth * ratio);
    logoHeight = Math.round(logoHeight * ratio);
  }

  await sharp({
    create: {
      width: 1200,
      height: 630,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    }
  })
  .composite([{
    input: await sharp(INPUT_FILE).resize({ width: logoWidth, height: logoHeight }).toBuffer(),
    gravity: 'center'
  }])
  .toFile('public/social-preview/og-image.png');

  console.log('Generating Google Search Favicon...');
  await sharp(INPUT_FILE).resize(48, 48).toFile('public/favicon/google-favicon-48x48.png');

  console.log('All assets generated successfully!');
}

generateAssets().catch(err => {
  console.error('Warning: Error generating assets. Skipping asset generation:', err);
});
