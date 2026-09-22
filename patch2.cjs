const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// Replace the first despill block in applyCleanEdgeMatting
code = code.replace(
  /\/\/ Green Spill Suppression \(Despill\) to eliminate green screen halos in hair\s*if \(pixels\[pIdx \+ 3\] > 0 && pixels\[pIdx \+ 3\] < 255\) \{/g,
  `// Green Spill Suppression (Despill) to eliminate green screen halos in hair
      if (pixels[pIdx + 3] > 0 && tempAlphas[idx] < 250) {`
);

// Replace the second despill block in cleanEarNeckHeadHalosPass
code = code.replace(
  /\/\/ Green Spill Suppression \(Despill\) to eliminate green screen halos\s*if \(pixels\[pIdx \+ 3\] > 0 && pixels\[pIdx \+ 3\] < 255\) \{/g,
  `// Green Spill Suppression (Despill) to eliminate green screen halos
      if (pixels[pIdx + 3] > 0 && a < 250) {`
);

// Replace the third despill block in cleanEdgeHalosAndDeFringe
code = code.replace(
  /\/\/ 5\. Global Green Spill Suppression \(Despill\)\s*for \(let i = 0; i < total; i\+\+\) \{\s*const pIdx = i \* 4;\s*const a = pixels\[pIdx \+ 3\];\s*if \(a > 0 && a < 255\) \{/g,
  `// 5. Global Green Spill Suppression (Despill)
      for (let i = 0; i < total; i++) {
        const pIdx = i * 4;
        const a = pixels[pIdx + 3];
        const isUpper = Math.floor(i / w) < h * 0.6; // Despill upper 60%
        if (a > 0 && (a < 255 || isUpper)) {`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
