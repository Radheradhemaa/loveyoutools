import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Hash, Twitter, User, Smile, Youtube, Instagram, Download, Image as ImageIcon, Video, Type, MessageSquare, Sparkles, Send, ExternalLink } from 'lucide-react';

export default function SocialTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  useEffect(() => {
    setInput('');
    setOutput('');
    setThumbnailUrl('');
  }, [toolId]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const generate = async () => {
    setLoading(true);
    let res = '';
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      switch (toolId) {
        case 'youtube-tag-generator':
          if (!input) { res = 'Please enter a video topic or keyword.'; break; }
          res = `YouTube Tags for: "${input}"\n\n` +
                `${input.replace(/\s+/g, '')}, howto${input.replace(/\s+/g, '')}, ${input}tutorial, best${input.replace(/\s+/g, '')}, ${input}tips, ${input}tricks, learn${input.replace(/\s+/g, '')}, ${input}guide, ${input}forbeginners, ${input}2024, ${input}review, ${input}explained, whatis${input.replace(/\s+/g, '')}, ${input}hacks, ${input}secrets\n\n` +
                `Note: These are simulated tags.`;
          break;

        case 'youtube-thumbnail-downloader':
          const videoId = getYoutubeId(input);
          if (videoId) {
            const url = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            setThumbnailUrl(url);
            res = `Thumbnail found!\n\nVideo ID: ${videoId}\nThumbnail URL: ${url}\n\nYou can right-click the image to save it or use the download button.`;
          } else {
            res = 'Invalid YouTube URL. Please provide a valid link.';
          }
          break;

        case 'instagram-dp-downloader':
          if (!input) { res = 'Please enter an Instagram username.'; break; }
          res = `Profile Analysis for: @${input}\n\n` +
                `1. Profile Type: Public (Simulated)\n` +
                `2. Estimated Followers: 10K - 50K\n` +
                `3. Engagement Rate: 3.5%\n` +
                `4. Profile Picture: HD Available\n` +
                `5. Recent Activity: Active\n\n` +
                `Note: This is a simulated analysis. To download the DP, usually a direct API request is needed.`;
          break;

        case 'reel-video-downloader':
          if (!input) { res = 'Please enter a Reel or Video URL.'; break; }
          res = `Video Analysis for: "${input}"\n\n` +
                `1. Content Type: Short Video / Reel\n` +
                `2. Estimated File Size: 15MB - 30MB\n` +
                `3. Available Resolutions: 1080p, 720p, 480p\n` +
                `4. Audio Track: Original Audio\n\n` +
                `Note: This tool simulates the extraction process. Direct downloads require backend processing.`;
          break;

        case 'hashtag-generator':
          if (!input) { res = 'Please enter a topic or keyword.'; break; }
          res = `Hashtags for: "${input}"\n\n` +
                `🔥 Most Popular:\n` +
                `#${input.replace(/\s+/g, '')} #trending #viral #explorepage #fyp\n\n` +
                `🎯 Niche Specific:\n` +
                `#${input.replace(/\s+/g, '')}life #${input.replace(/\s+/g, '')}tips #${input.replace(/\s+/g, '')}community #${input.replace(/\s+/g, '')}love\n\n` +
                `🚀 Engagement Boosters:\n` +
                `#likeforlike #followforfollow #commentbelow #share\n\n` +
                `Note: These are simulated hashtags.`;
          break;

        case 'caption-generator':
          if (!input) { res = 'Please describe your post or photo.'; break; }
          res = `Captions for: "${input}"\n\n` +
                `1. Witty: Just another day of ${input} and pretending I know what I'm doing. 😅\n\n` +
                `2. Inspirational: Every step in ${input} is a step towards greatness. Keep pushing! ✨\n\n` +
                `3. Minimalist: ${input}. That's it. 🖤\n\n` +
                `4. Question: What are your thoughts on ${input}? Let me know below! 👇\n\n` +
                `5. Storytelling: It all started when I discovered ${input}... and the rest is history. 📖\n\n` +
                `Note: These are simulated captions.`;
          break;

        case 'tweet-length-checker':
          res = input;
          break;

        case 'social-media-bio-generator':
          if (!input) { res = 'Please provide some details about yourself.'; break; }
          res = `Bios based on: "${input}"\n\n` +
                `1. Professional: Expert in ${input}. Helping businesses grow and scale. 📈 | Speaker | Consultant\n\n` +
                `2. Creative: Creating magic with ${input}. 🎨 | Coffee addict ☕ | Dreamer ✨\n\n` +
                `3. Casual: Just a person who loves ${input}. 🍕 | Dog parent 🐶 | Let's connect! ✌️\n\n` +
                `Note: These are simulated bios.`;
          break;

        case 'emoji-picker':
          res = '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾';
          break;
      }
    } catch (error) {
      res = 'Error processing request. Please try again.';
      console.error(error);
    }
    setOutput(res);
    setLoading(false);
  };

  const renderInputArea = () => {
    switch (toolId) {
      case 'tweet-length-checker':
        return (
          <>
            <div className="flex justify-between mb-2">
              <label className="fl">Draft your tweet</label>
              <span className={`text-sm font-bold ${input.length > 280 ? 'text-red-500' : 'text-success'}`}>
                {input.length} / 280
              </span>
            </div>
            <textarea 
              className={`fta min-h-[200px] ${input.length > 280 ? 'border-red-500 focus:ring-red-500/50' : ''}`} 
              value={input} 
              onChange={e => { setInput(e.target.value); setOutput(e.target.value); }} 
              placeholder="What's happening?" 
            />
          </>
        );
      case 'emoji-picker':
        return (
          <div className="fg mb-4">
            <label className="fl">Click Generate to get a list of common emojis</label>
            <button onClick={generate} className="btn bp w-full gap-2 mt-4 h-12">
              <Smile className="w-5 h-5" /> Show Emojis
            </button>
          </div>
        );
      case 'youtube-thumbnail-downloader':
      case 'reel-video-downloader':
        return (
          <div className="fg mb-4">
            <label className="fl">Enter URL</label>
            <div className="relative">
              {toolId === 'youtube-thumbnail-downloader' ? <Youtube className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" /> : <Video className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />}
              <input type="url" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder={toolId === 'youtube-thumbnail-downloader' ? "https://youtube.com/watch?v=..." : "Paste Reel or Video link..."} />
            </div>
          </div>
        );
      case 'instagram-dp-downloader':
        return (
          <div className="fg mb-4">
            <label className="fl">Instagram Username</label>
            <div className="relative">
              <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="text" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. zuck" />
            </div>
          </div>
        );
      default:
        return (
          <div className="fg mb-4">
            <label className="fl">
              {toolId === 'youtube-tag-generator' ? 'Video Topic' : toolId === 'hashtag-generator' ? 'Enter Topic' : toolId === 'caption-generator' ? 'Post Description' : 'Tell us about yourself'}
            </label>
            <div className="relative">
              <Type className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input type="text" className="fi pl-10" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. technology, fitness, cooking..." />
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-accent" /> Tool Input
            </h3>
            
            {renderInputArea()}

            {toolId !== 'emoji-picker' && (
              <button 
                onClick={generate} 
                disabled={loading}
                className="btn bp w-full mt-4 gap-2 h-12 text-lg"
              >
                {loading ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
                {loading ? 'Processing...' : 'Generate Result'}
              </button>
            )}
          </div>

          {thumbnailUrl && (
            <div className="mt-6 bg-surface border border-border rounded-[14px] p-6 shadow-sm">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-accent" /> Thumbnail Preview
              </h3>
              <div className="relative group rounded-xl overflow-hidden border border-border">
                <img src={thumbnailUrl} alt="YouTube Thumbnail" className="w-full h-auto" referrerPolicy="no-referrer" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <a href={thumbnailUrl} target="_blank" rel="noopener noreferrer" className="btn bp gap-2">
                    <Download className="w-4 h-4" /> Download HD
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="fg">
          <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-accent" /> Generated Output
              </h3>
              <button 
                onClick={handleCopy} 
                disabled={!output || loading} 
                className="p-2 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-lg transition-colors disabled:opacity-50"
              >
                {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex-1 relative">
              <textarea 
                className="fta h-full min-h-[400px] bg-bg-secondary font-sans text-base leading-relaxed p-4 rounded-xl border-none focus:ring-0 resize-none" 
                value={output} 
                readOnly 
                placeholder={loading ? "AI is working on your request..." : "Result will appear here..."} 
              />
              {loading && (
                <div className="absolute inset-0 bg-bg-secondary/50 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
                  <div className="flex flex-col items-center gap-3">
                    <RefreshCw className="w-8 h-8 text-accent animate-spin" />
                    <p className="text-sm font-medium text-text-primary">AI is generating...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

