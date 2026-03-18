import { useState, useEffect } from 'react';
import { Copy, Trash2, Maximize2, Minimize2, Type } from 'lucide-react';
import { useFocusMode } from '../contexts/FocusModeContext';

export default function WordCounter() {
  const [text, setText] = useState('');
  const { isFocusMode, setIsFocusMode } = useFocusMode();
  const [stats, setStats] = useState({
    words: 0,
    chars: 0,
    charsNoSpaces: 0,
    sentences: 0,
    paragraphs: 0,
    lines: 0,
    readTime: 0,
    speakTime: 0
  });

  useEffect(() => {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;
    const sentences = trimmed ? (text.match(/[.!?]+/g) || []).length : 0;
    const paragraphs = trimmed ? text.split(/\n\s*\n/).length : 0;
    const lines = text ? text.split(/\n/).length : 0;
    
    // Average reading speed: 238 wpm, speaking speed: 130 wpm
    const readTime = Math.ceil(words / 238);
    const speakTime = Math.ceil(words / 130);

    setStats({ words, chars, charsNoSpaces, sentences, paragraphs, lines, readTime, speakTime });
  }, [text]);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
  };

  const handleClear = () => {
    setText('');
  };

  return (
    <div className={`space-y-6 ${isFocusMode ? 'fixed inset-0 z-[100] bg-bg-primary p-4 sm:p-8 overflow-y-auto' : ''}`}>
      {isFocusMode && (
        <div className="flex items-center justify-between mb-6 bg-surface border border-border p-4 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center">
              <Type className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg">Word Counter</h2>
              <p className="text-xs text-text-muted">Distraction-free mode</p>
            </div>
          </div>
          <button 
            onClick={() => setIsFocusMode(false)}
            className="p-2 hover:bg-bg-secondary rounded-lg text-text-secondary transition-colors"
            title="Exit Focus Mode"
          >
            <Minimize2 className="w-5 h-5" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-bg-secondary rounded-[14px] p-4 text-center border border-border">
          <div className="text-3xl font-bold text-accent mb-1">{stats.words}</div>
          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">Words</div>
        </div>
        <div className="bg-bg-secondary rounded-[14px] p-4 text-center border border-border">
          <div className="text-3xl font-bold text-accent mb-1">{stats.chars}</div>
          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">Characters</div>
        </div>
        <div className="bg-bg-secondary rounded-[14px] p-4 text-center border border-border">
          <div className="text-3xl font-bold text-accent mb-1">{stats.sentences}</div>
          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">Sentences</div>
        </div>
        <div className="bg-bg-secondary rounded-[14px] p-4 text-center border border-border">
          <div className="text-3xl font-bold text-accent mb-1">{stats.paragraphs}</div>
          <div className="text-xs font-bold text-text-secondary uppercase tracking-wider">Paragraphs</div>
        </div>
      </div>

      <div className="fg">
        <div className="flex items-center justify-between mb-2">
          <label className="fl">Type or paste your text below:</label>
          <div className="flex gap-2">
            <button 
              onClick={() => setIsFocusMode(true)}
              className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors"
              title="Enter Focus Mode"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            <button onClick={handleCopy} className="p-1.5 text-text-muted hover:text-text-primary hover:bg-bg-secondary rounded-md transition-colors" title="Copy text">
              <Copy className="w-4 h-4" />
            </button>
            <button onClick={handleClear} className="p-1.5 text-text-muted hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors" title="Clear text">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <textarea
          className="fta min-h-[60vh] text-base"
          placeholder="Start typing or paste your text here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
        <div>
          <div className="text-sm text-text-muted">Characters (no spaces)</div>
          <div className="font-bold text-lg">{stats.charsNoSpaces}</div>
        </div>
        <div>
          <div className="text-sm text-text-muted">Lines</div>
          <div className="font-bold text-lg">{stats.lines}</div>
        </div>
        <div>
          <div className="text-sm text-text-muted">Reading Time</div>
          <div className="font-bold text-lg">~{stats.readTime} min</div>
        </div>
        <div>
          <div className="text-sm text-text-muted">Speaking Time</div>
          <div className="font-bold text-lg">~{stats.speakTime} min</div>
        </div>
      </div>
    </div>
  );
}
