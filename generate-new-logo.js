import fs from 'fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const svgContent = `<svg viewBox="0 0 800 200" width="800" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="5" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  
  <!-- Layered Heart Icon -->
  <g transform="translate(40, 20)">
    <!-- Outer Layers -->
    <path d="M80,140 C40,100 0,70 0,40 C0,15 20,0 40,0 C55,0 70,10 80,25 C90,10 105,0 120,0 C140,0 160,15 160,40 C160,70 120,100 80,140 Z" fill="#ff7a1a" opacity="0.1"/>
    <path d="M80,130 C45,95 10,65 10,38 C10,18 25,5 40,5 C52,5 65,15 80,30 C95,15 108,5 120,5 C135,5 150,18 150,38 C150,65 115,95 80,130 Z" fill="#ff7a1a" opacity="0.2"/>
    
    <!-- Main Heart -->
    <path d="M80,120 C50,90 20,60 20,35 C20,20 30,10 45,10 C55,10 70,20 80,35 C90,20 105,10 115,10 C130,10 140,20 140,35 C140,60 110,90 80,120 Z" fill="#ff7a1a" filter="url(#glow)"/>
    
    <!-- Keyhole/Tool Symbol -->
    <g transform="translate(80, 55)">
      <circle cx="0" cy="0" r="16" fill="white"/>
      <rect x="-5" y="0" width="10" height="22" rx="2" fill="white"/>
      <!-- Cutout to make it look like a wrench/keyhole -->
      <circle cx="0" cy="-4" r="5" fill="#ff7a1a"/>
      <rect x="-2.5" y="-4" width="5" height="10" fill="#ff7a1a"/>
    </g>
    
    <!-- Small Heart at bottom -->
    <path d="M80,150 C75,145 70,140 70,137 C70,135 72,133 75,133 C77,133 79,135 80,137 C81,135 83,133 85,133 C88,133 90,135 90,137 C90,140 85,145 80,150 Z" fill="#ff7a1a" opacity="0.6"/>
  </g>

  <!-- Text Section -->
  <g transform="translate(220, 105)">
    <text x="0" y="0" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="80" fill="#ff7a1a">love</text>
    <text x="165" y="0" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="80" fill="#111827">you</text>
    <text x="5" y="45" font-family="system-ui, -apple-system, sans-serif" font-weight="600" font-size="32" fill="#ff7a1a">tools.</text>
  </g>
  
  <!-- Accent Lines -->
  <g transform="translate(720, 80)">
    <rect x="0" y="0" width="40" height="4" rx="2" fill="#ff7a1a"/>
    <rect x="10" y="12" width="30" height="4" rx="2" fill="#ff7a1a" opacity="0.6"/>
    <rect x="20" y="24" width="20" height="4" rx="2" fill="#ff7a1a" opacity="0.3"/>
  </g>
</svg>`;

const squareSvgContent = `<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(20, 20)">
    <path d="M80,140 C40,100 0,70 0,40 C0,15 20,0 40,0 C55,0 70,10 80,25 C90,10 105,0 120,0 C140,0 160,15 160,40 C160,70 120,100 80,140 Z" fill="#ff7a1a" opacity="0.1"/>
    <path d="M80,130 C45,95 10,65 10,38 C10,18 25,5 40,5 C52,5 65,15 80,30 C95,15 108,5 120,5 C135,5 150,18 150,38 C150,65 115,95 80,130 Z" fill="#ff7a1a" opacity="0.2"/>
    <path d="M80,120 C50,90 20,60 20,35 C20,20 30,10 45,10 C55,10 70,20 80,35 C90,20 105,10 115,10 C130,10 140,20 140,35 C140,60 110,90 80,120 Z" fill="#ff7a1a"/>
    <g transform="translate(80, 55)">
      <circle cx="0" cy="0" r="16" fill="white"/>
      <rect x="-5" y="0" width="10" height="22" rx="2" fill="white"/>
      <circle cx="0" cy="-4" r="5" fill="#ff7a1a"/>
      <rect x="-2.5" y="-4" width="5" height="10" fill="#ff7a1a"/>
    </g>
  </g>
</svg>`;

const dirs = [
  'public/logo',
  'public/favicon',
  'public/pwa-icons',
  'public/assets/images'
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
  
  // Base transparent PNG for the new path
  await sharp(svgBuffer)
    .png()
    .toFile('public/assets/images/loveyoutools_transparent.png');
  
  // Base transparent PNG
  await sharp(svgBuffer)
    .png()
    .toFile('public/logo/loveyoutools-logo.png');
  
  // Also keep the root one just in case
  await sharp(svgBuffer)
    .png()
    .toFile('public/loveyoutools-logo.png');

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
