import fs from 'fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const svgContent = `<svg viewBox="0 0 800 240" width="800" height="240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="heartGrad" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#ff8a65" />
      <stop offset="40%" stop-color="#e8501a" />
      <stop offset="100%" stop-color="#bf360c" />
    </radialGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#bf360c" flood-opacity="0.25"/>
    </filter>
  </defs>
  
  <!-- Target -->
  <g transform="translate(25, 15)">
    <circle cx="20" cy="20" r="14" fill="none" stroke="#6b72ff" stroke-width="4"/>
    <circle cx="20" cy="20" r="6" fill="none" stroke="#6b72ff" stroke-width="3"/>
    <circle cx="20" cy="20" r="2" fill="#6b72ff"/>
  </g>

  <!-- Yellow dots -->
  <g transform="translate(190, 15)">
    <circle cx="10" cy="25" r="7" fill="#ffc107"/>
    <circle cx="28" cy="10" r="3.5" fill="#ffdd57"/>
    <circle cx="25" cy="40" r="4.5" fill="#ffaa00"/>
  </g>

  <!-- Heart -->
  <g transform="translate(30, 40)">
    <path d="M95,160 C40,105 0,65 0,35 C0,15 15,0 35,0 C55,0 75,15 95,35 C115,15 135,0 155,0 C175,0 190,15 190,35 C190,65 150,105 95,160 Z" fill="url(#heartGrad)" filter="url(#shadow)"/>
    
    <!-- Highlights -->
    <path d="M 20 40 A 30 30 0 0 1 45 15" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
    <path d="M 30 55 A 40 40 0 0 1 65 30" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
  </g>

  <!-- Text -->
  <g transform="translate(240, 115)">
    <text x="0" y="0" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="95" fill="#e8501a" letter-spacing="-2">Love</text>
    <text x="0" y="80" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="95" fill="#111827" letter-spacing="-3">You</text>
    <text x="170" y="80" font-family="system-ui, -apple-system, sans-serif" font-weight="500" font-size="95" fill="#8b95a5" letter-spacing="-4">Tools</text>
    <text x="5" y="125" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="26" fill="#e8501a" letter-spacing="4">SMART WEB UTILITY PLATFORM</text>
  </g>
</svg>`;

const squareSvgContent = `<svg viewBox="0 0 240 240" width="240" height="240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="heartGrad" cx="35%" cy="30%" r="75%">
      <stop offset="0%" stop-color="#ff8a65" />
      <stop offset="40%" stop-color="#e8501a" />
      <stop offset="100%" stop-color="#bf360c" />
    </radialGradient>
  </defs>
  <g transform="translate(25, 40)">
    <path d="M95,160 C40,105 0,65 0,35 C0,15 15,0 35,0 C55,0 75,15 95,35 C115,15 135,0 155,0 C175,0 190,15 190,35 C190,65 150,105 95,160 Z" fill="url(#heartGrad)"/>
    <path d="M 20 40 A 30 30 0 0 1 45 15" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
    <path d="M 30 55 A 40 40 0 0 1 65 30" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity="0.3"/>
  </g>
</svg>`;

const dirs = [
  'public/logo',
  'public/favicon',
  'public/pwa-icons'
];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

fs.writeFileSync('public/logo/loveyoutools-logo.svg', svgContent);

async function generate() {
  const svgBuffer = Buffer.from(svgContent);
  const squareBuffer = Buffer.from(squareSvgContent);
  
  // Base transparent PNG
  await sharp(svgBuffer)
    .png()
    .toFile('public/logo/loveyoutools-logo.png');

  // Overwrite base-logo.png for other asset generation
  await sharp(svgBuffer)
    .png()
    .toFile('public/base-logo.png');

  // Favicons
  await sharp(squareBuffer).resize(16, 16).png().toFile('public/favicon/favicon-16x16.png');
  await sharp(squareBuffer).resize(32, 32).png().toFile('public/favicon/favicon-32x32.png');
  await sharp(squareBuffer).resize(192, 192).png().toFile('public/pwa-icons/icon-192x192.png');
  await sharp(squareBuffer).resize(512, 512).png().toFile('public/pwa-icons/icon-512x512.png');
  await sharp(squareBuffer).resize(192, 192).png().toFile('public/pwa-icons/icon-192.png');
  await sharp(squareBuffer).resize(512, 512).png().toFile('public/pwa-icons/icon-512.png');
  
  const icoBuffer = await pngToIco('public/favicon/favicon-32x32.png');
  fs.writeFileSync('public/favicon/favicon.ico', icoBuffer);
  
  console.log('All logo assets generated successfully!');
}

generate().catch(console.error);
