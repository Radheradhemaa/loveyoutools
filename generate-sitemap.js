import fs from 'fs';

try {
  const toolsFile = fs.readFileSync('src/data/tools.ts', 'utf-8');
  const regex = /\{ id: '([^']+)'/g;
  let match;
  const slugs = [];

  while ((match = regex.exec(toolsFile)) !== null) {
    slugs.push(match[1]);
  }

  const baseUrl = 'https://loveyoutools.com'; // Replace with actual domain if known, but this is fine for now
  const date = new Date().toISOString().split('T')[0];

  let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${date}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
`;

  slugs.forEach(slug => {
    sitemap += `  <url>
    <loc>${baseUrl}/${slug}</loc>
    <lastmod>${date}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
  });

  sitemap += `</urlset>`;

  fs.writeFileSync('public/sitemap.xml', sitemap);

  const robotsTxt = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${baseUrl}/sitemap.xml
`;

  fs.writeFileSync('public/robots.txt', robotsTxt);

  console.log('Sitemap and robots.txt generated successfully!');
} catch (error) {
  console.error('Warning: Failed to generate sitemap:', error);
}