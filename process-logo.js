import sharp from 'sharp';
import fs from 'fs';

async function processLogo() {
  const input = 'public/loveyoutools-logo.png';
  const output = 'public/loveyoutools-logo-processed.png';

  console.log('Processing logo to add black background...');
  
  // Just resize and add black background padding
  await sharp(input)
    .resize({ 
      width: 1200, 
      height: 400, 
      fit: 'contain', 
      background: { r: 0, g: 0, b: 0, alpha: 1 } 
    })
    .toFile(output);

  // Also save to logo.png and logo-transparent.png for compatibility
  await sharp(output).toFile('public/logo.png');
  await sharp(output).toFile('public/logo-transparent.png');
  await sharp(output).toFile(input);

  if (fs.existsSync(output)) {
    fs.unlinkSync(output);
  }

  console.log('Logo processed and saved to multiple locations.');
}

processLogo().catch(console.error);
