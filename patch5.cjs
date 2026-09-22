const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// Fix 1: applyCleanEdgeMatting fgWeight logic
code = code.replace(
  /const fgWeight = Math\.max\(0\.55, aNorm\);/g,
  `const fgWeight = 1.0 - aNorm;`
);

// Fix 2: cleanEarNeckHeadHalosPass overwriting logic
code = code.replace(
  /const avgFgR = fgR \/ fgCount;\s*const avgFgG = fgG \/ fgCount;\s*const avgFgB = fgB \/ fgCount;\s*pixels\[pIdx\] = Math\.round\(avgFgR\);\s*pixels\[pIdx \+ 1\] = Math\.round\(avgFgG\);\s*pixels\[pIdx \+ 2\] = Math\.round\(avgFgB\);/g,
  `const avgFgR = fgR / fgCount;
        const avgFgG = fgG / fgCount;
        const avgFgB = fgB / fgCount;
        
        const aNorm = Math.max(0.15, a / 255.0);
        const invA = 1.0 - aNorm;
        const unmixR = Math.max(0, Math.min(255, (curR - avgBgR * invA) / aNorm));
        const unmixG = Math.max(0, Math.min(255, (curG - avgBgG * invA) / aNorm));
        const unmixB = Math.max(0, Math.min(255, (curB - avgBgB * invA) / aNorm));
        
        const fgWeight = 1.0 - aNorm;
        pixels[pIdx] = Math.round(unmixR * (1 - fgWeight) + avgFgR * fgWeight);
        pixels[pIdx + 1] = Math.round(unmixG * (1 - fgWeight) + avgFgG * fgWeight);
        pixels[pIdx + 2] = Math.round(unmixB * (1 - fgWeight) + avgFgB * fgWeight);`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
