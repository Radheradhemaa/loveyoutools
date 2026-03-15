import React, { useState, useCallback, useRef, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Upload, Download, RefreshCw, Settings, Image as ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface Area {
  width: number;
  height: number;
  x: number;
  y: number;
}

export default function PhotoSignResizer() {
  const [image, setImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [targetWidth, setTargetWidth] = useState(300);
  const [targetHeight, setTargetHeight] = useState(400);
  const [targetKB, setTargetKB] = useState(50);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ url: string; size: number; width: number; height: number } | null>(null);
  const [fileName, setFileName] = useState('photo');

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => setImage(reader.result as string));
      reader.readAsDataURL(file);
      setResult(null);
      // Try to guess file name
      if (file.name.toLowerCase().includes('sign')) setFileName('sign');
      else setFileName('photo');
    }
  };

  const setPreset = (w: number, h: number, kb: number, name: string) => {
    setTargetWidth(w);
    setTargetHeight(h);
    setTargetKB(kb);
    setFileName(name);
    setResult(null);
  };

  const createImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.setAttribute('crossOrigin', 'anonymous');
      image.src = url;
    });

  const getCroppedImg = async (
    imageSrc: string,
    pixelCrop: Area,
    targetW: number,
    targetH: number,
    targetKB: number
  ) => {
    const image = await createImage(imageSrc);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) return null;

    canvas.width = targetW;
    canvas.height = targetH;

    ctx.drawImage(
      image,
      pixelCrop.x,
      pixelCrop.y,
      pixelCrop.width,
      pixelCrop.height,
      0,
      0,
      targetW,
      targetH
    );

    // Iterative compression to reach target KB
    let quality = 0.95;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    let size = Math.round((dataUrl.length * 3) / 4 / 1024);

    // If it's already smaller than target, we might want to keep high quality
    // But if it's larger, we must compress
    if (size > targetKB) {
      // Binary search or iterative reduction for quality
      let min = 0.01;
      let max = 0.95;
      for (let i = 0; i < 8; i++) { // 8 iterations is usually enough for precision
        quality = (min + max) / 2;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        size = Math.round((dataUrl.length * 3) / 4 / 1024);
        if (size > targetKB) {
          max = quality;
        } else {
          min = quality;
        }
      }
      // Final check to ensure we are under target if possible, or very close
      dataUrl = canvas.toDataURL('image/jpeg', min);
      size = Math.round((dataUrl.length * 3) / 4 / 1024);
    }

    return { url: dataUrl, size, width: targetW, height: targetH };
  };

  const handleProcess = async () => {
    if (!image || !croppedAreaPixels) return;
    setLoading(true);
    try {
      const res = await getCroppedImg(
        image,
        croppedAreaPixels,
        targetWidth,
        targetHeight,
        targetKB
      );
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const link = document.createElement('a');
    link.download = `${fileName}_${result.width}x${result.height}_${targetKB}kb.jpg`;
    link.href = result.url;
    link.click();
  };

  return (
    <div className="space-y-6">
      {!image ? (
        <div className="border-2 border-dashed border-border rounded-[14px] p-12 text-center hover:bg-bg-secondary transition-colors cursor-pointer relative">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-lg mb-1">Upload Photo or Signature</p>
              <p className="text-text-muted text-sm">Drag and drop or click to browse</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-bg-secondary rounded-[14px] p-4 relative h-[400px] sm:h-[500px] overflow-hidden border border-border">
              <Cropper
                image={image}
                crop={crop}
                zoom={zoom}
                aspect={targetWidth / targetHeight}
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <button onClick={() => setImage(null)} className="btn bs flex-1">
                Upload New
              </button>
              <button 
                onClick={handleProcess} 
                disabled={loading} 
                className="btn bp flex-1 gap-2"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Apply & Preview
              </button>
            </div>

            {result && (
              <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-success" /> Live Preview
                  </h3>
                  <div className="flex gap-4 text-sm">
                    <span className="bg-bg-secondary px-3 py-1 rounded-full font-medium">
                      {result.width} x {result.height} px
                    </span>
                    <span className={`px-3 py-1 rounded-full font-bold ${result.size > targetKB ? 'bg-red-500/10 text-red-500' : 'bg-success/10 text-success'}`}>
                      {result.size} KB / {targetKB} KB
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-center gap-6">
                  <div className="bg-bg-secondary p-2 rounded-lg border border-border shadow-inner">
                    <img src={result.url} alt="Result" loading="lazy" className="max-w-full h-auto shadow-sm" />
                  </div>
                  <button onClick={downloadResult} className="btn bp w-full max-w-md gap-2">
                    <Download className="w-4 h-4" /> Download {fileName}_{result.width}x{result.height}_{targetKB}kb.jpg
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" /> Presets
              </h3>
              <div className="grid grid-cols-1 gap-3">
                <button 
                  onClick={() => setPreset(300, 400, 50, 'photo')}
                  className={`p-4 rounded-xl border text-left transition-all ${targetWidth === 300 && targetHeight === 400 ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50 bg-bg-secondary'}`}
                >
                  <div className="font-bold mb-1">Passport Photo</div>
                  <div className="text-xs text-text-muted">300 x 400 px • Max 50 KB</div>
                </button>
                <button 
                  onClick={() => setPreset(140, 60, 20, 'sign')}
                  className={`p-4 rounded-xl border text-left transition-all ${targetWidth === 140 && targetHeight === 60 ? 'border-accent bg-accent/5 ring-1 ring-accent' : 'border-border hover:border-accent/50 bg-bg-secondary'}`}
                >
                  <div className="font-bold mb-1">Signature</div>
                  <div className="text-xs text-text-muted">140 x 60 px • Max 20 KB</div>
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-[14px] p-6 shadow-sm">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Settings className="w-5 h-5 text-accent" /> Custom Size
              </h3>
              <div className="space-y-4">
                <div className="fg">
                  <label className="fl">Width (px)</label>
                  <input 
                    type="number" 
                    className="fi" 
                    value={targetWidth || ''} 
                    onChange={e => { setTargetWidth(Number(e.target.value)); setResult(null); }} 
                  />
                </div>
                <div className="fg">
                  <label className="fl">Height (px)</label>
                  <input 
                    type="number" 
                    className="fi" 
                    value={targetHeight || ''} 
                    onChange={e => { setTargetHeight(Number(e.target.value)); setResult(null); }} 
                  />
                </div>
                <div className="fg">
                  <label className="fl">Target Size (KB)</label>
                  <input 
                    type="number" 
                    className="fi" 
                    value={targetKB || ''} 
                    onChange={e => { setTargetKB(Number(e.target.value)); setResult(null); }} 
                  />
                </div>
                <div className="fg">
                  <label className="fl">Zoom</label>
                  <input 
                    type="range" 
                    min="1" 
                    max="3" 
                    step="0.1" 
                    value={zoom} 
                    onChange={e => setZoom(Number(e.target.value))} 
                    className="w-full accent-accent"
                  />
                </div>
              </div>
            </div>

            <div className="bg-accent/5 border border-accent/20 rounded-[14px] p-6">
              <h3 className="font-bold text-sm mb-2 flex items-center gap-2 text-accent">
                <AlertCircle className="w-4 h-4" /> Instructions
              </h3>
              <ul className="text-xs text-text-secondary space-y-2 list-disc pl-4">
                <li>Select a preset or enter custom dimensions.</li>
                <li>Drag the image to position it within the frame.</li>
                <li>Use the zoom slider if needed.</li>
                <li>Click "Apply & Preview" to see the result and file size.</li>
                <li>Download your perfectly resized image.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
