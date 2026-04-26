import fs from 'fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const svgContent = `<svg width="1200" height="200" viewBox="0 0 1200 200" xmlns="http://www.w3.org/2000/svg">
  <!-- Icon Group -->
  <g transform="translate(10, 10)">
    <!-- iOS Style Icon Background -->
    <rect x="0" y="0" width="180" height="180" rx="45" fill="#E8621A" stroke="black" stroke-width="10"/>
    
    <!-- Toolbox Handle (White Arc) -->
    <path d="M 65 75 C 65 45, 115 45, 115 75" fill="none" stroke="white" stroke-width="14" stroke-linecap="round"/>
    
    <!-- Toolbox Body (White Rect) -->
    <rect x="35" y="80" width="110" height="75" rx="10" fill="white"/>
    
    <!-- Subtle Divider Line -->
    <line x1="35" y1="118" x2="145" y2="118" stroke="#E8621A" stroke-width="2" opacity="0.2"/>
    
    <!-- Large Heart Shape (Deep Orange) -->
    <path d="M 90 145 
             C 70 128, 50 112, 50 95 
             C 50 82, 62 72, 75 72 
             C 83 72, 88 76, 90 80 
             C 92 76, 97 72, 105 72 
             C 118 72, 130 82, 130 95 
             C 130 112, 110 128, 90 145 Z" 
          fill="#E8621A"/>
  </g>
  
  <!-- Wordmark Group -->
  <g transform="translate(220, 135)">
    <text font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="100" letter-spacing="-3">
      <tspan fill="#E8621A">Loveyou</tspan><tspan fill="#111827">Tools</tspan>
    </text>
  </g>
</svg>`;

const squareSvgContent = `<svg width="200" height="200" viewBox="10 10 180 180" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(10, 10)">
    <rect x="0" y="0" width="180" height="180" rx="45" fill="#E8621A" stroke="black" stroke-width="10"/>
    <path d="M 65 75 C 65 45, 115 45, 115 75" fill="none" stroke="white" stroke-width="14" stroke-linecap="round"/>
    <rect x="35" y="80" width="110" height="75" rx="10" fill="white"/>
    <line x1="35" y1="118" x2="145" y2="118" stroke="#E8621A" stroke-width="2" opacity="0.2"/>
    <path d="M 90 145 
             C 70 128, 50 112, 50 95 
             C 50 82, 62 72, 75 72 
             C 83 72, 88 76, 90 80 
             C 92 76, 97 72, 105 72 
             C 118 72, 130 82, 130 95 
             C 130 112, 110 128, 90 145 Z" 
          fill="#E8621A"/>
  </g>
</svg>`;

async function generate() {
  const svgBuffer = Buffer.from(svgContent);
  const squareBuffer = Buffer.from(squareSvgContent);

  // Ensure directories exist
  const dirs = ['public/favicon', 'public/pwa-icons', 'public/assets/images'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 1. Main Logo (Transparent PNG)
  await sharp(svgBuffer)
    .resize(1200, 200)
    .png()
    .toFile('public/logo.png');

  // Also output to loveyoutools-logo.png for consistency
  await sharp(svgBuffer)
    .resize(1200, 200)
    .png()
    .toFile('public/loveyoutools-logo.png');

  // 2. Transparent Logo
  await sharp(svgBuffer)
    .resize(1200, 200)
    .png()
    .toFile('public/logo-transparent.png');

  // 3. Favicons and PWA Icons
  await sharp(squareBuffer).resize(16, 16).png().toFile('public/favicon/favicon-16x16.png');
  await sharp(squareBuffer).resize(32, 32).png().toFile('public/favicon/favicon-32x32.png');
  await sharp(squareBuffer).resize(180, 180).png().toFile('public/favicon/apple-touch-icon.png');
  await sharp(squareBuffer).resize(192, 192).png().toFile('public/pwa-icons/icon-192x192.png');
  await sharp(squareBuffer).resize(512, 512).png().toFile('public/pwa-icons/icon-512x512.png');
  await sharp(squareBuffer).resize(180, 180).png().toFile('public/apple-touch-icon.png');
  
  // 4. ICO file
  try {
    const icoBuffer = await pngToIco('public/favicon/favicon-32x32.png');
    fs.writeFileSync('public/favicon.ico', icoBuffer);
  } catch (e) {
    console.error('Warning: Failed to generate favicon.ico:', e);
  }

  // 5. Also update the assets folder ones
  await sharp(svgBuffer).png().toFile('public/assets/images/loveyoutools_transparent.png');

  console.log('Ultra HD Transparent Logo and all assets generated successfully!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
