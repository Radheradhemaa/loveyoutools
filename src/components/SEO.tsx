import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  url: string;
  image?: string;
  type?: 'website' | 'article' | 'SoftwareApplication';
  schema?: unknown;
  noindex?: boolean;
}

const BASE_URL = 'https://loveyoutools.in';

function toCleanCanonicalUrl(inputUrl: string): string {
  try {
    const parsed = inputUrl.startsWith('http')
      ? new URL(inputUrl)
      : new URL(inputUrl.startsWith('/') ? inputUrl : `/${inputUrl}`, BASE_URL);
    const pathname = parsed.pathname.length > 1 && parsed.pathname.endsWith('/')
      ? parsed.pathname.slice(0, -1)
      : parsed.pathname || '/';
    return `${BASE_URL}${pathname}`;
  } catch {
    const cleanPath = inputUrl.split('?')[0].split('#')[0];
    const normalized = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    return `${BASE_URL}${normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized}`;
  }
}

function toAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  return `${BASE_URL}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export default function SEO({
  title,
  description,
  keywords,
  url,
  image = '/social-preview/og-image.png?v=2',
  type = 'website',
  schema,
  noindex = false,
}: SEOProps) {
  const siteName = 'LoveYouTools (Love You Tools)';
  const trimmedTitle = title.trim();
  const fullTitle = /loveyoutools/i.test(trimmedTitle)
    ? trimmedTitle
    : `${trimmedTitle.replace(/\s*[-–|]\s*LoveTools.*$/i, '').trim()} – LoveYouTools`;

  const canonicalUrl = toCleanCanonicalUrl(url);
  const absoluteImage = toAbsoluteUrl(image);

  const finalKeywords = keywords
    ? `LoveYouTools, love you tools, loveyoutools in, ${keywords}`
    : 'LoveYouTools, love you tools, loveyoutools in, free online tools, online utilities';

  const schemaArray = schema ? (Array.isArray(schema) ? schema : [schema]) : [];
  const robotsContent = noindex
    ? 'noindex, follow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="robots" content={robotsContent} />
      <meta name="description" content={description} />
      <meta name="keywords" content={finalKeywords} />
      {!noindex && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={absoluteImage} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={canonicalUrl} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={absoluteImage} />

      {/* Structured Data */}
      {schemaArray.map((s, idx) => (
        <script key={idx} type="application/ld+json">
          {JSON.stringify(s)}
        </script>
      ))}
    </Helmet>
  );
}
