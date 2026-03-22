export const categories = [
  { id: 'all', name: 'All' },
  { id: 'image', name: 'Image' },
  { id: 'pdf', name: 'PDF' },
  { id: 'seo', name: 'SEO' },
  { id: 'text', name: 'Text' },
  { id: 'developer', name: 'Developer' },
  { id: 'generator', name: 'Generator' },
  { id: 'social', name: 'Social' },
  { id: 'calculator', name: 'Calculator' }
];

export const tools = [
  // IMAGE TOOLS (bg: #fff0eb)
  { id: 'passport-photo-maker', c: 'image', n: 'Passport Photo Maker', d: 'Create professional passport photos with AI background removal and auto-print layouts.', i: '👤', b: '#fff0eb', popular: true },
  { id: 'image-compressor', c: 'image', n: 'Image Compressor', d: 'Compress images without losing quality.', i: '🗜️', b: '#fff0eb', popular: true },
  { id: 'photo-sign-resizer', c: 'image', n: 'Photo & Sign Resizer', d: 'Resize photo and signature to exact KB and pixels.', i: '🖼️', b: '#fff0eb', popular: true },
  { id: 'image-resizer', c: 'image', n: 'Image Resizer', d: 'Resize images to exact dimensions.', i: '↔️', b: '#fff0eb' },
  { id: 'image-cropper', c: 'image', n: 'Image Cropper', d: 'Crop images online easily.', i: '✂️', b: '#fff0eb' },
  { id: 'image-converter', c: 'image', n: 'Image Converter', d: 'Convert images between formats.', i: '🔄', b: '#fff0eb' },
  { id: 'image-rotator-flipper', c: 'image', n: 'Image Rotator & Flipper', d: 'Rotate and flip images.', i: '🔃', b: '#fff0eb' },
  { id: 'photo-filters', c: 'image', n: 'Photo Filters', d: 'Apply filters to your photos.', i: '🎨', b: '#fff0eb' },
  { id: 'watermark-adder', c: 'image', n: 'Watermark Adder', d: 'Add watermark to images.', i: '💧', b: '#fff0eb' },
  { id: 'image-metadata-viewer', c: 'image', n: 'Image Metadata Viewer', d: 'View EXIF data of images.', i: '🔍', b: '#fff0eb' },
  { id: 'image-color-picker', c: 'image', n: 'Image Color Picker', d: 'Pick colors from an image.', i: '🎯', b: '#fff0eb' },
  { id: 'gif-maker', c: 'image', n: 'GIF Maker', d: 'Create GIFs from images.', i: '🎬', b: '#fff0eb' },
  { id: 'svg-to-png', c: 'image', n: 'SVG to PNG Converter', d: 'Convert SVG files to PNG with custom resolution and background.', i: '🔄', b: '#fff0eb' },

  // PDF CONVERSION TOOLS (bg: #fef3c7)
  { id: 'pdf-to-jpg', c: 'pdf', n: 'PDF to JPG', d: 'Convert PDF pages to JPG images.', i: '🖼️', b: '#fef3c7' },
  { id: 'jpg-to-pdf', c: 'pdf', n: 'JPG to PDF', d: 'Convert JPG images to PDF.', i: '📄', b: '#fef3c7' },
  { id: 'pdf-to-png', c: 'pdf', n: 'PDF to PNG', d: 'Convert PDF pages to PNG images.', i: '🖼️', b: '#fef3c7' },
  { id: 'png-to-pdf', c: 'pdf', n: 'PNG to PDF', d: 'Convert PNG images to PDF.', i: '📄', b: '#fef3c7' },
  { id: 'pdf-to-text', c: 'pdf', n: 'PDF to Text', d: 'Extract text from PDF files.', i: '📝', b: '#fef3c7' },

  // PDF EDITING TOOLS (bg: #fef3c7)
  { id: 'crop-pdf', c: 'pdf', n: 'Crop PDF', d: 'Advanced PDF cropper with smart detection and batch processing.', i: '✂️', b: '#fef3c7' },
  { id: 'pdf-editor', c: 'pdf', n: 'Edit PDF', d: 'Advanced PDF editor with text editing and layout preservation.', i: '📝', b: '#fef3c7' },
  { id: 'add-text-to-pdf', c: 'pdf', n: 'Add Text to PDF', d: 'Add custom text to PDF pages.', i: '✍️', b: '#fef3c7' },
  { id: 'add-image-to-pdf', c: 'pdf', n: 'Add Image to PDF', d: 'Insert images into PDF pages.', i: '🖼️', b: '#fef3c7' },
  { id: 'add-page-numbers', c: 'pdf', n: 'Add Page Numbers', d: 'Add page numbers to PDF.', i: '🔢', b: '#fef3c7' },
  { id: 'add-watermark-to-pdf', c: 'pdf', n: 'Add Watermark to PDF', d: 'Add watermark to PDF pages.', i: '💧', b: '#fef3c7' },

  // PDF MANAGEMENT TOOLS (bg: #fef3c7)
  { id: 'merge-pdf', c: 'pdf', n: 'Merge PDF', d: 'Combine multiple PDFs into one.', i: '🔗', b: '#fef3c7', popular: true },
  { id: 'split-pdf', c: 'pdf', n: 'Split PDF', d: 'Extract pages from your PDF.', i: '✂️', b: '#fef3c7', popular: true },
  { id: 'extract-pages-from-pdf', c: 'pdf', n: 'Extract Pages from PDF', d: 'Extract specific pages.', i: '📑', b: '#fef3c7' },
  { id: 'delete-pdf-pages', c: 'pdf', n: 'Delete PDF Pages', d: 'Remove pages from PDF.', i: '🗑️', b: '#fef3c7' },
  { id: 'reorder-pdf-pages', c: 'pdf', n: 'Reorder PDF Pages', d: 'Change the order of pages.', i: '🔄', b: '#fef3c7' },
  { id: 'rotate-pdf-pages', c: 'pdf', n: 'Rotate PDF Pages', d: 'Rotate pages in PDF.', i: '🔃', b: '#fef3c7' },

  // PDF OPTIMIZATION & SECURITY TOOLS (bg: #fef3c7)
  { id: 'compress-pdf', c: 'pdf', n: 'Compress PDF', d: 'Reduce PDF file size.', i: '🗜️', b: '#fef3c7' },
  { id: 'pdf-password-protect', c: 'pdf', n: 'PDF Password Protect', d: 'Add password to PDF.', i: '🔒', b: '#fef3c7' },

  // PDF UTILITY & ADVANCED TOOLS (bg: #fef3c7)
  { id: 'pdf-page-counter', c: 'pdf', n: 'PDF Page Counter', d: 'Count pages in PDF files.', i: '📊', b: '#fef3c7' },
  { id: 'pdf-metadata-viewer', c: 'pdf', n: 'PDF Metadata Viewer', d: 'View PDF metadata.', i: '📋', b: '#fef3c7' },
  { id: 'remove-pdf-metadata', c: 'pdf', n: 'Remove PDF Metadata', d: 'Clear PDF metadata.', i: '🧹', b: '#fef3c7' },
  { id: 'flatten-pdf', c: 'pdf', n: 'Flatten PDF', d: 'Flatten PDF forms and layers.', i: '🥞', b: '#fef3c7' },
  { id: 'pdf-to-zip', c: 'pdf', n: 'PDF to ZIP', d: 'Extract PDF pages to ZIP.', i: '🗜️', b: '#fef3c7' },
  { id: 'pdf-reader-online', c: 'pdf', n: 'PDF Reader Online', d: 'Read PDF files online.', i: '👁️', b: '#fef3c7' },
  { id: 'kdp-margin-bleed-fixer', c: 'pdf', n: 'Amazon KDP Book Margin & Bleed Fixer', d: 'Fix margins, trim size, and bleed for Amazon KDP books.', i: '📚', b: '#fef3c7' },

  // SEO TOOLS (bg: #d1fae5)
  { id: 'keyword-research-tool', c: 'seo', n: 'Keyword Research Tool', d: 'Find high-volume, low-competition keywords for your content.', i: '🔍', b: '#d1fae5', popular: true },
  { id: 'backlink-checker', c: 'seo', n: 'Backlink Checker', d: 'Analyze backlinks for any domain or URL.', i: '🔗', b: '#d1fae5' },
  { id: 'domain-authority-checker', c: 'seo', n: 'Domain Authority Checker', d: 'Check DA, PA, and Spam Score of any website.', i: '📈', b: '#d1fae5' },
  { id: 'plagiarism-checker', c: 'seo', n: 'Plagiarism Checker', d: 'Check your content for plagiarism and uniqueness.', i: '📝', b: '#d1fae5', popular: true },
  { id: 'website-speed-test', c: 'seo', n: 'Website Speed Test', d: 'Analyze your website speed and performance metrics.', i: '⚡', b: '#d1fae5', popular: true },
  { id: 'meta-tag-generator', c: 'seo', n: 'Meta Tag Generator', d: 'Generate advanced HTML meta tags for SEO and Social Media.', i: '🏷️', b: '#d1fae5' },
  { id: 'robots-txt-generator', c: 'seo', n: 'Robots.txt Generator', d: 'Create robots.txt file with advanced configuration.', i: '🤖', b: '#d1fae5' },
  { id: 'keyword-density-checker', c: 'seo', n: 'Keyword Density Checker', d: 'Check keyword frequency and optimization.', i: '📊', b: '#d1fae5' },
  { id: 'url-slug-generator', c: 'seo', n: 'URL Slug Generator', d: 'Create SEO friendly URLs.', i: '🔗', b: '#d1fae5' },
  { id: 'open-graph-generator', c: 'seo', n: 'Open Graph Generator', d: 'Generate OG meta tags.', i: '📲', b: '#d1fae5' },
  { id: 'seo-title-generator', c: 'seo', n: 'SEO Title Generator', d: 'Generate catchy SEO titles.', i: '✍️', b: '#d1fae5' },
  { id: 'seo-description-generator', c: 'seo', n: 'SEO Description Generator', d: 'Generate meta descriptions.', i: '📋', b: '#d1fae5' },

  // TEXT TOOLS (bg: #ede9fe)
  { id: 'word-counter', c: 'text', n: 'Word Counter', d: 'Count words, characters, and more.', i: '📊', b: '#ede9fe', popular: true },
  { id: 'case-converter', c: 'text', n: 'Case Converter', d: 'Convert text case formats.', i: 'Aa', b: '#ede9fe', popular: true },
  { id: 'remove-duplicate-lines', c: 'text', n: 'Remove Duplicate Lines', d: 'Clean up duplicate text lines.', i: '🧹', b: '#ede9fe' },
  { id: 'text-sorter', c: 'text', n: 'Text Sorter', d: 'Sort text lines alphabetically.', i: '↕️', b: '#ede9fe' },
  { id: 'text-compare-diff', c: 'text', n: 'Text Compare (Diff)', d: 'Compare two text snippets.', i: '⚖️', b: '#ede9fe' },
  { id: 'whitespace-remover', c: 'text', n: 'Whitespace Remover', d: 'Remove extra spaces from text.', i: '🧽', b: '#ede9fe' },
  { id: 'lorem-ipsum-generator', c: 'text', n: 'Lorem Ipsum Generator', d: 'Generate placeholder text.', i: '📄', b: '#ede9fe' },
  { id: 'text-reverser', c: 'text', n: 'Text Reverser', d: 'Reverse text characters or words.', i: '🔄', b: '#ede9fe' },
  { id: 'text-encoder-decoder', c: 'text', n: 'Text Encoder/Decoder', d: 'Encode/decode text formats.', i: '🔐', b: '#ede9fe' },

  // DEVELOPER TOOLS (bg: #dbeafe)
  { id: 'dynamic-previewer', c: 'developer', n: 'Dynamic File Previewer', d: 'Preview images, PDFs, SVGs, and text files with dynamic resizing.', i: '👁️', b: '#dbeafe', popular: true },
  { id: 'json-formatter-validator', c: 'developer', n: 'JSON Formatter & Validator', d: 'Format and validate JSON.', i: '{ }', b: '#dbeafe', popular: true },
  { id: 'base64-encode-decode', c: 'developer', n: 'Base64 Encode/Decode', d: 'Encode/decode Base64 strings.', i: '🔐', b: '#dbeafe', popular: true },
  { id: 'url-encode-decode', c: 'developer', n: 'URL Encode/Decode', d: 'Encode/decode URLs.', i: '🔗', b: '#dbeafe' },
  { id: 'color-code-converter', c: 'developer', n: 'Color Code Converter', d: 'Convert HEX, RGB, HSL.', i: '🎨', b: '#dbeafe' },
  { id: 'uuid-generator', c: 'developer', n: 'UUID Generator', d: 'Generate random UUIDs.', i: '🆔', b: '#dbeafe' },
  { id: 'regex-tester', c: 'developer', n: 'Regex Tester', d: 'Test regular expressions.', i: '⚙️', b: '#dbeafe' },
  { id: 'html-css-js-minifier', c: 'developer', n: 'HTML/CSS/JS Minifier', d: 'Minify web code.', i: '⚡', b: '#dbeafe' },
  { id: 'html-live-preview', c: 'developer', n: 'HTML Live Preview', d: 'Preview HTML code live.', i: '🖥️', b: '#dbeafe' },
  { id: 'hash-generator', c: 'developer', n: 'Hash Generator', d: 'Generate MD5, SHA hashes.', i: '#', b: '#dbeafe' },

  // GENERATOR TOOLS (bg: #ecfdf5)
  { id: 'qr-code-generator', c: 'generator', n: 'QR Code Generator', d: 'Generate QR codes easily.', i: '⬛', b: '#ecfdf5' },
  { id: 'password-generator', c: 'generator', n: 'Password Generator', d: 'Generate secure passwords.', i: '🔑', b: '#ecfdf5' },
  { id: 'username-generator', c: 'generator', n: 'Username Generator', d: 'Generate cool usernames.', i: '👤', b: '#ecfdf5' },
  { id: 'random-number-generator', c: 'generator', n: 'Random Number Generator', d: 'Generate random numbers.', i: '🎲', b: '#ecfdf5' },
  { id: 'random-name-picker', c: 'generator', n: 'Random Name Picker', d: 'Pick a random name from list.', i: '🎯', b: '#ecfdf5' },
  { id: 'color-palette-generator', c: 'generator', n: 'Color Palette Generator', d: 'Generate color palettes.', i: '🌈', b: '#ecfdf5' },
  { id: 'fake-address-generator', c: 'generator', n: 'Fake Address Generator', d: 'Generate random addresses.', i: '📍', b: '#ecfdf5' },

  // SOCIAL MEDIA TOOLS (bg: #ffedd5)
  { id: 'youtube-tag-generator', c: 'social', n: 'YouTube Tag Generator', d: 'Generate high-ranking tags for your YouTube videos.', i: '▶️', b: '#ffedd5', popular: true },
  { id: 'youtube-thumbnail-downloader', c: 'social', n: 'YouTube Thumbnail Downloader', d: 'Download high-quality thumbnails from any YouTube video.', i: '🖼️', b: '#ffedd5', popular: true },
  { id: 'instagram-dp-downloader', c: 'social', n: 'Instagram DP Downloader', d: 'View and download Instagram profile pictures in full size.', i: '📸', b: '#ffedd5' },
  { id: 'reel-video-downloader', c: 'social', n: 'Reel/Video Downloader', d: 'Download Instagram Reels, Videos, and YouTube Shorts.', i: '📥', b: '#ffedd5', popular: true },
  { id: 'hashtag-generator', c: 'social', n: 'Hashtag Generator', d: 'Generate trending and relevant hashtags with AI.', i: '#️⃣', b: '#ffedd5', popular: true },
  { id: 'caption-generator', c: 'social', n: 'Caption Generator', d: 'Generate engaging social media captions with AI.', i: '✍️', b: '#ffedd5', popular: true },
  { id: 'tweet-length-checker', c: 'social', n: 'Tweet Length Checker', d: 'Check tweet character limit and optimize for engagement.', i: '🐦', b: '#ffedd5' },
  { id: 'social-media-bio-generator', c: 'social', n: 'Social Media Bio Generator', d: 'Generate professional and creative social media bios.', i: '📜', b: '#ffedd5' },
  { id: 'emoji-picker', c: 'social', n: 'Emoji Picker', d: 'Find and copy emojis for your posts.', i: '😊', b: '#ffedd5' },

  // CALCULATOR TOOLS (bg: #fef9c3)
  { id: 'age-calculator', c: 'calculator', n: 'Age Calculator', d: 'Calculate exact age.', i: '🎂', b: '#fef9c3', popular: true },
  { id: 'percentage-calculator', c: 'calculator', n: 'Percentage Calculator', d: 'Calculate percentages.', i: '%', b: '#fef9c3', popular: true },
  { id: 'loan-emi-calculator', c: 'calculator', n: 'Loan EMI Calculator', d: 'Calculate loan EMI.', i: '🏦', b: '#fef9c3' },
  { id: 'gst-calculator', c: 'calculator', n: 'GST Calculator', d: 'Calculate GST amounts.', i: '🧾', b: '#fef9c3' },
  { id: 'discount-calculator', c: 'calculator', n: 'Discount Calculator', d: 'Calculate discounts.', i: '🏷️', b: '#fef9c3' },
  { id: 'bmi-calculator', c: 'calculator', n: 'BMI Calculator', d: 'Calculate Body Mass Index.', i: '⚖️', b: '#fef9c3' },
  { id: 'date-difference-calculator', c: 'calculator', n: 'Date Difference Calculator', d: 'Calculate days between dates.', i: '📅', b: '#fef9c3' },
  { id: 'compound-interest-calculator', c: 'calculator', n: 'Compound Interest Calculator', d: 'Calculate compound interest.', i: '📈', b: '#fef9c3' },
  { id: 'tip-calculator', c: 'calculator', n: 'Tip Calculator', d: 'Calculate tips and splits.', i: '💰', b: '#fef9c3' },
];
