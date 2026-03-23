import React, { useState, useEffect } from 'react';
import { Download, Settings, RefreshCw, Film, Trash2, ImagePlus } from 'lucide-react';
import gifshot from 'gifshot';
import ToolLayout from '../components/tool-system/ToolLayout';

export default function GifMaker() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [gifWidth, setGifWidth] = useState(500);
  const [gifHeight, setGifHeight] = useState(500);
  const [interval, setIntervalTime] = useState(0.5);

  const faq = [
    { q: "How many images can I use?", a: "You can upload as many images as you want to create your GIF." },
    { q: "Can I change the speed?", a: "Yes, you can adjust the frame interval in seconds to make the GIF faster or slower." },
    { q: "What is the maximum size?", a: "You can set custom width and height for your GIF in the settings." }
  ];

  const handleFiles = (newFiles: File | File[]) => {
    const selected = Array.isArray(newFiles) ? newFiles : [newFiles];
    if (selected.length > 0) {
      setFiles(prev => [...prev, ...selected]);
      const newPreviews = selected.map((file: File) => URL.createObjectURL(file));
      setPreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const removeImage = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const createGif = () => {
    if (previews.length === 0) return;
    setLoading(true);

    gifshot.createGIF({
      images: previews,
      gifWidth: gifWidth,
      gifHeight: gifHeight,
      interval: interval,
      numFrames: previews.length,
      frameDuration: 1,
      sampleInterval: 10,
      numWorkers: 2
    }, (obj: any) => {
      if (!obj.error) {
        setOutput(obj.image);
      } else {
        console.error("Error creating GIF:", obj.error);
      }
      setLoading(false);
    });
  };

  const downloadGif = () => {
    if (!output) return;
    const a = document.createElement('a');
    a.href = output;
    a.download = `animated_${Date.now()}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <ToolLayout
      title="GIF Maker"
      description="Create animated GIFs from your images. Customize size, speed, and order."
      toolId="gif-maker"
      acceptedFileTypes={['image/*']}
      multiple={true}
      faq={faq}
      onDownload={output ? downloadGif : undefined}
    >
      {({ file, onComplete, onReset }) => {
        useEffect(() => {
          if (file) {
            handleFiles(file);
          }
        }, [file]);

        if (previews.length === 0) return null;

        return (
          <div className="max-w-[1200px] mx-auto w-full p-4 lg:p-6 flex flex-col gap-5 h-full">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
              {/* Left Controls (Sidebar) */}
              <aside className="order-2 lg:order-1 bg-surface border border-border rounded-xl flex flex-col shadow-sm overflow-hidden h-auto lg:h-full">
                <div className="p-5 border-b border-border flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
                  <div className="px-3 py-1.5 rounded-lg text-sm font-bold whitespace-nowrap bg-accent text-white">Settings</div>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-bold mb-2 block">Width (px)</label>
                      <input type="number" className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent" value={gifWidth} onChange={e => setGifWidth(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-bold mb-2 block">Height (px)</label>
                      <input type="number" className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent" value={gifHeight} onChange={e => setGifHeight(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-bold mb-2 block">Frame Interval (seconds)</label>
                      <input type="number" step="0.1" min="0.1" className="w-full bg-bg-secondary border border-border rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-accent" value={interval} onChange={e => setIntervalTime(Number(e.target.value))} />
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border space-y-4">
                    <button onClick={createGif} disabled={loading || previews.length < 2} className="btn bp w-full py-4 rounded-2xl gap-2 text-lg font-bold shadow-xl shadow-accent/20 disabled:opacity-50">
                      {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Film className="w-5 h-5" />}
                      {previews.length < 2 ? 'Add more images' : 'Create GIF'}
                    </button>
                    {output && (
                      <button onClick={downloadGif} className="w-full py-3 rounded-xl bg-bg-secondary hover:bg-border text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" /> Download GIF
                      </button>
                    )}
                  </div>
                </div>
              </aside>

              {/* Right Preview */}
              <main className="order-1 lg:order-2 w-full bg-[#f8f9fa] border border-[#e9ecef] rounded-xl p-4 lg:p-6 flex flex-col min-h-[400px] lg:min-h-0 h-auto lg:h-full overflow-hidden relative gap-4">
                <div className="flex justify-between items-center z-10 pointer-events-none">
                  <div className="bg-surface/80 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-bold shadow-sm pointer-events-auto border border-border flex items-center gap-3">
                    <span className="font-bold">{previews.length} frames</span>
                  </div>
                  <div className="flex gap-2 pointer-events-auto">
                    <button onClick={() => {
                      setFiles([]);
                      setPreviews([]);
                      setOutput(null);
                      onReset();
                    }} className="bg-surface/80 backdrop-blur-md p-2 rounded-xl hover:bg-surface shadow-sm border border-border text-red-500 transition-colors ml-2">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 flex items-center justify-center p-4 overflow-hidden relative touch-none bg-bg-secondary/30 rounded-xl border border-border shadow-inner">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-bg-primary/50 backdrop-blur-sm z-20 rounded-xl">
                      <RefreshCw className="w-8 h-8 animate-spin text-accent" />
                    </div>
                  )}

                  <div className="relative w-full h-full max-h-[50vh] lg:max-h-none flex items-center justify-center overflow-auto">
                    {output ? (
                      <img src={output} alt="Generated GIF" className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
                    ) : (
                      <div className="text-center text-text-muted">
                        <Film className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p>Click "Create GIF" to generate preview</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Image Carousel */}
                <div className="h-24 bg-surface border border-border rounded-xl p-2 flex gap-2 overflow-x-auto shrink-0 shadow-sm">
                  {previews.map((src, idx) => (
                    <div key={idx} className="relative h-full aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-border transition-all group shrink-0">
                      <img src={src} alt={`Frame ${idx}`} className="w-full h-full object-cover" />
                      <div className="absolute top-1 right-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">
                        {idx + 1}
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                        className="absolute bottom-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <label className="h-full aspect-square rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center text-text-muted hover:text-accent hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer shrink-0">
                    <ImagePlus className="w-6 h-6 mb-1" />
                    <span className="text-[10px] font-bold">Add More</span>
                    <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => {
                      if (e.target.files) handleFiles(Array.from(e.target.files));
                    }} />
                  </label>
                </div>
              </main>
            </div>
          </div>
        );
      }}
    </ToolLayout>
  );
}
