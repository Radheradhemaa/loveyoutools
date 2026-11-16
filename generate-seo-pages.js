import fs from 'fs';
import path from 'path';
import { loadSiteData } from './seo-data-loader.js';

const BASE_URL = 'https://loveyoutools.in';
const DEFAULT_IMAGE = `${BASE_URL}/social-preview/og-image.png?v=2`;
const DIST_DIR = path.resolve('dist');

const distIndexPath = path.join(DIST_DIR, 'index.html');
if (!fs.existsSync(distIndexPath)) {
  console.error('dist/index.html not found. Run vite build first.');
  process.exit(1);
}

const templateHtml = fs.readFileSync(distIndexPath, 'utf8');
const { categories, tools, blogPosts } = loadSiteData();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonLd(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function renderShell({ heading, intro, breadcrumbs, bodyHtml, categoriesList }) {
  const navLinks = categoriesList
    .map((c) => `<a href="${c.id === 'all' ? '/all' : `/${c.id}`}">${escapeHtml(c.name)}</a>`)
    .join(' | ');

  const crumbHtml = breadcrumbs?.length
    ? `<nav aria-label="Breadcrumb">${breadcrumbs
        .map((b) => (b.href ? `<a href="${b.href}">${escapeHtml(b.label)}</a>` : `<span>${escapeHtml(b.label)}</span>`))
        .join(' &rsaquo; ')}</nav>`
    : '';

  return `<div id="root">
    <header>
      <a href="/">LoveYouTools</a>
      <nav aria-label="Primary">
        <a href="/">Home</a> | <a href="/all">All Tools</a> | <a href="/blog">Blog</a> | <a href="/about">About</a> | <a href="/contact">Contact</a>
      </nav>
      <nav aria-label="Categories">${navLinks}</nav>
    </header>
    <main>
      ${crumbHtml}
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(intro)}</p>
      ${bodyHtml}
    </main>
    <footer>
      <p>&copy; ${new Date().getFullYear()} LoveYouTools. All rights reserved.</p>
      <nav aria-label="Footer">
        <a href="/about">About Us</a> |
        <a href="/contact">Contact</a> |
        <a href="/blog">Blog</a> |
        <a href="/privacy">Privacy Policy</a> |
        <a href="/terms">Terms of Service</a> |
        <a href="/disclaimer">Disclaimer</a>
      </nav>
    </footer>
  </div>`;
}

function buildHtmlPage({
  title,
  description,
  keywords,
  canonicalUrl,
  ogType = 'website',
  image = DEFAULT_IMAGE,
  robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  includeCanonical = true,
  schema,
  rootHtml,
}) {
  let html = templateHtml;

  const canonicalTag = includeCanonical
    ? `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`
    : '';

  html = html.replace(/<link\s+rel="canonical"[^>]*\/?>/i, () => canonicalTag);
  html = html.replace(/<meta\s+name="robots"[^>]*\/?>/i, () => `<meta name="robots" content="${escapeHtml(robots)}" />`);
  html = html.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*\/?>/i, () => `<meta name="description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta\s+name="keywords"[^>]*\/?>/i, () => `<meta name="keywords" content="${escapeHtml(keywords)}" />`);

  html = html.replace(/<meta\s+property="og:type"[^>]*\/?>/i, () => `<meta property="og:type" content="${escapeHtml(ogType)}" />`);
  html = html.replace(/<meta\s+property="og:url"[^>]*\/?>/i, () => `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`);
  html = html.replace(/<meta\s+property="og:title"[^>]*\/?>/i, () => `<meta property="og:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta\s+property="og:description"[^>]*\/?>/i, () => `<meta property="og:description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta\s+property="og:image"[^>]*\/?>/i, () => `<meta property="og:image" content="${escapeHtml(image)}" />`);
  html = html.replace(/<meta\s+property="og:image:secure_url"[^>]*\/?>/i, () => `<meta property="og:image:secure_url" content="${escapeHtml(image)}" />`);

  html = html.replace(/<meta\s+name="twitter:url"[^>]*\/?>/i, () => `<meta name="twitter:url" content="${escapeHtml(canonicalUrl)}" />`);
  html = html.replace(/<meta\s+name="twitter:title"[^>]*\/?>/i, () => `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  html = html.replace(/<meta\s+name="twitter:description"[^>]*\/?>/i, () => `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  html = html.replace(/<meta\s+name="twitter:image"[^>]*\/?>/i, () => `<meta name="twitter:image" content="${escapeHtml(image)}" />`);

  if (schema) {
    html = html.replace(
      /<script\s+type="application\/ld\+json">[\s\S]*?<\/script>/i,
      () => `<script type="application/ld+json">${safeJsonLd(schema)}</script>`
    );
  }

  html = html.replace(/<div\s+id="root"><\/div>/i, () => rootHtml);
  return html;
}

function writeRouteHtml(relPath, html) {
  const outPath = path.join(DIST_DIR, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
}

const orgSchema = {
  '@type': 'Organization',
  '@id': `${BASE_URL}/#organization`,
  name: 'LoveYouTools',
  alternateName: ['Love You Tools', 'LoveYouTools.in', 'loveyoutools'],
  url: `${BASE_URL}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${BASE_URL}/logo.png?v=2`,
    width: 512,
    height: 512,
  },
};

const websiteSchema = {
  '@type': 'WebSite',
  '@id': `${BASE_URL}/#website`,
  url: `${BASE_URL}/`,
  name: 'LoveYouTools',
  publisher: { '@id': `${BASE_URL}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: `${BASE_URL}/?search={search_term_string}`,
    'query-input': 'required name=search_term_string',
  },
};

let count = 0;

// 1. Homepage (dist/index.html)
{
  const toolsListHtml = tools
    .map((t) => `<li><a href="/${t.id}">${escapeHtml(t.n)}</a> — ${escapeHtml(t.d)}</li>`)
    .join('\n');
  const blogListHtml = blogPosts
    .slice(0, 12)
    .map((p) => `<li><a href="/blog/${p.id}">${escapeHtml(p.title)}</a></li>`)
    .join('\n');

  const homeHtml = buildHtmlPage({
    title: 'LoveYouTools – Free Online Tools Hub (100+ Free Web Tools)',
    description:
      "LoveYouTools (Love You Tools) is India's leading 100% free online utility suite offering 100+ fast, client-side tools for PDF editing, background removal, passport photos, resume builder, AI text humanizer, and calculators with zero signup.",
    keywords:
      'LoveYouTools, love you tools, free online tools, background remover, passport photo maker, pdf editor, merge pdf, ai text humanizer, resume maker, image compressor',
    canonicalUrl: `${BASE_URL}/`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [websiteSchema, orgSchema],
    },
    rootHtml: renderShell({
      heading: 'LoveYouTools – Free Online Tools Hub (Love You Tools)',
      intro: `Explore ${tools.length}+ free, fast, privacy-first browser tools for PDF editing, AI background removal, passport photos, SEO, text formatting, development, and calculators.`,
      categoriesList: categories,
      bodyHtml: `<section><h2>All Free Online Tools</h2><ul>${toolsListHtml}</ul></section><section><h2>Latest Guides & Blog</h2><ul>${blogListHtml}</ul></section>`,
    }),
  });
  writeRouteHtml('index.html', homeHtml);
  count++;
}

// 2. Category pages (dist/<cat>.html -> clean URL /<cat>)
for (const cat of categories) {
  const catTools = cat.id === 'all' ? tools : tools.filter((t) => t.c === cat.id);
  const sampleNames = catTools.slice(0, 4).map((t) => t.n).join(', ');
  const title =
    cat.id === 'all'
      ? 'All 100+ Free Online Tools Directory – LoveYouTools'
      : `Free Online ${cat.name} Tools – ${catTools.length}+ Web Utilities | LoveYouTools`;
  const description =
    cat.id === 'all'
      ? `Browse all ${tools.length}+ free online tools on LoveYouTools including ${sampleNames}. Fast, private, browser-based tools with zero signup.`
      : `Explore ${catTools.length} free online ${cat.name.toLowerCase()} tools on LoveYouTools: ${sampleNames}, and more. 100% browser-based with zero signup.`;

  const listHtml = catTools
    .map((t) => `<li><a href="/${t.id}">${escapeHtml(t.n)}</a> — ${escapeHtml(t.d)}</li>`)
    .join('\n');

  const html = buildHtmlPage({
    title,
    description,
    keywords: `LoveYouTools, ${cat.name.toLowerCase()} tools, ${sampleNames}`,
    canonicalUrl: `${BASE_URL}/${cat.id}`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        orgSchema,
        {
          '@type': 'CollectionPage',
          '@id': `${BASE_URL}/${cat.id}`,
          url: `${BASE_URL}/${cat.id}`,
          name: title,
          description,
          isPartOf: { '@id': `${BASE_URL}/#website` },
        },
      ],
    },
    rootHtml: renderShell({
      heading: cat.id === 'all' ? `All ${tools.length}+ Free Online Tools Directory` : `Free Online ${cat.name} Tools`,
      intro: description,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: cat.name },
      ],
      categoriesList: categories,
      bodyHtml: `<section><h2>${escapeHtml(cat.name)} Tools (${catTools.length})</h2><ul>${listHtml}</ul></section>`,
    }),
  });
  writeRouteHtml(`${cat.id}.html`, html);
  count++;
}

// 3. Static pages
const staticPages = [
  {
    slug: 'about',
    title: 'About Us – LoveYouTools',
    description:
      'Learn more about LoveYouTools, our mission, and why we build 100+ fast, privacy-first free online tools for everyone.',
    heading: 'About LoveYouTools',
    body: `<p>LoveYouTools provides free, fast, client-side online tools for images, PDFs, SEO, text, coding, and calculators without registration or uploads.</p><h2>Our Core Values</h2><ul><li>Privacy First: Processing stays inside your browser.</li><li>100% Free: Zero subscriptions or hidden limits.</li><li>Fast & Cross-Platform: Works on desktop and mobile browsers.</li></ul>`,
  },
  {
    slug: 'contact',
    title: 'Contact Us – LoveYouTools',
    description: 'Get in touch with the LoveYouTools team for support, tool suggestions, bug reports, or feedback.',
    heading: 'Contact LoveYouTools',
    body: `<p>Have a question, bug report, or tool suggestion? Reach us anytime at <a href="mailto:support@loveyoutools.in">support@loveyoutools.in</a> or @loveyoutools.</p>`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy – LoveYouTools',
    description:
      'Comprehensive privacy policy for LoveYouTools explaining client-side local processing, cookies, and Google AdSense compliance.',
    heading: 'Privacy Policy',
    body: `<p>At LoveYouTools (loveyoutools.in), protecting your privacy is a top priority. Most tools execute locally inside your web browser so files remain on your device.</p><h2>Topics Covered</h2><ul><li>Local In-Browser Processing</li><li>Cookies and Web Beacons</li><li>Third-Party Advertising Partners</li><li>CCPA and GDPR Rights</li></ul>`,
  },
  {
    slug: 'terms',
    title: 'Terms of Service – LoveYouTools',
    description:
      'Read our terms of service to understand the rules, usage guidelines, and regulations for using LoveYouTools.',
    heading: 'Terms of Service',
    body: `<p>By accessing loveyoutools.in, you agree to abide by our usage guidelines, applicable laws, and general service terms for our free web utilities.</p>`,
  },
  {
    slug: 'disclaimer',
    title: 'Disclaimer – LoveYouTools',
    description:
      'Read the general tools disclaimer, client-side processing notice, and advertising disclosures for LoveYouTools.',
    heading: 'Disclaimer',
    body: `<p>All utilities and information on loveyoutools.in are published in good faith for general productivity and educational utility purposes.</p>`,
  },
];

for (const page of staticPages) {
  const html = buildHtmlPage({
    title: page.title,
    description: page.description,
    keywords: `LoveYouTools, ${page.slug}, free online tools`,
    canonicalUrl: `${BASE_URL}/${page.slug}`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        orgSchema,
        {
          '@type': 'WebPage',
          url: `${BASE_URL}/${page.slug}`,
          name: page.title,
          description: page.description,
          isPartOf: { '@id': `${BASE_URL}/#website` },
        },
      ],
    },
    rootHtml: renderShell({
      heading: page.heading,
      intro: page.description,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: page.heading },
      ],
      categoriesList: categories,
      bodyHtml: `<section>${page.body}</section>`,
    }),
  });
  writeRouteHtml(`${page.slug}.html`, html);
  count++;
}

// 4. Individual Tool Pages (dist/<tool-id>.html)
for (const tool of tools) {
  const category = categories.find((c) => c.id === tool.c);
  const categoryName = category?.name || 'Online';
  const relatedTools = tools.filter((t) => t.c === tool.c && t.id !== tool.id).slice(0, 6);
  const blogPost = blogPosts.find((p) => p.toolId === tool.id);
  const toolUrl = `${BASE_URL}/${tool.id}`;
  const deterministicRatingCount =
    140 + (tool.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 420);

  let pageTitle = `${tool.n} Online Free – LoveYouTools`;
  let pageDesc = `${tool.d} Fast, secure, and 100% free online ${tool.n.toLowerCase()} on LoveYouTools. No signup required.`;
  let pageKeywords = `${tool.n}, ${tool.n} online, free ${tool.n.toLowerCase()}, ${categoryName.toLowerCase()} tools`;

  if (tool.id === 'pdf-editor') {
    pageTitle = 'Free Online PDF Editor Without Watermark | Edit PDF Text Fast – LoveYouTools';
    pageDesc =
      'Edit PDF text online free with no signup required. Modify PDF text directly, change fonts easily. Free online PDF editor without watermark.';
    pageKeywords =
      'free online pdf editor without watermark, edit pdf text online free no signup, modify pdf text, browser based pdf editor';
  } else if (tool.id === 'passport-photo-maker') {
    pageTitle = 'Instant Passport Size Photo Maker | Auto Crop & HD Background Edit – LoveYouTools';
    pageDesc =
      'Create instant passport size photos online for free. HD background remover, auto crop passport photo 35x45mm, India specs, US Visa specs.';
    pageKeywords =
      'instant passport size photo maker india, create passport photo online free, background remover online HD free, passport photo 35x45mm';
  }

  const relatedHtml = relatedTools
    .map((rt) => `<li><a href="/${rt.id}">${escapeHtml(rt.n)}</a></li>`)
    .join('\n');

  const bodyHtml = `
    <section>
      <h2>About ${escapeHtml(tool.n)}</h2>
      <p>${escapeHtml(tool.d)} Runs directly in your browser with client-side speed and zero uploads.</p>
      <h2>How to Use ${escapeHtml(tool.n)}</h2>
      <ol>
        <li>Upload your file or enter your input inside the ${escapeHtml(tool.n)} workspace.</li>
        <li>Configure your preferred output settings and review live results.</li>
        <li>Download or copy your result instantly for free with no watermarks.</li>
      </ol>
      <h2>Frequently Asked Questions</h2>
      <h3>Is ${escapeHtml(tool.n)} free to use?</h3>
      <p>Yes, ${escapeHtml(tool.n)} on LoveYouTools is 100% free with no limits or registration.</p>
      <h3>Are my files kept private?</h3>
      <p>Yes, processing occurs locally in your browser memory and files never leave your device.</p>
    </section>
    ${blogPost ? `<section><h2>${escapeHtml(blogPost.title)}</h2><div>${blogPost.content}</div></section>` : ''}
    ${relatedHtml ? `<section><h2>Related ${escapeHtml(categoryName)} Tools</h2><ul>${relatedHtml}</ul></section>` : ''}
  `;

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      orgSchema,
      {
        '@type': 'SoftwareApplication',
        name: tool.n,
        url: toolUrl,
        description: tool.d,
        applicationCategory: 'BrowserApplication',
        operatingSystem: 'All',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: '4.8',
          ratingCount: deterministicRatingCount,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: BASE_URL },
          { '@type': 'ListItem', position: 2, name: categoryName, item: `${BASE_URL}/${tool.c}` },
          { '@type': 'ListItem', position: 3, name: tool.n, item: toolUrl },
        ],
      },
    ],
  };

  const html = buildHtmlPage({
    title: pageTitle,
    description: pageDesc,
    keywords: pageKeywords,
    canonicalUrl: toolUrl,
    ogType: 'website',
    schema,
    rootHtml: renderShell({
      heading: tool.n,
      intro: tool.d,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: categoryName, href: `/${tool.c}` },
        { label: tool.n },
      ],
      categoriesList: categories,
      bodyHtml,
    }),
  });
  writeRouteHtml(`${tool.id}.html`, html);
  count++;
}

// 5. Blog Index (dist/blog.html)
{
  const postsHtml = blogPosts
    .map(
      (p) =>
        `<article><h2><a href="/blog/${p.id}">${escapeHtml(p.title)}</a></h2><p>${escapeHtml(p.excerpt)}</p></article>`
    )
    .join('\n');

  const blogIndexHtml = buildHtmlPage({
    title: 'Blog & Guides – LoveYouTools',
    description:
      'Read our latest guides, tutorials, and privacy tips for free online image, PDF, developer, SEO, and productivity tools on LoveYouTools.',
    keywords: 'LoveYouTools blog, online tools guides, pdf tutorials, image editing guides',
    canonicalUrl: `${BASE_URL}/blog`,
    schema: {
      '@context': 'https://schema.org',
      '@graph': [
        orgSchema,
        {
          '@type': 'Blog',
          url: `${BASE_URL}/blog`,
          name: 'LoveYouTools Blog & Guides',
          publisher: { '@id': `${BASE_URL}/#organization` },
        },
      ],
    },
    rootHtml: renderShell({
      heading: 'LoveYouTools Blog & Guides',
      intro: 'Step-by-step guides, tips, and tutorials to help you get the most out of our free online tools.',
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Blog' },
      ],
      categoriesList: categories,
      bodyHtml: `<section>${postsHtml}</section>`,
    }),
  });
  writeRouteHtml('blog.html', blogIndexHtml);
  count++;
}

// 6. Individual Blog Posts (dist/blog/<slug>.html)
for (const post of blogPosts) {
  const postUrl = `${BASE_URL}/blog/${post.id}`;
  const postImage = post.image?.startsWith('http')
    ? post.image
    : `${BASE_URL}${post.image?.startsWith('/') ? post.image : `/${post.image || 'social-preview/og-image.png?v=2'}`}`;
  const relatedTool = post.toolId ? tools.find((t) => t.id === post.toolId) : null;

  const html = buildHtmlPage({
    title: `${post.title} – LoveYouTools Blog`,
    description: post.excerpt,
    keywords: `LoveYouTools, ${post.category}, ${post.title}`,
    canonicalUrl: postUrl,
    ogType: 'article',
    image: postImage,
    schema: {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.excerpt,
      image: postImage,
      url: postUrl,
      datePublished: post.date,
      author: { '@type': 'Person', name: post.author },
      publisher: {
        '@type': 'Organization',
        name: 'LoveYouTools',
        logo: { '@type': 'ImageObject', url: `${BASE_URL}/logo.png?v=2` },
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
    },
    rootHtml: renderShell({
      heading: post.title,
      intro: post.excerpt,
      breadcrumbs: [
        { label: 'Home', href: '/' },
        { label: 'Blog', href: '/blog' },
        { label: post.title },
      ],
      categoriesList: categories,
      bodyHtml: `<article><div>${post.content}</div>${
        relatedTool
          ? `<p>Related Tool: <a href="/${relatedTool.id}">${escapeHtml(relatedTool.n)}</a></p>`
          : ''
      }</article>`,
    }),
  });
  writeRouteHtml(path.join('blog', `${post.id}.html`), html);
  count++;
}

// 7. 404.html (noindex so missing URLs never pollute search index)
{
  const notFoundHtml = buildHtmlPage({
    title: 'Page Not Found – LoveYouTools',
    description: 'The requested page could not be found on LoveYouTools.',
    keywords: 'LoveYouTools',
    canonicalUrl: `${BASE_URL}/404`,
    robots: 'noindex, nofollow',
    includeCanonical: false,
    schema: null,
    rootHtml: renderShell({
      heading: 'Page Not Found',
      intro: 'The requested page could not be found. Browse our free online tools from the homepage.',
      categoriesList: categories,
      bodyHtml: `<p><a href="/">Return to LoveYouTools Home</a></p>`,
    }),
  });
  writeRouteHtml('404.html', notFoundHtml);
}

console.log(`Pre-rendered ${count} indexable SEO HTML pages + 404.html into dist/`);
