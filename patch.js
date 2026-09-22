const fs = require('fs');
let code = fs.readFileSync('src/lib/bgRemoval.ts', 'utf8');

code = code.replace(
  `        pixels[pIdx] = Math.round(Math.max(0, Math.min(255, unmixR)));
        pixels[pIdx + 1] = Math.round(Math.max(0, Math.min(255, unmixG)));
        pixels[pIdx + 2] = Math.round(Math.max(0, Math.min(255, unmixB)));
      }
    }
  }
}

/**`,
  `        pixels[pIdx] = Math.round(Math.max(0, Math.min(255, unmixR)));
        pixels[pIdx + 1] = Math.round(Math.max(0, Math.min(255, unmixG)));
        pixels[pIdx + 2] = Math.round(Math.max(0, Math.min(255, unmixB)));
      }

      // Green Spill Suppression (Despill)
      if (pixels[pIdx + 3] > 0 && pixels[pIdx + 3] < 255) {
        const r = pixels[pIdx];
        const g = pixels[pIdx + 1];
        const b = pixels[pIdx + 2];
        if (g > r && g > b) {
          pixels[pIdx + 1] = Math.max(r, b); // Clamp green to max of red or blue
        }
      }
    }
  }
}

/**`
);
fs.writeFileSync('src/lib/bgRemoval.ts', code);
