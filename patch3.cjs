const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// 1. Soften lowerCut in applyCleanEdgeMatting for hair
code = code.replace(
  /const lowerCut = isUpper \? 20 : 130;/g,
  `const lowerCut = isUpper ? 5 : 130;`
);

// 2. Stop cleanEarNeckHeadHalosPass from destroying hair strands
code = code.replace(
  /if \(transparentCount >= 4 && a < 220\) \{\s*pixels\[pIdx \+ 3\] = 0;\s*continue;\s*\}/g,
  `if (transparentCount >= 6 && a < 100) { // Much less aggressive on hair
        pixels[pIdx + 3] = 0;
        continue;
      }`
);

code = code.replace(
  /if \(distToBg < Math\.max\(40, distToFg \* 1\.5\) && a < 120\) \{\s*pixels\[pIdx \+ 3\] = 0;\s*continue;\s*\}/g,
  `if (distToBg < Math.max(30, distToFg * 1.2) && a < 80) { // Keep more hair detail
          pixels[pIdx + 3] = 0;
          continue;
        }`
);

// 3. Stop qualityControlPerimeterPass from chopping hair
code = code.replace(
  /const hazeCutoff = isUpper \? 30 : 120;/g,
  `const hazeCutoff = isUpper ? 5 : 120; // Preserve fine hair`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
