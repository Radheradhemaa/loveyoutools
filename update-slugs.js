import fs from 'fs';

const toolsFile = fs.readFileSync('src/data/tools.ts', 'utf-8');

// Function to generate slug from name
function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

let updatedToolsFile = toolsFile.replace(/\{ id: '([^']+)', c: '([^']+)', n: '([^']+)', d: '([^']+)', i: '([^']+)', b: '([^']+)' \}/g, (match, id, c, n, d, i, b) => {
  const slug = generateSlug(n);
  return `{ id: '${slug}', c: '${c}', n: '${n}', d: '${d}', i: '${i}', b: '${b}' }`;
});

fs.writeFileSync('src/data/tools.ts', updatedToolsFile);

const toolPageFile = fs.readFileSync('src/pages/ToolPage.tsx', 'utf-8');
let updatedToolPageFile = toolPageFile
  .replace(/tool\.id === 'word-counter'/g, "tool.id === 'word-counter'")
  .replace(/tool\.id === 'json-fmt'/g, "tool.id === 'json-formatter-validator'")
  .replace(/tool\.id === 'age-calc'/g, "tool.id === 'age-calculator'")
  .replace(/tool\.id === 'qr-gen'/g, "tool.id === 'qr-code-generator'")
  .replace(/tool\.id === 'img-compress'/g, "tool.id === 'image-compressor'")
  .replace(/tool\.id === 'photo-sign-resize'/g, "tool.id === 'photo-sign-resizer'")
  .replace(/tool\.id === 'pdf-edit'/g, "tool.id === 'edit-pdf'")
  .replace(/tool\.id === 'pdf-crop'/g, "tool.id === 'crop-pdf'");

fs.writeFileSync('src/pages/ToolPage.tsx', updatedToolPageFile);
