import React, { useState, useRef } from 'react';
import { Upload, Download, Settings, RefreshCw, Film, Trash2 } from 'lucide-react';
import gifshot from 'gifshot';

export default function GifMaker() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const [gifWidth, setGifWidth] = useState(500);
  const [gifHeight, setGifHeight] = useState(500);
  const [interval, setIntervalTime] = useState(0.5);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
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
    <div className="space-y-6">
      <div className="border-2 border-dashed border-border rounded-[14px] p-8 text-center hover:bg-bg-secondary transition-colors cursor-pointer relative">
        <input 
          type="file" 
          accept="image/*" 
          multiple
          onChange={handleFileChange} 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="font-bold text-lg mb-1">Upload Images for GIF</p>
            <p className="text-text-muted text-sm">Select multiple images to animate</p>
          </div>
        </div>
      </div>

      {previews.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
              {previews.map((src, idx) => (
                <div key={idx} className="relative group rounded-lg overflow-hidden border border-border aspect-square">
                  <img src={src} alt={`Frame ${idx + 1}`} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeImage(idx)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                    {idx + 1}
                  </div>
                </div>
              ))}
            </div>

            {output && (
              <div className="bg-bg-secondary rounded-[14px] p-4 flex flex-col items-center justify-center min-h-[300px]">
                <h3 className="font-bold mb-4">Generated GIF</h3>
                <img src={output} alt="Generated GIF" className="max-w-full max-h-[400px] object-contain rounded-lg shadow-md" />
              </div>
            )}
            
            <div className="flex gap-4">
              <button onClick={() => { setFiles([]); setPreviews([]); setOutput(null); }} className="btn bs flex-1">
                Clear All
              </button>
              {output && (
                <button onClick={downloadGif} className="btn bp flex-1 gap-2">
                  <Download className="w-4 h-4" /> Download GIF
                </button>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" /> Settings
              </h3>

              <div className="space-y-4">
                <div className="fg">
                  <label className="fl">Width (px)</label>
                  <input type="number" className="fi" value={gifWidth} onChange={e => setGifWidth(Number(e.target.value))} />
                </div>
                <div className="fg">
                  <label className="fl">Height (px)</label>
                  <input type="number" className="fi" value={gifHeight} onChange={e => setGifHeight(Number(e.target.value))} />
                </div>
                <div className="fg">
                  <label className="fl">Frame Interval (seconds)</label>
                  <input type="number" step="0.1" min="0.1" className="fi" value={interval} onChange={e => setIntervalTime(Number(e.target.value))} />
                </div>
              </div>

              <button onClick={createGif} disabled={loading || previews.length < 2} className="btn bp w-full mt-6 gap-2">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                {previews.length < 2 ? 'Add more images' : 'Create GIF'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
