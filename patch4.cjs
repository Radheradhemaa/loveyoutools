const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// The Guided Filter is still making hair disappear because of the strict cutoff in applyFastGuidedFilter
code = code.replace(
  /const threshLow = isUpper \? 40 : 140;/g,
  `const threshLow = isUpper ? 10 : 140;`
);
code = code.replace(
  /const upperCut = isUpper \? 220 : 190;/g,
  `const upperCut = isUpper ? 245 : 190;`
);
code = code.replace(
  /const threshHigh = isUpper \? 210 : 190;/g,
  `const threshHigh = isUpper ? 245 : 190;`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
