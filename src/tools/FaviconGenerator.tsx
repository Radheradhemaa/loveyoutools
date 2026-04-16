import React, { useState, useRef } from 'react';
import { Upload, Download, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

const SIZES = [16, 32, 48, 64, 128, 256];

export default function FaviconGenerator() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageSrc(event.target?.result as string);
      setError(null);
      setSuccess(false);
    };
    reader.onerror = () => {
      setError('Failed to read the image file.');
    };
    reader.readAsDataURL(file);
  };

  const generateFavicons = async () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(false);

    try {
      const img = new Image();
      img.src = imageSrc;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const pngBlobs: { size: number; blob: Blob }[] = [];

      for (const size of SIZES) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get canvas context');

        // Clear with transparent background
        ctx.clearRect(0, 0, size, size);

        // Calculate dimensions to maintain aspect ratio and center
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (size - w) / 2;
        const y = (size - h) / 2;

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        ctx.drawImage(img, x, y, w, h);

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error(`Failed to generate PNG for size ${size}x${size}`);
        
        pngBlobs.push({ size, blob });
      }

      // Download PNGs
      for (const { size, blob } of pngBlobs) {
        downloadBlob(blob, `favicon-${size}x${size}.png`);
        await new Promise(r => setTimeout(r, 100)); // Small delay
      }

      // Generate ICO file
      const icoBlob = await createIcoFromPngs(pngBlobs);
      downloadBlob(icoBlob, 'favicon.ico');

      setSuccess(true);
    } catch (err: any) {
      console.error('Favicon generation error:', err);
      setError(err.message || 'Failed to generate favicons.');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const createIcoFromPngs = async (pngBlobs: { size: number; blob: Blob }[]): Promise<Blob> => {
    const buffers = await Promise.all(pngBlobs.map(async ({ size, blob }) => {
      return { size, buffer: await blob.arrayBuffer() };
    }));

    const numImages = buffers.length;
    const headerSize = 6;
    const directorySize = 16 * numImages;
    
    let totalSize = headerSize + directorySize;
    for (const { buffer } of buffers) {
      totalSize += buffer.byteLength;
    }

    const icoBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(icoBuffer);
    const uint8View = new Uint8Array(icoBuffer);

    // Header
    view.setUint16(0, 0, true); // Reserved
    view.setUint16(2, 1, true); // Type (1 = ICO)
    view.setUint16(4, numImages, true); // Image count

    // Directory entries and Image Data
    let dirOffset = 6;
    let dataOffset = headerSize + directorySize;

    for (const { size, buffer } of buffers) {
      // Width (0 means 256)
      view.setUint8(dirOffset, size === 256 ? 0 : size);
      // Height (0 means 256)
      view.setUint8(dirOffset + 1, size === 256 ? 0 : size);
      // Color count (0 = >= 256 colors)
      view.setUint8(dirOffset + 2, 0);
      // Reserved
      view.setUint8(dirOffset + 3, 0);
      // Color planes
      view.setUint16(dirOffset + 4, 1, true);
      // Bits per pixel
      view.setUint16(dirOffset + 6, 32, true);
      // Image data size
      view.setUint32(dirOffset + 8, buffer.byteLength, true);
      // Image data offset
      view.setUint32(dirOffset + 12, dataOffset, true);

      // Copy image data
      uint8View.set(new Uint8Array(buffer), dataOffset);

      dirOffset += 16;
      dataOffset += buffer.byteLength;
    }

    return new Blob([icoBuffer], { type: 'image/x-icon' });
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-gray-100">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Favicon Generator</h2>
        <p className="text-gray-600">Upload an image to generate pixel-perfect multi-size favicons (PNG & ICO).</p>
      </div>

      {!imageSrc ? (
        <div 
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-accent hover:bg-accent/5 transition-colors cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-4">
            <Upload className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Upload your logo</h3>
          <p className="text-sm text-gray-500">PNG, JPG, SVG up to 10MB</p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row gap-8 items-center justify-center bg-gray-50 p-8 rounded-xl border border-gray-100">
            <div className="text-center">
              <p className="text-sm font-medium text-gray-500 mb-4">Original Image</p>
              <div className="w-48 h-48 bg-white rounded-lg shadow-sm border border-gray-200 flex items-center justify-center p-4 overflow-hidden">
                <img src={imageSrc} alt="Original" className="max-w-full max-h-full object-contain" />
              </div>
            </div>
            
            <div className="hidden md:block text-gray-300">
              <RefreshCw className="w-8 h-8" />
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-gray-500 mb-4">Favicon Previews</p>
              <div className="flex gap-4 items-end justify-center bg-white p-4 rounded-lg shadow-sm border border-gray-200 h-48">
                {[64, 32, 16].map(size => (
                  <div key={size} className="flex flex-col items-center gap-2">
                    <div 
                      className="border border-gray-200 flex items-center justify-center overflow-hidden"
                      style={{ width: size, height: size }}
                    >
                      <img src={imageSrc} alt={`${size}x${size}`} className="w-full h-full object-contain" />
                    </div>
                    <span className="text-xs text-gray-400">{size}px</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-50 text-green-600 p-4 rounded-lg flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Success! Your favicons have been generated.</p>
                <p className="text-sm mt-1">Check your downloads folder for the PNG and ICO files.</p>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => {
                setImageSrc(null);
                setSuccess(false);
                setError(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
              disabled={isProcessing}
            >
              Upload New Image
            </button>
            <button
              onClick={generateFavicons}
              disabled={isProcessing}
              className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/90 font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  Download Favicons
                </>
              )}
            </button>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800">
            <p className="font-medium mb-1">What you will get:</p>
            <ul className="list-disc list-inside space-y-1 text-blue-700">
              <li>A multi-resolution <strong>favicon.ico</strong> file (contains 16x16, 32x32, 48x48, 64x64, 128x128, 256x256)</li>
              <li>Individual <strong>PNG</strong> files for all sizes</li>
              <li>Perfect square aspect ratio with transparent background</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
