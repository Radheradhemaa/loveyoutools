const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// 1. Soften Guided Filter for shoulders
code = code.replace(
  /const threshLow = isUpper \? 10 : 140;/g,
  `const threshLow = isUpper ? 10 : 30; // Soften shoulders`
);
code = code.replace(
  /const threshHigh = isUpper \? 245 : 190;/g,
  `const threshHigh = isUpper ? 245 : 210;`
);

// 2. Soften Clean Edge Matting for shoulders
code = code.replace(
  /const lowerCut = isUpper \? 5 : 130;/g,
  `const lowerCut = isUpper ? 5 : 20; // Allow natural anti-aliasing on edges`
);
code = code.replace(
  /const upperCut = isUpper \? 245 : 190;/g,
  `const upperCut = isUpper ? 245 : 210;`
);

// 3. Soften Quality Control pass for shoulders
code = code.replace(
  /const hazeCutoff = isUpper \? 5 : 120; \/\/ Preserve fine hair/g,
  `const hazeCutoff = isUpper ? 5 : 20; // Preserve fine hair and shoulder edges`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
