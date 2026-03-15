import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Hash, Twitter, User, Smile } from 'lucide-react';

export default function SocialTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setInput('');
    setOutput('');
  }, [toolId]);

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const generate = () => {
    let res = '';
    switch (toolId) {
      case 'yt-tags':
        const tags = ['viral', 'trending', 'youtube', 'video', 'new', 'update', 'tips', 'tricks', 'guide', 'tutorial', 'how to', 'best', 'top 10', 'review', 'unboxing'];
        const keyword = input.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '');
        if (keyword) {
          res = `${keyword}, ${keyword} 2026, best ${keyword}, how to ${keyword}, ${tags.sort(() => 0.5 - Math.random()).slice(0, 10).join(', ')}`;
        } else {
          res = tags.join(', ');
        }
        break;
      case 'hashtag-gen':
        const kw = input.trim().replace(/\s+/g, '');
        if (kw) {
          res = `#${kw} #${kw}love #${kw}life #${kw}style #${kw}tips #instadaily #instagood #trending #viral #explorepage #fyp`;
        } else {
          res = '#trending #viral #explorepage #fyp #instagood #instadaily #photooftheday #beautiful #happy #cute';
        }
        break;
      case 'bio-gen':
        const profs = ['Developer', 'Designer', 'Creator', 'Entrepreneur', 'Writer', 'Photographer'];
        const traits = ['Coffee lover', 'Tech enthusiast', 'Always learning', 'Building the future', 'Creative thinker', 'Wanderlust'];
        const p = profs[Math.floor(Math.random() * profs.length)];
        const t = traits[Math.floor(Math.random() * traits.length)];
        res = `👋 Hi, I'm a ${p}.\n✨ ${t}.\n🚀 Currently building something awesome.\n👇 Check out my links below!`;
        break;
      case 'tweet-check':
        res = input;
        break;
      case 'emoji-picker':
        res = '😀 😃 😄 😁 😆 😅 😂 🤣 🥲 ☺️ 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 😏 😒 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🤭 🤫 🤥 😶 😐 😑 😬 🙄 😯 😦 😧 😮 😲 🥱 😴 🤤 😪 😵 🤐 🥴 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 😈 👿 👹 👺 🤡 💩 👻 💀 ☠️ 👽 👾 🤖 🎃 😺 😸 😹 😻 😼 😽 🙀 😿 😾';
        break;
    }
    setOutput(res);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          {toolId === 'tweet-check' ? (
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
          ) : toolId === 'emoji-picker' ? (
             <div className="fg mb-4">
                <label className="fl">Click Generate to get a list of common emojis</label>
                <button onClick={generate} className="btn bp w-full gap-2 mt-4">
                  <Smile className="w-4 h-4" /> Show Emojis
                </button>
             </div>
          ) : (
            <>
              <div className="fg mb-4">
                <label className="fl">
                  {toolId === 'yt-tags' ? 'Main Keyword / Topic' : toolId === 'hashtag-gen' ? 'Enter a word' : 'Describe yourself briefly'}
                </label>
                <input type="text" className="fi" value={input} onChange={e => setInput(e.target.value)} placeholder="e.g. technology, fitness, cooking..." />
              </div>
              <button onClick={generate} className="btn bp w-full gap-2 mt-4">
                <RefreshCw className="w-4 h-4" /> Generate
              </button>
            </>
          )}
        </div>

        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">Result</label>
            <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <textarea className="fta min-h-[200px] bg-bg-secondary" value={output} readOnly placeholder="Result will appear here..." />
        </div>
      </div>
    </div>
  );
}
