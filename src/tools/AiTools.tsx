import React, { useState, useEffect } from 'react';
import { Copy, Trash2, Check, RefreshCw, Sparkles } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

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

  const generate = async () => {
    if (!input.trim()) return;
    setLoading(true);
    setOutput('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      const topic = input.trim();
      let prompt = '';
      let systemInstruction = '';

      switch (toolId) {
        case 'ai-content-generator':
          systemInstruction = "You are a professional content writer. Generate high-quality, SEO-friendly articles or blog posts based on the provided topic. Use clear headings, bullet points, and a professional tone.";
          prompt = `Write a comprehensive article about: ${topic}`;
          break;
        case 'ai-title-generator':
          systemInstruction = "You are a creative copywriter. Generate catchy, click-worthy, and SEO-optimized titles for the given topic.";
          prompt = `Generate 10 engaging titles for a blog post or video about: ${topic}`;
          break;
        case 'ai-email-writer':
          systemInstruction = "You are an expert business communicator. Write professional, clear, and effective emails based on the provided context.";
          prompt = `Write a professional email about: ${topic}`;
          break;
        case 'ai-instagram-caption':
          systemInstruction = "You are a social media manager. Generate engaging, trendy, and emoji-rich Instagram captions with relevant hashtags.";
          prompt = `Generate 5 creative Instagram captions for a post about: ${topic}`;
          break;
        case 'ai-story-generator':
          systemInstruction = "You are a creative storyteller. Write engaging, imaginative, and well-structured short stories based on the provided theme or prompt.";
          prompt = `Write a short story about: ${topic}`;
          break;
        case 'ai-product-description':
          systemInstruction = "You are an expert e-commerce copywriter. Generate persuasive, benefit-driven, and SEO-friendly product descriptions.";
          prompt = `Write a compelling product description for: ${topic}`;
          break;
        case 'ai-text-humanizer':
          systemInstruction = "You are an editor specializing in natural language. Rewrite the provided text to make it sound more human, conversational, and less like AI-generated content, while preserving the original meaning.";
          prompt = `Humanize the following text: ${topic}`;
          break;
        default:
          prompt = `Generate content about: ${topic}`;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction,
        }
      });

      setOutput(response.text || 'No content generated.');
    } catch (error) {
      console.error('AI Generation Error:', error);
      setOutput('Error: Failed to generate content. Please try again later.');
    } finally {
      setLoading(false);
    }
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
