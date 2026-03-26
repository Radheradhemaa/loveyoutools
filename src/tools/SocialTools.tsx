import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, Youtube, Instagram, Download, Image as ImageIcon, Type, MessageSquare, Sparkles, Send, AlertCircle, Hash, Shuffle } from 'lucide-react';

const HASHTAG_DATA = {
  travel: ['#travel', '#travelgram', '#instatravel', '#wanderlust', '#travelphotography', '#vacation', '#traveling', '#adventure', '#explore', '#trip', '#holiday', '#landscape', '#nature', '#tourist', '#travelblogger', '#traveler', '#photooftheday', '#beautiful', '#sunset', '#beach', '#mountains', '#city', '#exploretheworld', '#traveladdict', '#globetrotter', '#traveldiaries', '#passportready', '#worldtraveler', '#travelgoals', '#seetheworld'],
  fitness: ['#fitness', '#gym', '#workout', '#fit', '#fitnessmotivation', '#motivation', '#bodybuilding', '#training', '#health', '#fitfam', '#lifestyle', '#sport', '#crossfit', '#healthy', '#muscle', '#healthylifestyle', '#exercise', '#gymlife', '#weightloss', '#fitnessmodel', '#personaltrainer', '#yoga', '#wellness', '#fitspo', '#instafit', '#strong', '#cardio', '#nutrition', '#gains', '#fitnessjourney'],
  love: ['#love', '#instagood', '#beautiful', '#happy', '#cute', '#like4like', '#followme', '#picoftheday', '#me', '#selfie', '#summer', '#art', '#instadaily', '#friends', '#repost', '#nature', '#girl', '#fun', '#style', '#smile', '#food', '#instalike', '#likeforlike', '#family', '#travel', '#fitness', '#igers', '#tagsforlikes', '#follow4follow', '#nofilter'],
};

const CAPTIONS = {
  Love: [
    "You're my favorite place to go to when my mind searches for peace.",
    "Every time I see you, I fall in love all over again.",
    "Together is a wonderful place to be.",
    "You are my today and all of my tomorrows.",
    "I look at you and see the rest of my life in front of my eyes.",
    "My favorite fairytale is our love story.",
    "You stole my heart, but I'll let you keep it.",
    "I love you more than pizza. And that's saying a lot.",
    "Some people are worth melting for.",
    "You're the peanut butter to my jelly."
  ],
  Attitude: [
    "I'm not bossy, I just have better ideas.",
    "I don't need your approval to be me.",
    "My attitude is based on how you treat me.",
    "I'm a vibe that no one else can replace.",
    "Take me as I am, or watch me as I go.",
    "I'm not arguing, I'm just explaining why I'm right.",
    "Confidence level: Selfie with no filter.",
    "I do a thing called what I want.",
    "Catch flights, not feelings.",
    "I'm too busy working on my own grass to notice if yours is greener."
  ],
  Travel: [
    "Wanderlust and city dust.",
    "Catching flights, not feelings.",
    "Adventure is out there.",
    "I haven't been everywhere, but it's on my list.",
    "Travel is the only thing you buy that makes you richer.",
    "Work, Travel, Save, Repeat.",
    "Life is short and the world is wide.",
    "Let's wander where the wifi is weak.",
    "Always take the scenic route.",
    "Vacation calories don't count."
  ],
  Fitness: [
    "Sore today, strong tomorrow.",
    "Sweat is magic. Cover yourself in it daily to grant your wishes.",
    "Train like a beast, look like a beauty.",
    "The only bad workout is the one that didn't happen.",
    "Hustle for that muscle.",
    "Excuses don't burn calories.",
    "Stronger than yesterday.",
    "Eat clean, train dirty.",
    "Push yourself, because no one else is going to do it for you.",
    "It never gets easier, you just get stronger."
  ],
  Funny: [
    "I need a six-month holiday, twice a year.",
    "I'm not lazy, I'm on energy-saving mode.",
    "I put the 'Pro' in procrastinate.",
    "My bed is a magical place I suddenly remember everything I had to do.",
    "I followed my heart, and it led me to the fridge.",
    "I'm on a seafood diet. I see food and I eat it.",
    "Reality called, so I hung up.",
    "I don't sweat, I sparkle.",
    "I'm not short, I'm concentrated awesome.",
    "If there would be an award for being lazy, I would send someone to pick it up for me."
  ]
};

export default function SocialTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  
  // YouTube specific
  const [ytThumbnails, setYtThumbnails] = useState<{res: string, url: string, label: string}[]>([]);
  
  // Instagram specific
  const [igImage, setIgImage] = useState('');

  // Caption specific
  const [captionCategory, setCaptionCategory] = useState<keyof typeof CAPTIONS>('Love');
  const [captionsList, setCaptionsList] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    setInput('');
    setOutput('');
    setError('');
    setYtThumbnails([]);
    setIgImage('');
    setCaptionsList([]);
    if (toolId === 'caption-generator') {
      setCaptionsList(CAPTIONS['Love']);
    }
  }, [toolId]);

  const handleCopy = (text: string, index: number | null = null) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (index !== null) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const generateHashtags = (keyword: string) => {
    const base = `#${keyword.replace(/[^a-zA-Z0-9]/g, '')}`;
    const generic = ['#trending', '#viral', '#explorepage', '#fyp', '#explore', '#instagood', '#like', '#follow', '#photography', '#lifestyle', '#design', '#inspiration', '#art', '#beautiful', '#happy', '#life', '#style', '#smile', '#nature', '#photooftheday', '#picoftheday', '#instagram', '#bhfyp', '#instadaily', '#me', '#cute', '#myself', '#fashion', '#model', '#beauty'];
    
    const category = Object.keys(HASHTAG_DATA).find(k => keyword.toLowerCase().includes(k));
    let selected = category ? HASHTAG_DATA[category as keyof typeof HASHTAG_DATA] : generic;
    
    const shuffled = [...selected].sort(() => 0.5 - Math.random());
    const finalTags = [base, ...shuffled.slice(0, 24)];
    return finalTags.join(' ');
  };

  const generate = async () => {
    setLoading(true);
    setError('');
    setOutput('');
    setYtThumbnails([]);
    setIgImage('');

    try {
      await new Promise(resolve => setTimeout(resolve, 800)); // Small delay for UX
      
      switch (toolId) {
        case 'youtube-thumbnail-downloader':
          const videoId = getYoutubeId(input);
          if (videoId) {
            setYtThumbnails([
              { res: 'maxresdefault', url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`, label: 'HD (1080p)' },
              { res: 'hqdefault', url: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, label: 'HQ (720p)' },
              { res: 'mqdefault', url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`, label: 'MQ (480p)' }
            ]);
          } else {
            setError('Invalid YouTube URL. Please provide a valid video link.');
          }
          break;

        case 'instagram-image-downloader':
          if (!input) {
            setError('Please enter an Instagram image URL.');
            break;
          }
          if (input.includes('cdninstagram') || input.includes('fbcdn')) {
            setIgImage(input);
          } else {
            setError('Invalid URL. Please provide a direct image URL containing "cdninstagram" or "fbcdn". Post links are not supported.');
          }
          break;

        case 'hashtag-generator':
          if (!input) {
            setError('Please enter a topic or keyword.');
            break;
          }
          setOutput(generateHashtags(input));
          break;

        case 'caption-generator':
          // Handled via category selection, but we can shuffle
          setCaptionsList([...CAPTIONS[captionCategory]].sort(() => 0.5 - Math.random()));
          break;

        default:
          setOutput('Tool not implemented yet.');
      }
    } catch (err) {
      setError('Error processing request. Please try again.');
    }
    setLoading(false);
  };



  // --- Renderers ---

  const renderYoutubeTool = () => (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Youtube className="w-5 h-5 text-accent" /> YouTube Thumbnail Downloader
        </h3>
        <div className="fg mb-4">
          <label className="fl">Enter YouTube Video URL</label>
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="url" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
          </div>
        </div>
        {error && <div className="text-red-500 text-sm flex items-center gap-1 mb-4"><AlertCircle className="w-4 h-4"/> {error}</div>}
        <button onClick={generate} disabled={loading || !input} className="btn bp w-full gap-2 h-12 text-lg">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          {loading ? 'Extracting...' : 'Get Thumbnails'}
        </button>
      </div>

      {ytThumbnails.length > 0 && (
        <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm space-y-8 animate-in fade-in slide-in-from-bottom-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-accent" /> Available Thumbnails
          </h3>
          {ytThumbnails.map((thumb, idx) => (
            <div key={idx} className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-primary bg-bg-secondary px-3 py-1 rounded-full text-sm">{thumb.label}</span>
                <a 
                  href={thumb.url} 
                  download={`thumbnail-${thumb.res}.jpg`} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn bs gap-2 text-sm py-1.5 inline-flex items-center justify-center"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
              </div>
              <div className="relative rounded-xl overflow-hidden border border-border bg-bg-secondary aspect-video flex items-center justify-center">
                <img 
                  src={thumb.url} 
                  alt={`${thumb.label} Thumbnail`} 
                  className="w-full h-full object-cover" 
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // Fallback if maxresdefault doesn't exist
                    (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${getYoutubeId(input)}/hqdefault.jpg`;
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderInstagramTool = () => (
    <div className="space-y-6">
      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Instagram className="w-5 h-5 text-accent" /> Instagram Image Downloader
        </h3>
        <div className="fg mb-4">
          <label className="fl">Enter Direct Image URL (CDN Link)</label>
          <div className="relative">
            <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="url" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="https://instagram.f...cdninstagram.com/..." />
          </div>
          <p className="text-xs text-text-muted mt-2">Note: Only direct CDN links are supported (containing cdninstagram or fbcdn).</p>
        </div>
        {error && <div className="text-red-500 text-sm flex items-center gap-1 mb-4"><AlertCircle className="w-4 h-4"/> {error}</div>}
        <button onClick={generate} disabled={loading || !input} className="btn bp w-full gap-2 h-12 text-lg">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          {loading ? 'Processing...' : 'Preview & Download'}
        </button>
      </div>

      {igImage && (
        <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-accent" /> Image Preview
            </h3>
            <a 
              href={igImage} 
              download="instagram-image.jpg" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="btn bp gap-2 inline-flex items-center justify-center"
            >
              <Download className="w-4 h-4" /> Download Image
            </a>
          </div>
          <div className="relative rounded-xl overflow-hidden border border-border bg-bg-secondary flex items-center justify-center min-h-[300px]">
            <img src={igImage} alt="Instagram" className="max-w-full max-h-[600px] object-contain" referrerPolicy="no-referrer" />
          </div>
        </div>
      )}
    </div>
  );

  const renderHashtagTool = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-fit">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Hash className="w-5 h-5 text-accent" /> Hashtag Generator
        </h3>
        <div className="fg mb-4">
          <label className="fl">Enter a Keyword or Topic</label>
          <div className="relative">
            <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. travel, fitness, food..." />
          </div>
        </div>
        {error && <div className="text-red-500 text-sm flex items-center gap-1 mb-4"><AlertCircle className="w-4 h-4"/> {error}</div>}
        <button onClick={generate} disabled={loading || !input} className="btn bp w-full gap-2 h-12 text-lg">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {loading ? 'Generating...' : 'Generate Hashtags'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-full flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-accent" /> Generated Hashtags
          </h3>
          <div className="flex gap-2">
            <button onClick={generate} disabled={!output || loading} className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors disabled:opacity-50" title="Regenerate">
              <RefreshCw className="w-5 h-5" />
            </button>
            <button onClick={() => handleCopy(output)} disabled={!output || loading} className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors disabled:opacity-50" title="Copy All">
              {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
        </div>
        <div className="flex-1 relative">
          <textarea 
            className="fta h-full bg-bg-secondary font-sans text-base leading-relaxed p-4 rounded-xl border-none focus:ring-0 resize-none" 
            value={output} 
            readOnly 
            placeholder={loading ? "Generating hashtags..." : "Your hashtags will appear here..."} 
          />
        </div>
      </div>
    </div>
  );

  const renderCaptionTool = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-surface border border-border rounded-[14px] p-6 shadow-sm h-fit">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Type className="w-5 h-5 text-accent" /> Caption Generator
        </h3>
        <div className="fg mb-6">
          <label className="fl">Select Category</label>
          <select 
            className="fi"
            value={captionCategory}
            onChange={(e) => {
              const cat = e.target.value as keyof typeof CAPTIONS;
              setCaptionCategory(cat);
              setCaptionsList(CAPTIONS[cat]);
            }}
          >
            {Object.keys(CAPTIONS).map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <button onClick={generate} className="btn bp w-full gap-2 h-12 text-lg">
          <Shuffle className="w-5 h-5" /> Randomize Captions
        </button>
      </div>

      <div className="lg:col-span-2 bg-surface border border-border rounded-[14px] p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent" /> {captionCategory} Captions
        </h3>
        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 scrollbar-hide">
          {captionsList.map((caption, idx) => (
            <div key={idx} className="p-4 bg-bg-secondary rounded-xl border border-border/50 flex justify-between items-start gap-4 group hover:border-accent/30 transition-colors">
              <p className="text-text-primary text-sm leading-relaxed">{caption}</p>
              <button 
                onClick={() => handleCopy(caption, idx)}
                className="p-2 text-text-muted hover:text-accent bg-surface rounded-lg shadow-sm border border-border transition-colors shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Copy Caption"
              >
                {copiedIndex === idx ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // Main Render
  switch (toolId) {
    case 'youtube-thumbnail-downloader':
      return renderYoutubeTool();
    case 'instagram-image-downloader':
      return renderInstagramTool();
    case 'hashtag-generator':
      return renderHashtagTool();
    case 'caption-generator':
      return renderCaptionTool();
    case 'youtube-tag-generator':
    case 'tweet-length-checker':
    case 'social-media-bio-generator':
    case 'emoji-picker':
      return (
        <div className="bg-surface border border-border rounded-[14px] p-12 text-center">
          <AlertCircle className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Coming Soon</h2>
          <p className="text-text-muted">This tool is currently under development and will be available soon.</p>
        </div>
      );
    default:
      return (
        <div className="bg-surface border border-border rounded-[14px] p-12 text-center">
          <AlertCircle className="w-12 h-12 text-text-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Tool Not Found</h2>
          <p className="text-text-muted">The requested tool is not available or has been moved.</p>
        </div>
      );
  }
}


