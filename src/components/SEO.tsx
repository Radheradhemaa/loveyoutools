import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  url: string;
  image?: string;
  type?: 'website' | 'article' | 'SoftwareApplication';
  schema?: any;
}

export default function SEO({ title, description, keywords, url, image = '/social-preview/og-image.png?v=2', type = 'website', schema }: SEOProps) {
  const siteName = 'LoveYouTools (Love You Tools)';
  const cleanTitle = title.replace(/\s*[-|]\s*LoveYouTools.*$/i, '').trim();
  const fullTitle = `${cleanTitle} – LoveYouTools (Love You Tools)`;

  // Ensure canonical URL always uses the .in domain
  const baseUrl = 'https://loveyoutools.in';
  let canonicalUrl = url;
  try {
    const urlObj = new URL(url);
    // Remove trailing slash for consistency
    const pathname = urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1 
      ? urlObj.pathname.slice(0, -1) 
      : urlObj.pathname;
    canonicalUrl = `${baseUrl}${pathname}${urlObj.search}`;
  } catch (e) {
    // Fallback for relative paths or invalid URLs
    const path = url.startsWith('/') ? url : `/${url}`;
    canonicalUrl = `${baseUrl}${path}`;
  }

  const finalKeywords = keywords 
    ? `LoveYouTools, love you tools, love you, loveyoutools in, love you online tools, ${keywords}`
    : 'LoveYouTools, love you tools, love you, loveyoutools in, love you online tools, free online tools, online utilities';

  const schemaArray = schema ? (Array.isArray(schema) ? schema : [schema]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      <meta name="description" content={description} />
      <meta name="keywords" content={finalKeywords} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />
      <meta property="og:site_name" content={siteName} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={canonicalUrl} />
      <meta property="twitter:title" content={fullTitle} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={image} />

      {/* Structured Data */}
      {schemaArray.map((s, idx) => (
        <script key={idx} type="application/ld+json">
          {JSON.stringify(s)}
        </script>
      ))}
    </Helmet>
  );
}
