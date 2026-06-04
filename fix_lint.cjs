const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    let content = fs.readFileSync(filePath, 'utf8');
    for (const [target, replacement] of replacements) {
        content = content.replace(target, replacement);
    }
    fs.writeFileSync(filePath, content);
}

replaceInFile('src/tools/PregnancyCalculator.tsx', [
    [/, AlertCircle /g, ' '],
    [/, AlertCircle/g, ''],
    [/let weeks = /g, 'const weeks = '],
    [/let days = /g, 'const days = '],
]);

replaceInFile('src/tools/PregnancyWeightGainCalculator.tsx', [
    [/ Info, /g, ' '],
    [/ Info,/g, ''],
    [/let category = '';/g, 'let category: string;'],
    [/let totalRecommended: \[number, number\] = \[0, 0\];/g, 'let totalRecommended: [number, number];'],
    [/let weeklyRate2nd3rdTrim: \[number, number\] = \[0, 0\];/g, 'let weeklyRate2nd3rdTrim: [number, number];'],
    [/let expectedMin = 0;/g, 'let expectedMin: number;'],
    [/let expectedMax = 0;/g, 'let expectedMax: number;'] 
]);

replaceInFile('src/tools/QrGenerator.tsx', [
    [/\\&/g, '&'],
    [/\\@/g, '@']
]);

replaceInFile('src/tools/SalaryCalculator.tsx', [
    [/Clock, /g, ''],
    [/Clock,/g, ''],
    [/ Sigma, /g, ' '],
    [/, Sigma/g, ''],
    [/const currentYear = new Date\(\)\.getFullYear\(\);/g, '']
]);

replaceInFile('src/tools/SeoTools.tsx', [
    [/Trash2, /g, ''],
    [/Trash2,/g, ''],
    [/ Hash, /g, ' '],
    [/, Hash/g, ''],
    [/ LinkIcon,/g, ''],
    [/ ImageIcon,/g, ''],
    [/ Shield,/g, ''],
    [/case 'keyword-density-checker':\n          const text /g, 'case \'keyword-density-checker\': {\n          const text '],
    [/res = `Total Words: \$\{words\.length\}\\n\\nTop Keywords:\\n` \+ sorted\.map\(\(\[w, c\]\) => `- \$\{w\}: \$\{c\} times \(\$\{.*?\)%\)`\)\.join\('sw'\\n'\);\n          break;/g, 'res = `Total Words: ${words.length}\\n\\nTop Keywords:\\n` + sorted.map(([w, c]) => `- ${w}: ${c} times (${((c as number / words.length) * 100).toFixed(2)}%)`).join(\'\\n\');\n          break;\n        }'],
    [/case 'seo-title-generator':\n          const t /g, 'case \'seo-title-generator\': {\n          const t '],
    [/res = `1\. .* Checklist for Beginners`;\n          break;/g, 'res = `1. The Ultimate Guide to ${t} in 2026\\n2. 10 Best ${t} Strategies You Need to Know\\n3. How to Master ${t} for Better Results\\n4. ${t}: Everything You Need to Know (Expert Guide)\\n5. Top 7 Secrets About ${t} Revealed\\n6. Why ${t} is Important for Your Business\\n7. Step-by-Step Tutorial: Mastering ${t}\\n8. ${t} Checklist for Beginners`;\n          break;\n        }'],
    [/case 'seo-description-generator':\n          const kw /g, 'case \'seo-description-generator\': {\n          const kw '],
    [/read more now to boost your knowledge!\\n\\nAlternative:\\nMaster \$\{kw\} with our expert tips and tricks\. Learn how to optimize your \$\{kw\} strategy for maximum impact and success in 2026\.`;\n          break;/g, 'read more now to boost your knowledge!\\n\\nAlternative:\\nMaster ${kw} with our expert tips and tricks. Learn how to optimize your ${kw} strategy for maximum impact and success in 2026.`;\n          break;\n        }'],
]);

let seoText = fs.readFileSync('src/tools/SeoTools.tsx', 'utf8');
seoText = seoText.replace(/case 'url-slug-generator':\n          res/g, 'case \'url-slug-generator\': {\n          res')
                 .replace(/\.replace\(\/\(\^\-\|\\-\$\)\+\/g, ''\);\n          break;/g, '.replace(/(^-|-$)+/g, \'\');\n          break;\n        }')
                 .replace(/case 'open-graph-generator':\n          res/g, 'case \'open-graph-generator\': {\n          res')
                 .replace(/meta property="og:site_name" content="\$\{inputs\.site \|\| ''\}">`;\n          break;/g, 'meta property="og:site_name" content="${inputs.site || \'\'}">`;\n          break;\n        }');
fs.writeFileSync('src/tools/SeoTools.tsx', seoText);

replaceInFile('src/tools/SocialTools.tsx', [
    [/ Send, /g, ' '],
    [/ Send,/g, ''],
    [/, Send/g, ''],
    [/ Plus, /g, ' '],
    [/ Plus,/g, ''],
    [/, Plus/g, ''],
    [/\\&/g, '&'],
    [/\\\?/g, '?'],
    [/let selected = /g, 'const selected = '],
    [/case 'instagram-caption-generator':\n          const tone /g, 'case \'instagram-caption-generator\': {\n          const tone '],
    [/break;\n\n        case 'youtube'/g, 'break;\n        }\n\n        case \'youtube\''],
    [/case 'youtube-titles':\n          const vidTopic /g, 'case \'youtube-titles\': {\n          const vidTopic '],
    [/break;\n\n        case 'tiktok'/g, 'break;\n        }\n\n        case \'tiktok\''],
    [/case 'tiktok-ideas':\n          const niche /g, 'case \'tiktok-ideas\': {\n          const niche '],
    [/break;\n      \}/g, 'break;\n        }\n      }'],
    [/catch \(err\)/g, 'catch'],
    [/const handleChange = \(e: React\.ChangeEvent/g, 'const handleChange = (_e: React.ChangeEvent']
]);

replaceInFile('src/tools/SvgToPngConverter.tsx', [
    [/useCallback, /g, ''],
    [/Upload, /g, ''],
    [/ CheckCircle2,/g, ''],
    [/ AlertCircle,/g, ''],
    [/ Move,/g, ''],
    [/ Trash2,/g, ''],
    [/ ImagePlus,/g, ''],
    [/const isDragging = /g, 'const _isDragging = '],
    [/handleDragOver = /g, '_handleDragOver = '],
    [/handleDragLeave = /g, '_handleDragLeave = '],
    [/handleDrop = /g, '_handleDrop = '],
    [/clearAll = /g, '_clearAll = '],
    [/toolState,/g, ''],
    [/onReset,/g, '']
]);

replaceInFile('src/tools/TextTools.tsx', [
    [/ ArrowRightLeft,/g, ''],
    [/case 'upside-down':\n          let arr /g, 'case \'upside-down\': {\n          const arr '],
    [/break;\n\n        case 'zalgo'/g, 'break;\n        }\n\n        case \'zalgo\''],
    [/case 'encode-base64':\n          res /g, 'case \'encode-base64\': {\n          res '],
    [/case 'decode-base64':\n          res /g, 'case \'decode-base64\': {\n          res '],
    [/case 'encode-url':\n          res /g, 'case \'encode-url\': {\n          res '],
    [/case 'decode-url':\n          res /g, 'case \'decode-url\': {\n          res '],
    [/function replaceZalgo\(e\) \{.*\}/g, ''], // just an example, maybe not needed
    [/break;\n      \}/g, 'break;\n        }\n      }']
]);

// TextTools specific complex fixes
let tt = fs.readFileSync('src/tools/TextTools.tsx', 'utf8');
tt = tt.replace(/case 'encode-base64':/g, 'case \'encode-base64\': {')
       .replace(/case 'decode-base64':/g, 'case \'decode-base64\': {')
       .replace(/case 'encode-url':/g, 'case \'encode-url\': {')
       .replace(/case 'decode-url':/g, 'case \'decode-url\': {')
       .replace(/res = btoa\(inputs\.text \|\| ''\);\n          break;/g, 'res = btoa(inputs.text || \'\');\n          break;\n        }')
       .replace(/res = atob\(inputs\.text \|\| ''\);\n          break;/g, 'res = atob(inputs.text || \'\');\n          break;\n        }')
       .replace(/res = encodeURIComponent\(inputs\.text \|\| ''\);\n          break;/g, 'res = encodeURIComponent(inputs.text || \'\');\n          break;\n        }')
       .replace(/res = decodeURIComponent\(inputs\.text \|\| ''\);\n          break;/g, 'res = decodeURIComponent(inputs.text || \'\');\n          break;\n        }')
       .replace(/\(e: React\.ChangeEvent/g, '(_e: React.ChangeEvent'); // unused e
fs.writeFileSync('src/tools/TextTools.tsx', tt);

let vc = fs.readFileSync('vite.config.ts', 'utf8');
vc = vc.replace(/\(\{ mode, env \}\)/g, '({ mode })');
fs.writeFileSync('vite.config.ts', vc);

console.log("Done");
