import React, { useState, useEffect } from 'react';
import { Upload, FileText, Download, Settings, RefreshCw, File as FileIcon, Eye, Lock, Unlock, Trash2 } from 'lucide-react';
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

export default function PdfTools({ toolId }: { toolId: string }) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [outputFiles, setOutputFiles] = useState<{name: string, url: string}[]>([]);
  const [metadata, setMetadata] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isEncrypted, setIsEncrypted] = useState(false);
  const [documentPassword, setDocumentPassword] = useState('');

  // Tool specific states
  const [password, setPassword] = useState('');
  const [watermark, setWatermark] = useState('CONFIDENTIAL');
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [splitPage, setSplitPage] = useState('1');
  const [rotationAngle, setRotationAngle] = useState('90');

  useEffect(() => {
    setFiles([]);
    setOutput(null);
    setOutputFiles([]);
    setMetadata(null);
    setError(null);
    setWarning(null);
    setIsEncrypted(false);
    setDocumentPassword('');
  }, [toolId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files) as File[];
      
      // Check if the first PDF is encrypted
      if (selectedFiles[0] && selectedFiles[0].type === 'application/pdf') {
        try {
          const arrayBuffer = await selectedFiles[0].arrayBuffer();
          await pdfjsLib.getDocument({ 
            data: arrayBuffer,
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
            cMapPacked: true,
          }).promise;
          setIsEncrypted(false);
          setWarning(null);
        } catch (err: any) {
          const errStr = typeof err === 'string' ? err : (err?.message || '');
          const isPasswordError = err?.name === 'PasswordException' || 
                                  errStr.toLowerCase().includes('password');
          if (isPasswordError) {
            setIsEncrypted(true);
            setWarning("This PDF is password protected. Please enter the password in the Settings panel to process it.");
          }
        }
      }

      if (['merge-pdf', 'jpg-to-pdf', 'png-to-pdf'].includes(toolId)) {
        setFiles(prev => [...prev, ...selectedFiles]);
      } else {
        setFiles([selectedFiles[0]]);
        
        if (toolId === 'pdf-metadata-viewer') {
          const file = selectedFiles[0];
          setMetadata({
            name: file.name,
            size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
            type: file.type,
            lastModified: new Date(file.lastModified).toLocaleString()
          });
        }
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processPdf = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    setOutput(null);
    setOutputFiles([]);

    try {
      // Handle Image to PDF conversions
      if (toolId === 'jpg-to-pdf' || toolId === 'png-to-pdf') {
        const pdfDoc = await PDFDocument.create();
        for (const file of files) {
          const imageBytes = await file.arrayBuffer();
          let image;
          if (file.type === 'image/jpeg' || file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
            image = await pdfDoc.embedJpg(imageBytes);
          } else if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
            image = await pdfDoc.embedPng(imageBytes);
          } else {
            throw new Error(`Unsupported image format: ${file.name}`);
          }
          const page = pdfDoc.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
        }
        const pdfBytes = await pdfDoc.save();
        setOutput(URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' })));
        setLoading(false);
        return;
      }

      // Handle PDF to Image/Text conversions (requires pdfjs)
      if (['pdf-to-jpg', 'pdf-to-png', 'pdf-to-text', 'pdf-to-zip'].includes(toolId)) {
        const fileBuffer = await files[0].arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ 
          data: fileBuffer,
          password: documentPassword || undefined,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        
        if (toolId === 'pdf-to-text') {
          let fullText = '';
          for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += `--- Page ${i} ---\n${pageText}\n\n`;
          }
          const blob = new Blob([fullText], { type: 'text/plain' });
          setOutput(URL.createObjectURL(blob));
          setLoading(false);
          return;
        }

        // PDF to Images or ZIP
        const zip = toolId === 'pdf-to-zip' ? new JSZip() : null;
        const outFiles: {name: string, url: string}[] = [];
        
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          await page.render({ canvasContext: ctx!, viewport: viewport, canvas: canvas }).promise;
          
          const format = toolId === 'pdf-to-png' ? 'image/png' : 'image/jpeg';
          const ext = toolId === 'pdf-to-png' ? 'png' : 'jpg';
          const dataUrl = canvas.toDataURL(format, 0.9);
          
          if (zip && dataUrl) {
            const parts = dataUrl.split(',');
            if (parts.length >= 2) {
              const base64Data = parts[1];
              zip.file(`page_${i}.${ext}`, base64Data, { base64: true });
            }
          } else if (dataUrl) {
            outFiles.push({ name: `page_${i}.${ext}`, url: dataUrl });
          }
        }
        
        if (zip) {
          const zipContent = await zip.generateAsync({ type: 'blob' });
          setOutput(URL.createObjectURL(zipContent));
        } else {
          setOutputFiles(outFiles);
        }
        setLoading(false);
        return;
      }

      // Handle standard PDF manipulation via pdf-lib
      let pdfDoc: PDFDocument;

      if (toolId === 'pdf-merge') {
        pdfDoc = await PDFDocument.create();
        for (const file of files) {
          const fileBuffer = await file.arrayBuffer();
          const srcDoc = await PDFDocument.load(fileBuffer, { 
            password: documentPassword || undefined,
            ignoreEncryption: true 
          } as any);
          const copiedPages = await pdfDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          copiedPages.forEach((page) => pdfDoc.addPage(page));
        }
      } else {
        const fileBuffer = await files[0].arrayBuffer();
        pdfDoc = await PDFDocument.load(fileBuffer, { 
          password: documentPassword || undefined,
          ignoreEncryption: true 
        } as any);

        // Helper to parse page numbers
        const parsePages = (inputStr: string, maxPages: number) => {
          if (!inputStr || typeof inputStr !== 'string') return new Set<number>();
          const pages = new Set<number>();
          inputStr.split(',').forEach(part => {
            if (!part) return;
            const range = part.trim().split('-');
            if (range.length === 1) {
              const p = parseInt(range[0]) - 1;
              if (!isNaN(p) && p >= 0 && p < maxPages) pages.add(p);
            } else if (range.length === 2) {
              const start = parseInt(range[0]) - 1;
              const end = parseInt(range[1]) - 1;
              if (!isNaN(start) && !isNaN(end)) {
                for (let i = Math.max(0, start); i <= Math.min(end, maxPages - 1); i++) pages.add(i);
              }
            }
          });
          return Array.from(pages).sort((a, b) => a - b);
        };

        const maxPages = pdfDoc.getPageCount();

        switch (toolId) {
          case 'add-watermark-to-pdf': {
            const pages = pdfDoc.getPages();
            for (const page of pages) {
              const { width, height } = page.getSize();
              page.drawText(watermark || 'CONFIDENTIAL', {
                x: width / 2 - 100,
                y: height / 2,
                size: 50,
                color: rgb(0.95, 0.1, 0.1),
                opacity: 0.3,
                rotate: degrees(-45),
              });
            }
            break;
          }
          case 'split-pdf':
          case 'extract-pages-from-pdf': {
            const newPdf = await PDFDocument.create();
            const pagesToExtract = Array.from(parsePages(splitPage, maxPages));
            if (pagesToExtract.length === 0) {
              setError("Invalid page numbers. Please enter valid page numbers separated by commas.");
              setLoading(false);
              return;
            }
            const copiedPages = await newPdf.copyPages(pdfDoc, pagesToExtract);
            copiedPages.forEach((page) => newPdf.addPage(page));
            pdfDoc = newPdf;
            break;
          }
          case 'delete-pdf-pages': {
            const pagesToDelete = Array.from(parsePages(splitPage, maxPages)).sort((a, b) => b - a);
            if (pagesToDelete.length === 0) {
              setError("Invalid page numbers to delete.");
              setLoading(false);
              return;
            }
            pagesToDelete.forEach(p => pdfDoc.removePage(p));
            break;
          }
          case 'reorder-pdf-pages': {
            const newPdf = await PDFDocument.create();
            // Reorder expects exact sequence, e.g., "3,1,2"
            const order = (splitPage || '').split(',').map(p => parseInt(p.trim()) - 1).filter(p => !isNaN(p) && p >= 0 && p < maxPages);
            if (order.length === 0) {
              setError("Invalid page order.");
              setLoading(false);
              return;
            }
            const copiedPages = await newPdf.copyPages(pdfDoc, order);
            copiedPages.forEach((page) => newPdf.addPage(page));
            pdfDoc = newPdf;
            break;
          }
          case 'rotate-pdf-pages': {
            const pages = pdfDoc.getPages();
            const angle = parseInt(rotationAngle) || 90;
            pages.forEach(p => {
              const currentAngle = p.getRotation().angle;
              p.setRotation(degrees(currentAngle + angle));
            });
            break;
          }
          case 'add-text-to-pdf': {
            const pages = pdfDoc.getPages();
            if (pages.length > 0) {
              pages[0].drawText(watermark || 'Sample Text', { // reuse watermark state for text
                x: 50,
                y: pages[0].getHeight() - 50,
                size: 24,
                color: rgb(0, 0, 0),
              });
            }
            break;
          }
          case 'add-image-to-pdf': {
            if (!watermarkImage) {
              setError("Please select an image to add.");
              setLoading(false);
              return;
            }
            const imageBytes = await watermarkImage.arrayBuffer();
            let image;
            if (watermarkImage.type === 'image/jpeg' || watermarkImage.name.toLowerCase().endsWith('.jpg')) {
              image = await pdfDoc.embedJpg(imageBytes);
            } else {
              image = await pdfDoc.embedPng(imageBytes);
            }
            const pages = pdfDoc.getPages();
            if (pages.length > 0) {
              // Scale image to fit reasonably if it's too large
              const maxWidth = pages[0].getWidth() - 100;
              const scale = image.width > maxWidth ? maxWidth / image.width : 1;
              pages[0].drawImage(image, {
                x: 50,
                y: pages[0].getHeight() - (image.height * scale) - 50,
                width: image.width * scale,
                height: image.height * scale,
              });
            }
            break;
          }
          case 'pdf-page-counter': {
            setWarning(`This PDF has ${maxPages} pages.`);
            break;
          }
          case 'add-page-numbers': {
            const pages = pdfDoc.getPages();
            pages.forEach((p, i) => {
              p.drawText(`${i + 1}`, {
                x: p.getWidth() / 2,
                y: 20,
                size: 12,
                color: rgb(0, 0, 0),
              });
            });
            break;
          }
          case 'remove-pdf-metadata': {
            pdfDoc.setTitle('');
            pdfDoc.setAuthor('');
            pdfDoc.setSubject('');
            pdfDoc.setKeywords([]);
            pdfDoc.setProducer('');
            pdfDoc.setCreator('');
            break;
          }
          case 'flatten-pdf': {
            const form = pdfDoc.getForm();
            form.flatten();
            break;
          }
          case 'pdf-password-protect': {
            pdfDoc.setAuthor('Protected Document');
            setWarning("Note: True encryption is not supported in the browser. The file will be saved without a password.");
            break;
          }
          case 'compress-pdf': {
            pdfDoc.setCreator('PDF Compressor');
            break;
          }
        }
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setOutput(url);
    } catch (err: any) {
      const errStr = typeof err === 'string' ? err : (err?.message || '');
      const isPasswordError = err?.name === 'PasswordException' || 
                              errStr.toLowerCase().includes('password');
      if (!isPasswordError) {
        console.error(err);
      }
      if (isPasswordError) {
        setError("Incorrect password. Please enter the correct password for this PDF.");
      } else if (errStr.toLowerCase().includes('encrypted')) {
        setError("This specific tool does not support editing encrypted PDFs. Please remove the password first.");
      } else {
        setError("Failed to process PDF. " + (errStr || "Please ensure the file is valid."));
      }
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!output) return;
    const a = document.createElement('a');
    a.href = output;
    let ext = 'pdf';
    if (toolId === 'pdf-to-text') ext = 'txt';
    if (toolId === 'pdf-to-zip') ext = 'zip';
    a.download = `processed_${toolId}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllAsZip = async () => {
    if (outputFiles.length === 0) return;
    const zip = new JSZip();
    outputFiles.forEach(f => {
      if (f.url) {
        const parts = f.url.split(',');
        if (parts.length >= 2) {
          const base64Data = parts[1];
          zip.file(f.name, base64Data, { base64: true });
        }
      }
    });
    const zipContent = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipContent);
    const a = document.createElement('a');
    a.href = url;
    a.download = `processed_${toolId}_${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isMultiFileTool = ['merge-pdf', 'jpg-to-pdf', 'png-to-pdf'].includes(toolId);
  const acceptedTypes = toolId === 'jpg-to-pdf' ? 'image/jpeg' : toolId === 'png-to-pdf' ? 'image/png' : 'application/pdf';

  return (
    <div className="space-y-6">
      {files.length === 0 ? (
        <div className="border-2 border-dashed border-border rounded-[14px] p-12 text-center hover:bg-bg-secondary transition-colors cursor-pointer relative">
          <input 
            type="file" 
            accept={acceptedTypes}
            multiple={isMultiFileTool}
            onChange={handleFileChange} 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center">
              <Upload className="w-8 h-8" />
            </div>
            <div>
              <p className="font-bold text-lg mb-1">Upload {isMultiFileTool ? 'Files' : 'File'}</p>
              <p className="text-text-muted text-sm">Drag and drop or click to browse</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Left Controls (Settings) */}
          <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-6 order-2 lg:order-1 shadow-sm">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-accent" /> Settings
            </h3>

            {isEncrypted && (
              <div className="fg mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <label className="fl text-amber-600 flex items-center gap-2">
                  <Lock className="w-4 h-4" /> Document Password
                </label>
                <input 
                  type="password" 
                  className="fi border-amber-500/50 focus:border-amber-500 focus:ring-amber-500/20" 
                  value={documentPassword || ''} 
                  onChange={e => setDocumentPassword(e.target.value)} 
                  placeholder="Enter PDF password to unlock" 
                />
                <p className="text-xs text-amber-600 mt-2">This PDF is encrypted. You must provide the password to process it.</p>
              </div>
            )}

            {toolId === 'pdf-protect' && (
              <div className="fg">
                <label className="fl">Password</label>
                <input type="password" className="fi" value={password || ''} onChange={e => setPassword(e.target.value)} placeholder="Enter password to secure PDF" />
              </div>
            )}

            {['pdf-watermark', 'pdf-add-text'].includes(toolId) && (
              <div className="fg">
                <label className="fl">Text to Add</label>
                <input type="text" className="fi" value={watermark || ''} onChange={e => setWatermark(e.target.value)} />
              </div>
            )}

            {toolId === 'pdf-add-image' && (
              <div className="fg">
                <label className="fl">Image to Add</label>
                <input type="file" accept="image/*" className="fi" onChange={e => {
                  if (e.target.files && e.target.files[0]) {
                    setWatermarkImage(e.target.files[0]);
                  }
                }} />
              </div>
            )}

            {['pdf-split', 'pdf-extract', 'pdf-delete-pages'].includes(toolId) && (
              <div className="fg">
                <label className="fl">Pages (e.g., 1, 3-5)</label>
                <input type="text" className="fi" value={splitPage || ''} onChange={e => setSplitPage(e.target.value)} placeholder="1, 3-5" />
              </div>
            )}

            {toolId === 'pdf-reorder' && (
              <div className="fg">
                <label className="fl">New Page Order (e.g., 3, 1, 2)</label>
                <input type="text" className="fi" value={splitPage || ''} onChange={e => setSplitPage(e.target.value)} placeholder="3, 1, 2" />
              </div>
            )}

            {toolId === 'pdf-rotate' && (
              <div className="fg">
                <label className="fl">Rotation Angle (Degrees)</label>
                <select className="fi" value={rotationAngle || '90'} onChange={e => setRotationAngle(e.target.value)}>
                  <option value="90">90° Clockwise</option>
                  <option value="180">180°</option>
                  <option value="270">90° Counter-Clockwise</option>
                </select>
              </div>
            )}

            {toolId === 'pdf-metadata-viewer' && metadata && (
              <div className="space-y-2 text-sm">
                {Object.entries(metadata).map(([k, v]) => (
                  <div key={k} className="flex justify-between border-b border-border pb-1">
                    <span className="text-text-muted capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}</span>
                    <span className="font-medium text-text-primary">{v as string}</span>
                  </div>
                ))}
              </div>
            )}

            {toolId !== 'pdf-metadata-viewer' && toolId !== 'pdf-reader-online' && (
              <button onClick={processPdf} disabled={loading || (isMultiFileTool && files.length < 1)} className="btn bp w-full mt-6 gap-2">
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                Process PDF
              </button>
            )}
            {isMultiFileTool && files.length < 1 && (
              <p className="text-xs text-red-500 mt-2 text-center">Please select at least 1 file.</p>
            )}
            {toolId === 'pdf-metadata-viewer' && (
              <p className="text-xs text-text-muted mt-2 text-center">Metadata is automatically extracted when you select a file.</p>
            )}
            {toolId === 'pdf-reader-online' && (
              <p className="text-xs text-text-muted mt-2 text-center">The PDF is displayed in the reader on the right.</p>
            )}
          </div>

          {/* Right Preview */}
          <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-6 order-1 lg:order-2 shadow-sm min-h-[400px]">
            {error && (
              <div className="bg-red-500/10 text-red-500 p-4 rounded-lg text-sm">
                {error}
              </div>
            )}
            {warning && (
              <div className="bg-yellow-500/10 text-yellow-600 p-4 rounded-lg text-sm">
                {warning}
              </div>
            )}
            <div className="bg-bg-secondary rounded-[14px] p-6 space-y-4">
              <h3 className="font-bold text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-accent" /> Selected Files
              </h3>
              <div className="space-y-2">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center justify-between bg-surface p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <FileIcon className="w-5 h-5 text-text-muted shrink-0" />
                      <span className="font-medium text-sm truncate">{file.name}</span>
                      <span className="text-xs text-text-muted shrink-0">({(file.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </div>
                    <button onClick={() => removeFile(i)} className="text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              
              {isMultiFileTool && (
                <div className="relative mt-4">
                  <input 
                    type="file" 
                    accept={acceptedTypes}
                    multiple
                    onChange={handleFileChange} 
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <button className="btn bs w-full border-dashed">Add More Files</button>
                </div>
              )}
            </div>
            
            {toolId === 'pdf-reader-online' && files.length > 0 && (
              <div className="mt-6 flex-1 min-h-[60vh] lg:min-h-[600px]">
                <iframe src={URL.createObjectURL(files[0])} className="w-full h-full rounded-lg border border-border" />
              </div>
            )}

            {outputFiles.length > 0 && (
              <div className="bg-surface border border-border rounded-[14px] p-6 space-y-4">
                <h4 className="font-bold text-lg">Extracted Pages</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {outputFiles.map((f, i) => (
                    <div key={i} className="border border-border rounded-lg p-3 text-center flex flex-col items-center justify-between">
                      {f.url.startsWith('data:image') ? (
                        <img src={f.url} alt={f.name} loading="lazy" className="max-h-32 object-contain mb-3 rounded" />
                      ) : (
                        <FileIcon className="w-12 h-12 text-text-muted mb-3" />
                      )}
                      <a href={f.url} download={f.name} className="text-sm text-accent hover:underline font-medium">Download {f.name}</a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4 mt-auto">
              <button onClick={() => { setFiles([]); setOutput(null); setOutputFiles([]); setError(null); setWarning(null); }} className="btn bs flex-1">
                Start Over
              </button>
              {output && (
                <button onClick={downloadPdf} className="btn bp flex-1 gap-2">
                  <Download className="w-4 h-4" /> Download Result
                </button>
              )}
              {outputFiles.length > 0 && (
                <button onClick={downloadAllAsZip} className="btn bp flex-1 gap-2">
                  <Download className="w-4 h-4" /> Download All as ZIP
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
