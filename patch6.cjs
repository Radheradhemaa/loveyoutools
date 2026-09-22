const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

// Fix solidify logic
code = code.replace(
  /if \(y > chinY\) \{\s*\/\/ For torso\/body, guarantee solid opacity to prevent bleed\s*if \(alphas\[i\] > 10\) alphas\[i\] = 255\.0;\s*\} else \{\s*\/\/ For head\/hair, preserve natural semi-transparent alphas!\s*if \(alphas\[i\] >= 240\) alphas\[i\] = 255\.0;\s*\}/g,
  `if (y > chinY) {
          // For torso/body, guarantee solid opacity to prevent bleed, but only for the actual core
          if (alphas[i] > 180) alphas[i] = 255.0;
        } else {
          // For head/hair, preserve natural semi-transparent alphas!
          if (alphas[i] >= 240) alphas[i] = 255.0;
        }`
);

fs.writeFileSync('src/lib/bgRemoval.ts', code);
