import fs from 'fs';

function extractIds(filename) {
  const content = fs.readFileSync(filename, 'utf8');
  // Match `id: 'some-id'`, `"id": "some-id"`, etc.
  const matches = [...content.matchAll(/(?:\"id\"|\'id\'|id):\s*['"]([^'"]+)['"]/g)];
  return matches.map(m => m[1]);
}

const toolIds = extractIds('src/data/tools.ts');
const blogIds = extractIds('src/data/blog.ts');

const urls = [
  '/', '/all', '/image', '/pdf', '/seo', '/text', 
  '/developer', '/generator', '/social', '/calculator', '/blog'
];

// Deduplicate toolIds
const uniqueToolIds = [...new Set(toolIds)];
uniqueToolIds.forEach(id => urls.push('/' + id));

// Deduplicate blogIds
const uniqueBlogIds = [...new Set(blogIds)];
uniqueBlogIds.forEach(id => urls.push('/blog/' + id));

// Remove blog slugs that start with 'photo-' as they are likely not valid routes
// Wait, no, we just extract what's there.

const currentDate = new Date().toISOString().split('T')[0];

const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(url => {
    let priority = 0.8;
    let changefreq = 'weekly';
    if (url === '/') {
      priority = 1.0;
      changefreq = 'daily';
    } else if (url.startsWith('/blog/')) {
      priority = 0.6;
      changefreq = 'monthly';
    }
    return '  <url>\n' +
      '    <loc>https://loveyoutools.in' + url + '</loc>\n' +
      '    <lastmod>' + currentDate + '</lastmod>\n' +
      '    <changefreq>' + changefreq + '</changefreq>\n' +
      '    <priority>' + priority.toFixed(1) + '</priority>\n' +
      '  </url>';
  }).join('\n') + '\n</urlset>';

fs.writeFileSync('public/sitemap.xml', sitemap);
console.log('Sitemap generated with ' + urls.length + ' URLs. Tools: ' + uniqueToolIds.length + ', Blogs: ' + uniqueBlogIds.length);
