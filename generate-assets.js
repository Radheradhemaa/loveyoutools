import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import pngToIco from 'png-to-ico';

const INPUT_FILE = 'public/assets/images/loveyoutools_transparent.png';
const OUTPUT_DIRS = ['public/logo', 'public/favicon', 'public/pwa-icons', 'public/social-preview'];

async function generateAssets() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.log(`${INPUT_FILE} not found. Attempting to generate it...`);
    try {
      // Import and run generate-final-logo logic if possible, or just warn
      console.warn(`Warning: ${INPUT_FILE} is missing. Please run 'node generate-final-logo.js' first.`);
    } catch (e) {
      console.error('Failed to trigger logo generation:', e);
    }
  }

  let isInputValid = false;
  if (fs.existsSync(INPUT_FILE)) {
    try {
      await sharp(INPUT_FILE).metadata();
      isInputValid = true;
    } catch (e) {
      console.error(`Warning: Input file ${INPUT_FILE} is corrupted or unsupported.`);
    }
  }

  if (!isInputValid) {
    console.error(`Error: Input file ${INPUT_FILE} not found or invalid.`);
    process.exit(1);
  }

  // Create output directories
  OUTPUT_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  console.log('Generating Website Logos...');
  const trimmedBuffer = await sharp(INPUT_FILE).toBuffer();
  
  // Overwrite public/logo.png with the trimmed version for direct use
  await sharp(trimmedBuffer).toFile('public/logo.png.tmp');
  fs.renameSync('public/logo.png.tmp', 'public/logo.png');

  await sharp(trimmedBuffer).resize({ width: 512 }).toFile('public/logo/logo-512.png');
  await sharp(trimmedBuffer).resize({ width: 1024 }).toFile('public/logo/logo-1024.png');
  await sharp(trimmedBuffer).resize({ width: 2048 }).toFile('public/logo/logo-2048.png');
  
  // Generate the transparent logo used in Layout.tsx
  await sharp(trimmedBuffer).resize({ width: 512 }).toFile('public/logo-transparent.png');

  // --- FAVICON GENERATION (ICON ONLY, NO TEXT) ---
  const transparentIconSvg = `<svg width="200" height="200" viewBox="30 41 140 140" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(10, 10)">
    <!-- Toolbox Handle (Orange Arc) -->
    <path d="M 65 75 C 65 45, 115 45, 115 75" fill="none" stroke="#E8621A" stroke-width="16" stroke-linecap="round"/>
    <!-- Toolbox Body (Orange Rect) -->
    <rect x="30" y="80" width="120" height="85" rx="12" fill="#E8621A"/>
    <!-- Subtle Divider Line -->
    <line x1="30" y1="118" x2="150" y2="118" stroke="white" stroke-width="2" opacity="0.3"/>
    <!-- Large Heart Shape (White) -->
    <path d="M 90 150 C 70 133, 50 117, 50 100 C 50 87, 62 77, 75 77 C 83 77, 88 81, 90 85 C 92 81, 97 77, 105 77 C 118 77, 130 87, 130 100 C 130 117, 110 133, 90 150 Z" fill="white"/>
  </g>
</svg>`;
  const iconBuffer = Buffer.from(transparentIconSvg);

  console.log('Generating Favicon Pack...');
  await sharp(iconBuffer).resize(16, 16).png().toFile('public/favicon/favicon-16x16.png');
  await sharp(iconBuffer).resize(32, 32).png().toFile('public/favicon/favicon-32x32.png');
  await sharp(iconBuffer).resize(48, 48).png().toFile('public/favicon/favicon-48x48.png');
  await sharp(iconBuffer).resize(64, 64).png().toFile('public/favicon/favicon-64x64.png');
  
  try {
    const icoBuffer = await pngToIco('public/favicon/favicon-32x32.png');
    fs.writeFileSync('public/favicon/favicon.ico', icoBuffer);
    fs.writeFileSync('public/favicon.ico', icoBuffer); // Also in root
  } catch (e) {
    console.error('Warning: Failed to generate favicon.ico:', e);
  }

  console.log('Generating Apple Touch Icon...');
  // Apple recommends 180x180 png for touch icons
  // Add a white background since apple-touch-icon usually doesn't gracefully handle transparency
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite([{ input: await sharp(iconBuffer).resize(160, 160).toBuffer(), gravity: 'center' }])
    .png().toFile('public/favicon/apple-touch-icon.png');
    
  await sharp({
    create: {
      width: 180,
      height: 180,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).composite([{ input: await sharp(iconBuffer).resize(160, 160).toBuffer(), gravity: 'center' }])
    .png().toFile('public/apple-touch-icon.png'); // Also in root

  console.log('Generating PWA Icons...');
  // Use pure icon for PWA icons too
  await sharp(iconBuffer).resize(192, 192).png().toFile('public/pwa-icons/icon-192x192.png');
  await sharp(iconBuffer).resize(512, 512).png().toFile('public/pwa-icons/icon-512x512.png');

  console.log('Generating Social Media Preview...');
  // Create a 1200x630 canvas with transparent background
  // Then composite the logo in the center
  const metadata = await sharp(trimmedBuffer).metadata();
  
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
    input: await sharp(trimmedBuffer).resize({ width: logoWidth, height: logoHeight }).toBuffer(),
    gravity: 'center'
  }])
  .toFile('public/social-preview/og-image.png');

  console.log('Generating Google Search Favicon...');
  await sharp(iconBuffer).resize(48, 48).png().toFile('public/favicon/google-favicon-48x48.png');

  console.log('All assets generated successfully!');
}

generateAssets().catch(err => {
  console.error('Error generating assets:', err);
  process.exit(1);
});
