import fs from 'fs';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const transparentIconSvg = `<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(10, 10)">
    <!-- Toolbox Handle (Orange Arc) -->
    <path d="M 65 75 C 65 45, 115 45, 115 75" fill="none" stroke="#E8621A" stroke-width="16" stroke-linecap="round"/>
    
    <!-- Toolbox Body (Orange Rect) -->
    <rect x="30" y="80" width="120" height="85" rx="12" fill="#E8621A"/>
    
    <!-- Subtle Divider Line -->
    <line x1="30" y1="118" x2="150" y2="118" stroke="white" stroke-width="2" opacity="0.3"/>
    
    <!-- Large Heart Shape (White) -->
    <path d="M 90 150 
             C 70 133, 50 117, 50 100 
             C 50 87, 62 77, 75 77 
             C 83 77, 88 81, 90 85 
             C 92 81, 97 77, 105 77 
             C 118 77, 130 87, 130 100 
             C 130 117, 110 133, 90 150 Z" 
          fill="white"/>
  </g>
</svg>`;

async function generate() {
  const squareBuffer = Buffer.from(transparentIconSvg);

  // Ensure directories exist
  const dirs = ['public/favicon'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 3. Favicons
  await sharp(squareBuffer).resize(16, 16).png().toFile('public/favicon/favicon-16x16.png');
  await sharp(squareBuffer).resize(32, 32).png().toFile('public/favicon/favicon-32x32.png');
  await sharp(squareBuffer).resize(48, 48).png().toFile('public/favicon/favicon-48x48.png');
  await sharp(squareBuffer).resize(64, 64).png().toFile('public/favicon/favicon-64x64.png');
  
  // 4. ICO file
  try {
    const icoBuffer = await pngToIco(['public/favicon/favicon-16x16.png', 'public/favicon/favicon-32x32.png', 'public/favicon/favicon-48x48.png', 'public/favicon/favicon-64x64.png']);
    fs.writeFileSync('public/favicon.ico', icoBuffer);
  } catch (e) {
    console.error('Warning: Failed to generate favicon.ico:', e);
  }

  console.log('Transparent Favicons generated successfully!');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
