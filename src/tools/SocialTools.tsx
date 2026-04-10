import React, { useState, useEffect } from 'react';
import { Copy, Check, RefreshCw, Youtube, Instagram, Download, Image as ImageIcon, Type, MessageSquare, Sparkles, Send, AlertCircle, Hash, Shuffle, Twitter, User, Smile, Plus, Trash2, Tag, AlignLeft } from 'lucide-react';

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

  // YouTube Tag Generator
  const [ytTags, setYtTags] = useState<string[]>([]);

  // Tweet Length Checker
  const [tweetText, setTweetText] = useState('');

  // Bio Generator
  const [bioName, setBioName] = useState('');
  const [bioNiche, setBioNiche] = useState('');
  const [bioTone, setBioTone] = useState('Professional');
  const [generatedBios, setGeneratedBios] = useState<string[]>([]);

  // Emoji Picker
  const [emojiSearch, setEmojiSearch] = useState('');
  const [selectedEmojis, setSelectedEmojis] = useState('');

  useEffect(() => {
    setInput('');
    setOutput('');
    setError('');
    setYtThumbnails([]);
    setIgImage('');
    setCaptionsList([]);
    setYtTags([]);
    setTweetText('');
    setBioName('');
    setBioNiche('');
    setGeneratedBios([]);
    setEmojiSearch('');
    setSelectedEmojis('');
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

        case 'youtube-tag-generator':
          if (!input) {
            setError('Please enter a video topic or keyword.');
            break;
          }
          const tags = [
            input.toLowerCase(),
            `${input.toLowerCase()} 2026`,
            `how to ${input.toLowerCase()}`,
            `best ${input.toLowerCase()}`,
            `${input.toLowerCase()} tutorial`,
            `${input.toLowerCase()} review`,
            `${input.toLowerCase()} tips`,
            `${input.toLowerCase()} guide`,
            `${input.toLowerCase()} explained`,
            `${input.toLowerCase()} for beginners`,
            `what is ${input.toLowerCase()}`,
            `${input.toLowerCase()} update`,
            `${input.toLowerCase()} tricks`,
            `top 10 ${input.toLowerCase()}`,
            `${input.toLowerCase()} compilation`
          ].map(t => t.replace(/[^a-zA-Z0-9 ]/g, '').trim()).filter(Boolean);
          setYtTags(tags);
          break;

        case 'social-media-bio-generator':
          if (!bioName || !bioNiche) {
            setError('Please enter your name and niche/profession.');
            break;
          }
          const bios = [];
          if (bioTone === 'Professional') {
            bios.push(`${bioNiche} Professional | Helping businesses grow through innovative solutions. Let's connect! 🚀`);
            bios.push(`Hi, I'm ${bioName}. Experienced ${bioNiche} passionate about delivering excellence and driving results. 💼`);
            bios.push(`${bioNiche} Specialist | Dedicated to continuous learning and professional growth. Reach out for collaborations! 🤝`);
          } else if (bioTone === 'Creative') {
            bios.push(`✨ Turning coffee into ${bioNiche} magic. | ${bioName} | Let's create something beautiful together. 🎨`);
            bios.push(`Dreamer. Creator. ${bioNiche} enthusiast. 🌟 | Making the web a better place one pixel at a time. | ${bioName}`);
            bios.push(`Crafting digital experiences & telling stories through ${bioNiche}. 🚀 | Welcome to my creative journey! 🎭`);
          } else if (bioTone === 'Funny') {
            bios.push(`I put the 'el' in ${bioNiche}... wait, that doesn't make sense. Anyway, I'm ${bioName}. 🤪`);
            bios.push(`Professional overthinker and amateur ${bioNiche}. 🍕 Powered by pizza and caffeine. | ${bioName}`);
            bios.push(`I'm ${bioName}. I do ${bioNiche} things so you don't have to. You're welcome. 😎`);
          } else if (bioTone === 'Minimalist') {
            bios.push(`${bioName}. ${bioNiche}.`);
            bios.push(`${bioNiche} @ World. | ${bioName}`);
            bios.push(`Creating. | ${bioNiche} | ${bioName}`);
          }
          setGeneratedBios(bios);
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

  const renderYoutubeTagGenerator = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-fit">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Tag className="w-5 h-5 text-accent" /> YouTube Tag Generator
        </h3>
        <div className="fg mb-4">
          <label className="fl">Enter Video Topic or Keyword</label>
          <div className="relative">
            <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input type="text" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. react tutorial, fitness vlog..." />
          </div>
        </div>
        {error && <div className="text-red-500 text-sm flex items-center gap-1 mb-4"><AlertCircle className="w-4 h-4"/> {error}</div>}
        <button onClick={generate} disabled={loading || !input} className="btn bp w-full gap-2 h-12 text-lg">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {loading ? 'Generating...' : 'Generate Tags'}
        </button>
      </div>

      <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-full flex flex-col min-h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Hash className="w-5 h-5 text-accent" /> Generated Tags
          </h3>
          <div className="flex gap-2">
            <button onClick={() => handleCopy(ytTags.join(', '))} disabled={ytTags.length === 0} className="btn bs gap-2 py-1.5 text-sm" title="Copy All">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />} Copy All
            </button>
          </div>
        </div>
        <div className="flex-1 relative">
          {ytTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {ytTags.map((tag, idx) => (
                <div key={idx} className="bg-bg-secondary border border-border px-3 py-1.5 rounded-lg text-sm flex items-center gap-2">
                  <span>{tag}</span>
                  <button onClick={() => handleCopy(tag, idx)} className="text-text-muted hover:text-accent transition-colors">
                    {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-text-muted">
              Your generated tags will appear here...
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTweetLengthChecker = () => {
    const getTweetLength = (text: string) => {
      // Basic approximation: URLs count as 23 chars
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const textWithoutUrls = text.replace(urlRegex, '');
      const urlCount = (text.match(urlRegex) || []).length;
      return textWithoutUrls.length + (urlCount * 23);
    };

    const length = getTweetLength(tweetText);
    const isOverLimit = length > 280;
    const progress = Math.min((length / 280) * 100, 100);

    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Twitter className="w-5 h-5 text-accent" /> Tweet Length Checker
          </h3>
          
          <div className="relative mb-4">
            <textarea 
              className={`fta w-full h-48 p-4 rounded-xl border ${isOverLimit ? 'border-red-500 focus:ring-red-500/20' : 'border-border focus:ring-accent/20'} resize-none text-lg`}
              value={tweetText}
              onChange={e => setTweetText(e.target.value)}
              placeholder="What's happening?"
            />
            <div className={`absolute bottom-4 right-4 font-bold ${isOverLimit ? 'text-red-500' : 'text-text-muted'}`}>
              {length} / 280
            </div>
          </div>

          <div className="w-full h-2 bg-bg-secondary rounded-full overflow-hidden mb-6">
            <div 
              className={`h-full transition-all duration-300 ${isOverLimit ? 'bg-red-500' : length > 250 ? 'bg-yellow-500' : 'bg-[#1DA1F2]'}`}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <div className="bg-bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-text-primary">{tweetText.length === 0 ? 0 : tweetText.trim().split(/\s+/).length}</div>
              <div className="text-xs text-text-muted uppercase tracking-wider font-bold mt-1">Words</div>
            </div>
            <div className="bg-bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-text-primary">{(tweetText.match(/#/g) || []).length}</div>
              <div className="text-xs text-text-muted uppercase tracking-wider font-bold mt-1">Hashtags</div>
            </div>
            <div className="bg-bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-text-primary">{(tweetText.match(/@/g) || []).length}</div>
              <div className="text-xs text-text-muted uppercase tracking-wider font-bold mt-1">Mentions</div>
            </div>
            <div className="bg-bg-secondary p-4 rounded-xl text-center">
              <div className="text-2xl font-bold text-text-primary">{(tweetText.match(/(https?:\/\/[^\s]+)/g) || []).length}</div>
              <div className="text-xs text-text-muted uppercase tracking-wider font-bold mt-1">Links</div>
            </div>
          </div>

          <div className="flex gap-4">
            <button onClick={() => handleCopy(tweetText)} disabled={!tweetText} className="btn bp flex-1 gap-2 h-12">
              {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />} Copy Tweet
            </button>
            <button onClick={() => setTweetText('')} disabled={!tweetText} className="btn bs flex-1 gap-2 h-12">
              <Trash2 className="w-5 h-5" /> Clear
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderBioGenerator = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 bg-surface border border-border rounded-[14px] p-6 shadow-sm h-fit space-y-4">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-accent" /> Bio Generator
        </h3>
        <div className="fg">
          <label className="fl">Your Name</label>
          <input type="text" className="fi" value={bioName} onChange={e => setBioName(e.target.value)} placeholder="e.g. Alex Doe" />
        </div>
        <div className="fg">
          <label className="fl">Niche / Profession</label>
          <input type="text" className="fi" value={bioNiche} onChange={e => setBioNiche(e.target.value)} placeholder="e.g. Web Developer, Photographer" />
        </div>
        <div className="fg">
          <label className="fl">Tone</label>
          <select className="fi" value={bioTone} onChange={e => setBioTone(e.target.value)}>
            <option value="Professional">Professional</option>
            <option value="Creative">Creative</option>
            <option value="Funny">Funny</option>
            <option value="Minimalist">Minimalist</option>
          </select>
        </div>
        {error && <div className="text-red-500 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4"/> {error}</div>}
        <button onClick={generate} disabled={loading || !bioName || !bioNiche} className="btn bp w-full gap-2 h-12 text-lg mt-2">
          {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
          {loading ? 'Generating...' : 'Generate Bios'}
        </button>
      </div>

      <div className="lg:col-span-2 bg-surface border border-border rounded-[14px] p-6 shadow-sm">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <AlignLeft className="w-5 h-5 text-accent" /> Generated Bios
        </h3>
        <div className="space-y-4">
          {generatedBios.length > 0 ? generatedBios.map((bio, idx) => (
            <div key={idx} className="p-5 bg-bg-secondary rounded-xl border border-border flex flex-col gap-3 group hover:border-accent/30 transition-colors">
              <p className="text-text-primary text-base whitespace-pre-wrap">{bio}</p>
              <div className="flex justify-between items-center pt-2 border-t border-border/50">
                <span className="text-xs font-bold text-text-muted">{bio.length} chars</span>
                <button 
                  onClick={() => handleCopy(bio, idx)}
                  className="btn bs gap-2 py-1.5 text-sm"
                >
                  {copiedIndex === idx ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />} Copy
                </button>
              </div>
            </div>
          )) : (
            <div className="h-48 flex items-center justify-center text-text-muted border-2 border-dashed border-border rounded-xl">
              Fill out your details and click generate!
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderEmojiPicker = () => {
    const EMOJI_CATEGORIES = [
      { name: 'Smileys & Emotion', emojis: ['😀','😃','😄','😁','😆','😅','😂','🤣','🥲','☺️','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾'] },
      { name: 'Gestures & Body Parts', emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🧠','🫀','🫁','🦷','🦴','👀','👁','👅','👄','💋','🩸'] },
      { name: 'Animals & Nature', emojis: ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽','🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🪱','🐛','🦋','🐌','🐞','🐜','🪰','🪲','🪳','🦟','🦗','🕷','🕸','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🦭','🐊','🐅','🐆','🦓','🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖','🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🪶','🐓','🦃','🦤','🦚','🦜','🦢','🦩','🕊','🐇','🦝','🦨','🦡','🦫','🦦','🦥','🐁','🐀','🐿','🦔','🐾','🐉','🐲','🌵','🎄','🌲','🌳','🌴','🪵','🌱','🌿','☘️','🍀','🎍','🪴','🎋','🍃','🍂','🍁','🍄','🐚','🪨','🌾','💐','🌷','🌹','🥀','🌺','🌸','🌼','🌻','🌞','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌎','🌍','🌏','🪐','💫','⭐️','🌟','✨','⚡️','☄️','💥','🔥','🌪','🌈','☀️','🌤','⛅️','🌥','☁️','🌦','🌧','⛈','🌩','🌨','❄️','☃️','⛄️','🌬','💨','💧','💦','☔️','☂️','🌊','🌫'] },
      { name: 'Food & Drink', emojis: ['🍏','🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶','🫑','🌽','🥕','🫒','🧄','🧅','🥔','🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🥘','🫕','🥫','🍝','🍜','🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥠','🥮','🍢','🍡','🍧','🍨','🍦','🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍿','🍩','🍪','🌰','🥜','🍯','🥛','🍼','🫖','☕️','🍵','🧃','🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊','🥄','🍴','🍽','🥣','🥡','🥢','🧂'] }
    ];

    const filteredCategories = EMOJI_CATEGORIES.map(cat => ({
      ...cat,
      emojis: cat.emojis.filter(e => emojiSearch === '' || cat.name.toLowerCase().includes(emojiSearch.toLowerCase()))
    })).filter(cat => cat.emojis.length > 0);

    return (
      <div className="space-y-6">
        <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Smile className="w-5 h-5 text-accent" /> Emoji Picker
          </h3>
          
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1 relative">
              <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input 
                type="text" 
                className="fi pl-10" 
                value={emojiSearch} 
                onChange={e => setEmojiSearch(e.target.value)} 
                placeholder="Search categories..." 
              />
            </div>
          </div>

          <div className="bg-bg-secondary border border-border rounded-xl p-4 mb-6 flex flex-col sm:flex-row gap-4 items-center">
            <div className="flex-1 w-full relative">
              <input 
                type="text" 
                className="fi pr-24 text-2xl tracking-widest" 
                value={selectedEmojis} 
                onChange={e => setSelectedEmojis(e.target.value)} 
                placeholder="Selected emojis..." 
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                <button onClick={() => setSelectedEmojis('')} className="p-1.5 text-text-muted hover:text-red-500 rounded-lg transition-colors" title="Clear">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <button onClick={() => handleCopy(selectedEmojis)} disabled={!selectedEmojis} className="btn bp gap-2 h-12 w-full sm:w-auto shrink-0">
              {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />} Copy
            </button>
          </div>

          <div className="h-[500px] overflow-y-auto pr-2 custom-scrollbar space-y-8">
            {filteredCategories.length > 0 ? filteredCategories.map((category, idx) => (
              <div key={idx}>
                <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-3 sticky top-0 bg-surface py-2 z-10">{category.name}</h4>
                <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                  {category.emojis.map((emoji, eIdx) => (
                    <button 
                      key={eIdx}
                      onClick={() => setSelectedEmojis(prev => prev + emoji)}
                      className="text-3xl p-2 hover:bg-bg-secondary rounded-xl transition-transform hover:scale-110 active:scale-95 flex items-center justify-center aspect-square"
                      title="Add Emoji"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )) : (
              <div className="h-full flex items-center justify-center text-text-muted">
                No emojis found matching your search.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
      return renderYoutubeTagGenerator();
    case 'tweet-length-checker':
      return renderTweetLengthChecker();
    case 'social-media-bio-generator':
      return renderBioGenerator();
    case 'emoji-picker':
      return renderEmojiPicker();
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


