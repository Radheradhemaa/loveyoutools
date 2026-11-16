import fs from 'fs';
import { loadSiteData } from './seo-data-loader.js';

const BASE_URL = 'https://loveyoutools.in';
const { categories, tools, blogPosts } = loadSiteData();

const urlSet = new Set([
  '/',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/disclaimer',
  '/blog',
]);

for (const cat of categories) {
  if (cat?.id) {
    urlSet.add(`/${cat.id}`);
  }
}

for (const tool of tools) {
  if (tool?.id) {
    urlSet.add(`/${tool.id}`);
  }
}

for (const post of blogPosts) {
  if (post?.id) {
    urlSet.add(`/blog/${post.id}`);
  }
}

const urls = [...urlSet];
const currentDate = new Date().toISOString().split('T')[0];

const categoryIds = new Set(categories.map((c) => c.id));

const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map((url) => {
      let priority = 0.8;
      let changefreq = 'weekly';

      if (url === '/') {
        priority = 1.0;
        changefreq = 'daily';
      } else if (url === '/blog' || categoryIds.has(url.slice(1))) {
        priority = 0.9;
        changefreq = 'weekly';
      } else if (url.startsWith('/blog/')) {
        priority = 0.6;
        changefreq = 'monthly';
      } else if (['/about', '/contact', '/privacy', '/terms', '/disclaimer'].includes(url)) {
        priority = 0.5;
        changefreq = 'monthly';
      }

      return (
        '  <url>\n' +
        `    <loc>${BASE_URL}${url}</loc>\n` +
        `    <lastmod>${currentDate}</lastmod>\n` +
        `    <changefreq>${changefreq}</changefreq>\n` +
        `    <priority>${priority.toFixed(1)}</priority>\n` +
        '  </url>'
      );
    })
    .join('\n') +
  '\n</urlset>\n';

fs.writeFileSync('public/sitemap.xml', sitemap, 'utf8');
console.log(
  `Sitemap generated with ${urls.length} unique URLs. Categories: ${categories.length}, Tools: ${tools.length}, Blogs: ${blogPosts.length}`
);
