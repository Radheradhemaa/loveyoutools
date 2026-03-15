import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Sparkles } from 'lucide-react';

export default function AiTools({ toolId }: { toolId: string }) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

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
    if (!input.trim()) return;
    setLoading(true);
    setOutput('');
    
    // Simulate AI delay
    setTimeout(() => {
      let res = '';
      const topic = input.trim();
      switch (toolId) {
        case 'ai-content':
          res = `Here is a generated article about ${topic}:\n\nIn today's fast-paced world, ${topic} has become increasingly important. Many experts agree that understanding the nuances of ${topic} can lead to significant improvements in both personal and professional spheres.\n\nFurthermore, the evolution of ${topic} over the past decade demonstrates a clear trend towards innovation and efficiency. As we look to the future, it is evident that ${topic} will continue to play a pivotal role in shaping our society.\n\nIn conclusion, embracing ${topic} is not just an option, but a necessity for those who wish to stay ahead of the curve. By staying informed and adaptable, we can harness the full potential of ${topic}.`;
          break;
        case 'ai-title':
          res = `1. The Ultimate Guide to ${topic}\n2. 10 Secrets About ${topic} You Need to Know\n3. How ${topic} is Changing the Game\n4. Master ${topic} in 5 Easy Steps\n5. Why Everyone is Talking About ${topic}\n6. The Future of ${topic}: What to Expect\n7. ${topic} Demystified: A Beginner's Guide\n8. 5 Common Mistakes with ${topic} and How to Avoid Them`;
          break;
        case 'ai-email':
          res = `Subject: Important Update Regarding ${topic}\n\nHi [Name],\n\nI hope this email finds you well.\n\nI am writing to discuss ${topic}. Given recent developments, it is crucial that we align our strategies to ensure optimal outcomes.\n\nPlease let me know your availability for a brief call next week to go over the details.\n\nBest regards,\n[Your Name]`;
          break;
        case 'ai-caption':
          res = `Exploring the wonders of ${topic} today! ✨ Who else loves this as much as I do? Let me know in the comments below! 👇\n\n#${topic.replace(/\s+/g, '')} #inspiration #dailyvibes #explore #trending`;
          break;
        case 'ai-story':
          res = `Once upon a time, in a world where ${topic} was the most sought-after treasure, a young adventurer named Elara set out on a quest. She had heard legends of a hidden valley where ${topic} flowed like water.\n\nHer journey was fraught with peril, but her determination never wavered. Along the way, she met a wise old sage who taught her the true meaning of ${topic}.\n\nFinally, after weeks of travel, she reached the valley. But what she found there was not what she expected. The true treasure was the journey itself, and the friends she made along the way.`;
          break;
        case 'ai-product':
          res = `Introducing the revolutionary new product for ${topic}! Designed with cutting-edge technology, this product is guaranteed to enhance your experience with ${topic}.\n\nKey Features:\n- Unmatched durability and performance\n- Sleek, modern design\n- Easy to use and maintain\n- 100% satisfaction guarantee\n\nDon't miss out on the opportunity to elevate your ${topic} game. Order yours today!`;
          break;
        case 'ai-humanize':
          res = `Hey there! So, I was thinking about ${topic} the other day. It's pretty crazy how much it affects our daily lives, right? I mean, we use it all the time without even realizing it. I think it's definitely something worth looking into more. What do you guys think?`;
          break;
      }
      setOutput(res);
      setLoading(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">What is the topic or keyword?</label>
            <button onClick={() => { setInput(''); setOutput(''); }} className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <textarea 
            className="fta min-h-[150px]" 
            value={input} 
            onChange={e => setInput(e.target.value)} 
            placeholder="e.g. Artificial Intelligence, Healthy Eating, Space Exploration..." 
          />
          
          <button onClick={generate} disabled={loading || !input.trim()} className="btn bp w-full gap-2 mt-4">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Generating...' : 'Generate with AI'}
          </button>
        </div>

        <div className="fg">
          <div className="flex items-center justify-between mb-2">
            <label className="fl">AI Output</label>
            <button onClick={handleCopy} disabled={!output} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors disabled:opacity-50">
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
          <div className="relative min-h-[300px]">
            {loading && (
              <div className="absolute inset-0 bg-surface/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-[9px]">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-8 h-8 text-accent animate-spin" />
                  <span className="text-sm font-medium text-text-secondary animate-pulse">AI is thinking...</span>
                </div>
              </div>
            )}
            <textarea className="fta w-full h-full min-h-[300px] bg-bg-secondary" value={output} readOnly placeholder="AI generated content will appear here..." />
          </div>
        </div>
      </div>
    </div>
  );
}
