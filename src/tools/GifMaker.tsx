import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Download, 
  Settings, 
  RefreshCw, 
  Film, 
  Trash2, 
  ImagePlus, 
  GripVertical, 
  Type, 
  Maximize2, 
  Clock, 
  Layers,
  AlertCircle,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import gifshot from 'gifshot';
import ToolLayout from '../components/tool-system/ToolLayout';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion, AnimatePresence } from 'framer-motion';

interface Frame {
  id: string;
  file: File;
  preview: string;
}

function SortableFrame({ frame, index, onRemove }: { frame: Frame, index: number, onRemove: (id: string) => void, key?: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: frame.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={`relative h-24 aspect-square rounded-xl overflow-hidden border-2 transition-all group shrink-0 ${isDragging ? 'border-accent shadow-xl opacity-50' : 'border-transparent hover:border-border'}`}
    >
      <img src={frame.preview} alt={`Frame ${index}`} className="w-full h-full object-cover" />
      
      <div className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center gap-1">
        {index + 1}
      </div>

      <div 
        {...attributes} 
        {...listeners}
        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 cursor-grab active:cursor-grabbing transition-opacity"
      >
        <GripVertical className="text-white w-6 h-6" />
      </div>

      <button 
        onClick={(e) => { e.stopPropagation(); onRemove(frame.id); }}
        className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function GifMaker() {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Settings
  const [gifWidth, setGifWidth] = useState(500);
  const [gifHeight, setGifHeight] = useState(500);
  const [interval, setIntervalTime] = useState(0.2);
  const [quality, setQuality] = useState(10); // sampleInterval: 10 is default
  const [loop, setLoop] = useState(0); // 0 is infinite
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  
  // Text Overlay Settings
  const [text, setText] = useState('');
  const [fontSize, setFontSize] = useState(40);
  const [fontColor, setFontColor] = useState('#ffffff');
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [textStrokeColor, setTextStrokeColor] = useState('#000000');
  const [textStrokeWidth, setTextStrokeWidth] = useState(2);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [textBaseline, setTextBaseline] = useState<'top' | 'middle' | 'bottom'>('bottom');

  // Preview Playback
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    let timer: any;
    if (isPlaying && frames.length > 0) {
      timer = setInterval(() => {
        setCurrentFrameIdx((prev) => (prev + 1) % frames.length);
      }, interval * 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, frames.length, interval]);

  useEffect(() => {
    return () => {
      frames.forEach(f => URL.revokeObjectURL(f.preview));
    };
  }, []);

  const handleFiles = useCallback((newFiles: File | File[]) => {
    const selected = Array.isArray(newFiles) ? newFiles : [newFiles];
    if (selected.length > 0) {
      const newFrames = selected.map((file: File) => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file)
      }));
      setFrames(prev => [...prev, ...newFrames]);
      setOutput(null);
      setError(null);
    }
  }, []);

  const removeFrame = (id: string) => {
    setFrames(prev => {
      const frameToRemove = prev.find(f => f.id === id);
      if (frameToRemove) URL.revokeObjectURL(frameToRemove.preview);
      return prev.filter(f => f.id !== id);
    });
    setOutput(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setFrames((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
      setOutput(null);
    }
  };

  const reverseFrames = () => {
    setFrames(prev => [...prev].reverse());
    setOutput(null);
  };

  const processFramesWithText = async (): Promise<string[]> => {
    const processedImages: string[] = [];
    
    for (const frame of frames) {
      const img = new Image();
      img.src = frame.preview;
      await new Promise((resolve) => { img.onload = resolve; });

      const canvas = document.createElement('canvas');
      canvas.width = gifWidth;
      canvas.height = gifHeight;
      const ctx = canvas.getContext('2d');
      
      if (ctx) {
        // Fill background
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw image (contain)
        const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width / 2) - (img.width / 2) * scale;
        const y = (canvas.height / 2) - (img.height / 2) * scale;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Draw text
        if (text) {
          ctx.font = `bold ${fontSize}px ${fontFamily}`;
          ctx.fillStyle = fontColor;
          ctx.strokeStyle = textStrokeColor;
          ctx.lineWidth = textStrokeWidth;
          ctx.textAlign = textAlign;
          ctx.textBaseline = textBaseline;

          let tx = canvas.width / 2;
          if (textAlign === 'left') tx = 20;
          if (textAlign === 'right') tx = canvas.width - 20;

          let ty = canvas.height / 2;
          if (textBaseline === 'top') ty = fontSize + 20;
          if (textBaseline === 'bottom') ty = canvas.height - 20;

          ctx.strokeText(text, tx, ty);
          ctx.fillText(text, tx, ty);
        }
      }
      
      processedImages.push(canvas.toDataURL('image/png'));
    }
    
    return processedImages;
  };

  const createGif = async () => {
    if (frames.length < 2) {
      setError("Please add at least 2 images to create a GIF.");
      return;
    }
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    try {
      const images = await processFramesWithText();

      (gifshot as any).createGIF({
        images: images,
        gifWidth: gifWidth,
        gifHeight: gifHeight,
        interval: interval,
        numFrames: frames.length,
        sampleInterval: quality,
        numWorkers: 4,
        loop: loop === 0 ? 0 : loop
      }, (obj: any) => {
        if (!obj.error) {
          setOutput(obj.image);
        } else {
          console.error("Error creating GIF:", obj.error);
          setError("Failed to generate GIF. Please try with fewer or smaller images.");
        }
        setLoading(false);
      });
    } catch (err) {
      console.error("Processing error:", err);
      setError("Error processing images. Please try again.");
      setLoading(false);
    }
  };

  const downloadGif = () => {
    if (!output) return;
    const a = document.createElement('a');
    a.href = output;
    a.download = `loveyoutools_gif_${Date.now()}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const faq = [
    { q: "How do I reorder frames?", a: "Simply drag and drop the frames in the carousel at the bottom to change their order." },
    { q: "Can I add text to my GIF?", a: "Yes, use the 'Text Overlay' section in settings to add custom text, adjust its size, color, and position." },
    { q: "What does 'Quality' mean?", a: "Lower values result in higher quality but take longer to process. A value of 1 is highest quality, 10 is standard." },
    { q: "Is there a limit to the number of images?", a: "While there's no hard limit, adding too many high-resolution images may crash your browser. We recommend keeping it under 50 frames for best performance." }
  ];

  return (
    <ToolLayout
      title="Advanced GIF Maker"
      description="Create professional animated GIFs from your images. Reorder frames, add text overlays, and customize every detail."
      toolId="gif-maker"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faq}
    >
      {({ file, onReset }) => {
        useEffect(() => {
          if (!file) {
            setFrames([]);
            setOutput(null);
            setError(null);
            return;
          }
          if (file) handleFiles(file);
        }, [file, handleFiles]);

        return (
          <div className="max-w-[1400px] mx-auto w-full p-4 lg:p-6 flex flex-col gap-6 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
              
              {/* Left Settings Panel */}
              <aside className="lg:col-span-4 xl:col-span-3 order-2 lg:order-1 bg-surface border border-border rounded-2xl flex flex-col shadow-sm overflow-hidden h-auto lg:h-full">
                <div className="p-4 border-b border-border bg-bg-secondary/50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-accent" />
                    <span className="font-bold text-sm">Configuration</span>
                  </div>
                  <button 
                    onClick={() => {
                      setFrames([]);
                      setOutput(null);
                      setError(null);
                      onReset();
                    }}
                    className="text-xs text-red-500 hover:underline font-medium"
                  >
                    Clear All
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                  {/* Basic Settings */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                      <Maximize2 className="w-3 h-3" /> Dimensions & Speed
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-text-secondary ml-1">Width</label>
                        <input 
                          type="number" 
                          className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all" 
                          value={gifWidth} 
                          onChange={e => setGifWidth(Math.max(1, Number(e.target.value)))} 
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-text-secondary ml-1">Height</label>
                        <input 
                          type="number" 
                          className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all" 
                          value={gifHeight} 
                          onChange={e => setGifHeight(Math.max(1, Number(e.target.value)))} 
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-secondary ml-1 flex justify-between">
                        <span>Frame Delay</span>
                        <span className="text-accent">{interval}s</span>
                      </label>
                      <input 
                        type="range" 
                        min="0.05" 
                        max="2" 
                        step="0.05"
                        className="w-full accent-accent" 
                        value={interval} 
                        onChange={e => setIntervalTime(Number(e.target.value))} 
                      />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border space-y-4">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                      <Type className="w-3 h-3" /> Text Overlay
                    </h3>
                    <div className="space-y-3">
                      <input 
                        type="text" 
                        placeholder="Enter overlay text..."
                        className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent outline-none transition-all"
                        value={text}
                        onChange={e => setText(e.target.value)}
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Font Family</label>
                          <select 
                            className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs outline-none"
                            value={fontFamily}
                            onChange={e => setFontFamily(e.target.value)}
                          >
                            <option value="sans-serif">Sans Serif</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                            <option value="cursive">Cursive</option>
                            <option value="Impact">Impact</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Size</label>
                          <input 
                            type="number" 
                            className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" 
                            value={fontSize} 
                            onChange={e => setFontSize(Number(e.target.value))} 
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Text Color</label>
                          <div className="flex gap-2">
                            <input 
                              type="color" 
                              className="w-10 h-9 p-1 bg-bg-secondary border border-border rounded-lg cursor-pointer" 
                              value={fontColor} 
                              onChange={e => setFontColor(e.target.value)} 
                            />
                            <input 
                              type="text" 
                              className="flex-1 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] uppercase font-mono outline-none" 
                              value={fontColor} 
                              onChange={e => setFontColor(e.target.value)} 
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Stroke Color</label>
                          <div className="flex gap-2">
                            <input 
                              type="color" 
                              className="w-10 h-9 p-1 bg-bg-secondary border border-border rounded-lg cursor-pointer" 
                              value={textStrokeColor} 
                              onChange={e => setTextStrokeColor(e.target.value)} 
                            />
                            <input 
                              type="text" 
                              className="flex-1 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] uppercase font-mono outline-none" 
                              value={textStrokeColor} 
                              onChange={e => setTextStrokeColor(e.target.value)} 
                            />
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Stroke Width</label>
                          <input 
                            type="number" 
                            min="0"
                            max="10"
                            className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-sm outline-none" 
                            value={textStrokeWidth} 
                            onChange={e => setTextStrokeWidth(Number(e.target.value))} 
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-text-secondary ml-1">Align</label>
                          <select 
                            className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs outline-none"
                            value={textAlign}
                            onChange={e => setTextAlign(e.target.value as any)}
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-text-secondary ml-1">Position</label>
                        <select 
                          className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs outline-none"
                          value={textBaseline}
                          onChange={e => setTextBaseline(e.target.value as any)}
                        >
                          <option value="top">Top</option>
                          <option value="middle">Middle</option>
                          <option value="bottom">Bottom</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Advanced settings */}
                  <div className="pt-6 border-t border-border space-y-4">
                    <h3 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-3 h-3" /> Advanced
                    </h3>
                    
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-secondary ml-1">Background Color</label>
                      <div className="flex gap-2">
                        <input 
                          type="color" 
                          className="w-10 h-9 p-1 bg-bg-secondary border border-border rounded-lg cursor-pointer" 
                          value={backgroundColor} 
                          onChange={e => setBackgroundColor(e.target.value)} 
                        />
                        <input 
                          type="text" 
                          className="flex-1 bg-bg-secondary border border-border rounded-lg px-2 py-1 text-[10px] uppercase font-mono outline-none" 
                          value={backgroundColor} 
                          onChange={e => setBackgroundColor(e.target.value)} 
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-secondary ml-1">Loop Count</label>
                      <select 
                        className="w-full bg-bg-secondary border border-border rounded-xl px-3 py-2 text-xs outline-none"
                        value={loop}
                        onChange={e => setLoop(Number(e.target.value))}
                      >
                        <option value={0}>Infinite Loop</option>
                        <option value={1}>Play Once</option>
                        <option value={2}>Play Twice</option>
                        <option value={5}>Play 5 Times</option>
                        <option value={10}>Play 10 Times</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-text-secondary ml-1 flex justify-between">
                        <span>Quality (Sample Interval)</span>
                        <span className="text-accent">{quality}</span>
                      </label>
                      <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        step="1"
                        className="w-full accent-accent" 
                        value={quality} 
                        onChange={e => setQuality(Number(e.target.value))} 
                      />
                      <p className="text-[10px] text-text-muted">Lower is better quality, but slower.</p>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-bg-secondary/30 border-t border-border space-y-3">
                  <button 
                    onClick={createGif} 
                    disabled={loading || frames.length < 2} 
                    className="btn bp w-full py-3.5 rounded-xl gap-2 font-bold shadow-lg shadow-accent/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
                    {frames.length < 2 ? 'Add more images' : 'Generate GIF'}
                  </button>
                  {output && (
                    <button 
                      onClick={downloadGif} 
                      className="w-full py-3 rounded-xl bg-surface border border-border hover:bg-bg-secondary text-sm font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4" /> Download Result
                    </button>
                  )}
                </div>
              </aside>

              {/* Right Preview Area */}
              <main className="lg:col-span-8 xl:col-span-9 order-1 lg:order-2 flex flex-col gap-6 min-h-0">
                
                {/* Main Preview */}
                <div className="flex-1 bg-surface border border-border rounded-2xl p-4 lg:p-6 flex flex-col min-h-[400px] lg:min-h-0 relative shadow-sm overflow-hidden">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1.5 rounded-xl bg-bg-secondary border border-border text-xs font-bold flex items-center gap-2">
                        <Film className="w-3.5 h-3.5 text-accent" />
                        {output ? 'Final Result' : 'Live Preview'}
                      </div>
                      {frames.length > 0 && !output && (
                        <div className="text-xs text-text-muted font-medium">
                          Frame {currentFrameIdx + 1} of {frames.length}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!output && frames.length > 0 && (
                        <div className="flex items-center bg-bg-secondary rounded-xl p-1 border border-border">
                          <button 
                            onClick={() => setCurrentFrameIdx(prev => (prev - 1 + frames.length) % frames.length)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setIsPlaying(!isPlaying)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors text-accent"
                          >
                            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                          </button>
                          <button 
                            onClick={() => setCurrentFrameIdx(prev => (prev + 1) % frames.length)}
                            className="p-1.5 hover:bg-surface rounded-lg transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                      {output && (
                        <button 
                          onClick={() => setOutput(null)}
                          className="px-3 py-1.5 rounded-xl bg-accent/10 text-accent text-xs font-bold hover:bg-accent/20 transition-colors"
                        >
                          Edit Frames
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 flex items-center justify-center bg-bg-secondary/30 rounded-2xl border border-border shadow-inner relative overflow-hidden">
                    <AnimatePresence mode="wait">
                      {loading ? (
                        <motion.div 
                          key="loading"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center bg-bg-primary/60 backdrop-blur-sm z-20"
                        >
                          <div className="relative">
                            <RefreshCw className="w-12 h-12 animate-spin text-accent" />
                            <div className="absolute inset-0 blur-xl bg-accent/20 animate-pulse"></div>
                          </div>
                          <p className="mt-4 font-bold text-text-primary">Generating Animation...</p>
                          <p className="text-xs text-text-muted mt-1">This may take a few seconds depending on quality</p>
                        </motion.div>
                      ) : error ? (
                        <motion.div 
                          key="error"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-center p-8"
                        >
                          <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500 opacity-50" />
                          <h3 className="text-lg font-bold text-text-primary mb-2">Oops! Something went wrong</h3>
                          <p className="text-sm text-text-muted max-w-md mx-auto">{error}</p>
                          <button onClick={createGif} className="mt-6 text-accent font-bold hover:underline">Try Again</button>
                        </motion.div>
                      ) : output ? (
                        <motion.div 
                          key="output"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="relative group max-w-full max-h-full p-4"
                        >
                          <img 
                            src={output} 
                            alt="Generated GIF" 
                            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl border-4 border-white dark:border-border" 
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                            <button onClick={downloadGif} className="bg-white text-black px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transform translate-y-4 group-hover:translate-y-0 transition-all">
                              <Download className="w-5 h-5" /> Download GIF
                            </button>
                          </div>
                        </motion.div>
                      ) : frames.length > 0 ? (
                        <motion.div 
                          key="preview"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="relative w-full h-full flex items-center justify-center p-4"
                        >
                          <img 
                            src={frames[currentFrameIdx].preview} 
                            alt="Preview" 
                            className="max-w-full max-h-full object-contain rounded-xl shadow-lg" 
                          />
                          {text && (
                            <div 
                              className="absolute inset-0 flex p-8 pointer-events-none"
                              style={{ 
                                alignItems: textBaseline === 'top' ? 'flex-start' : textBaseline === 'middle' ? 'center' : 'flex-end',
                                justifyContent: textAlign === 'left' ? 'flex-start' : textAlign === 'center' ? 'center' : 'flex-end'
                              }}
                            >
                              <span 
                                style={{ 
                                  color: fontColor, 
                                  fontSize: `${fontSize}px`,
                                  fontFamily: fontFamily,
                                  fontWeight: 'bold',
                                  WebkitTextStroke: `${textStrokeWidth}px ${textStrokeColor}`,
                                  textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
                                  textAlign: textAlign
                                }}
                              >
                                {text}
                              </span>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <div className="text-center p-12">
                          <div className="w-20 h-20 bg-bg-secondary rounded-3xl flex items-center justify-center mx-auto mb-6 border border-border">
                            <Film className="w-10 h-10 text-text-muted opacity-30" />
                          </div>
                          <h3 className="text-xl font-bold text-text-primary mb-2">No Images Uploaded</h3>
                          <p className="text-text-muted max-w-xs mx-auto">Upload at least two images to start creating your animated GIF.</p>
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Frame Carousel (Sortable) */}
                <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm shrink-0">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5" /> Animation Frames
                    </h4>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={reverseFrames}
                        className="text-[10px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full border border-accent/20 hover:bg-accent/20 transition-colors"
                      >
                        Reverse Order
                      </button>
                      <span className="text-[10px] font-medium text-text-muted bg-bg-secondary px-2 py-0.5 rounded-full border border-border">
                        Drag to reorder
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar min-h-[110px] items-center">
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={frames.map(f => f.id)}
                        strategy={horizontalListSortingStrategy}
                      >
                        {frames.map((frame, idx) => (
                          <SortableFrame 
                            key={frame.id}
                            frame={frame} 
                            index={idx} 
                            onRemove={removeFrame} 
                          />
                        ))}
                      </SortableContext>
                    </DndContext>

                    <label className="h-24 aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted hover:text-accent hover:border-accent hover:bg-accent/5 transition-all cursor-pointer shrink-0 group">
                      <div className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                        <ImagePlus className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-bold">Add More</span>
                      <input 
                        type="file" 
                        multiple 
                        accept="image/*" 
                        className="hidden" 
                        onChange={(e) => {
                          if (e.target.files) handleFiles(Array.from(e.target.files));
                        }} 
                      />
                    </label>
                  </div>
                </div>
              </main>
            </div>
          </div>
        );
      }}
    </ToolLayout>
  );
}
