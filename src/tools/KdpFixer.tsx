import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Settings, Eye, BookOpen, Ruler, Layout, FileCheck, Loader2 } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, PDFPage } from 'pdf-lib';
import ToolLayout from '../components/tool-system/ToolLayout';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface KdpPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

interface KdpIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
}

const TRIM_SIZES = [
  { name: '6 x 9 inches', width: 6, height: 9 },
  { name: '8.5 x 11 inches', width: 8.5, height: 11 },
  { name: '8 x 10 inches', width: 8, height: 10 },
  { name: '7 x 10 inches', width: 7, height: 10 },
  { name: '5 x 8 inches', width: 5, height: 8 },
  { name: 'Custom', width: 0, height: 0 },
];

export default function KdpFixer() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<KdpPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trimSize, setTrimSize] = useState(TRIM_SIZES[0]);
  const [customWidth, setCustomWidth] = useState(6);
  const [customHeight, setCustomHeight] = useState(9);
  const [bleed, setBleed] = useState(false);
  const [margins, setMargins] = useState({ top: 0.5, bottom: 0.5, outside: 0.5, inside: 0.75 });
  const [issues, setIssues] = useState<KdpIssue[]>([]);
  const [paperType, setPaperType] = useState<'white' | 'cream' | 'color'>('white');
  const [coverTemplate, setCoverTemplate] = useState<any>(null);

  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState<string>('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setLoading(true);
    setProgress(0);
    setPages([]);
    setIssues([]);

    try {
      if (uploadedFile.type === 'application/pdf') {
        const arrayBuffer = await uploadedFile.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ 
          data: arrayBuffer,
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        }).promise;
        const numPages = pdf.numPages;
        const loadedPages: KdpPage[] = [];

        for (let i = 1; i <= Math.min(numPages, 50); i++) { // Limit to 50 for preview performance
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          if (context) {
            await (page as any).render({ canvasContext: context, viewport }).promise;
            loadedPages.push({
              canvas,
              width: viewport.width,
              height: viewport.height,
              originalWidth: viewport.width / 72, // points to inches
              originalHeight: viewport.height / 72,
            });
          }
          setProgress(Math.round((i / Math.min(numPages, 50)) * 100));
        }
        setPages(loadedPages);
        runComplianceCheck(loadedPages);
      } else if (uploadedFile.type.startsWith('image/')) {
        const img = new Image();
        img.src = URL.createObjectURL(uploadedFile);
        await new Promise((resolve) => (img.onload = resolve));

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);

        const page = {
          canvas,
          width: img.width,
          height: img.height,
          originalWidth: img.width / 96, // assume 96 DPI for screen images
          originalHeight: img.height / 96,
        };
        setPages([page]);
        runComplianceCheck([page]);
      }
    } catch (error: any) {
      const errorStr = typeof error === 'string' ? error : (error?.message || '');
      const isPasswordError = error?.name === 'PasswordException' || 
                              errorStr.toLowerCase().includes('password');
      if (!isPasswordError) {
        console.error('Error loading file:', error);
      }
      if (isPasswordError) {
        setIssues([{ type: 'error', message: 'This PDF is password protected. Please remove the password before using KDP Fixer.' }]);
      } else {
        setIssues([{ type: 'error', message: 'Failed to load file. Please ensure it is a valid PDF or image.' }]);
      }
    } finally {
      setLoading(false);
    }
  };

  const runComplianceCheck = (loadedPages: KdpPage[]) => {
    const newIssues: KdpIssue[] = [];
    const targetWidth = trimSize.width || customWidth;
    const targetHeight = trimSize.height || customHeight;

    if (loadedPages.length > 0) {
      const firstPage = loadedPages[0];
      if (Math.abs(firstPage.originalWidth - targetWidth) > 0.1 || Math.abs(firstPage.originalHeight - targetHeight) > 0.1) {
        newIssues.push({ type: 'warning', message: `Page size (${firstPage.originalWidth.toFixed(2)}" x ${firstPage.originalHeight.toFixed(2)}") does not match target trim size.` });
      }
    }

    if (!bleed) {
      newIssues.push({ type: 'info', message: 'Bleed is disabled. Ensure all content is within the trim lines.' });
    }

    setIssues(newIssues);
  };

  const generateCoverTemplate = () => {
    const pageCount = pages.length || 100;
    const width = trimSize.width || customWidth;
    const height = trimSize.height || customHeight;
    
    // Spine calculation based on KDP standards
    let spineMultiplier = 0.00225; // White paper
    if (paperType === 'cream') spineMultiplier = 0.0025;
    if (paperType === 'color') spineMultiplier = 0.00235;

    const spineWidth = pageCount * spineMultiplier;
    const bleedSize = 0.125;
    
    const totalWidth = (width * 2) + spineWidth + (bleedSize * 2);
    const totalHeight = height + (bleedSize * 2);

    setCoverTemplate({
      spineWidth,
      totalWidth,
      totalHeight,
      frontWidth: width,
      backWidth: width,
      bleedSize
    });
  };

  const fixAndDownload = async () => {
    if (!file) return;
    setLoading(true);
    setProgress(0);

    try {
      const targetWidth = (trimSize.width || customWidth) * 72; // inches to points
      const targetHeight = (trimSize.height || customHeight) * 72;
      const bleedPoints = bleed ? 0.125 * 72 : 0;

      const finalWidth = targetWidth + (bleed ? bleedPoints * 2 : 0);
      const finalHeight = targetHeight + (bleed ? bleedPoints * 2 : 0);

      const pdfDoc = await PDFDocument.create();
      const originalPdfBuffer = await file.arrayBuffer();
      const originalPdf = await PDFDocument.load(originalPdfBuffer, { ignoreEncryption: true });
      const pagesToCopy = await pdfDoc.copyPages(originalPdf, originalPdf.getPageIndices());

      for (let index = 0; index < pagesToCopy.length; index++) {
        const page = pagesToCopy[index];
        const { width, height } = page.getSize();
        const newPage = pdfDoc.addPage([finalWidth, finalHeight]);
        
        const embeddedPage = await pdfDoc.embedPage(page);
        
        // Scale and center
        const scale = Math.min(targetWidth / width, targetHeight / height);
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        
        const x = (finalWidth - scaledWidth) / 2;
        const y = (finalHeight - scaledHeight) / 2;

        newPage.drawPage(embeddedPage, {
          x,
          y,
          width: scaledWidth,
          height: scaledHeight,
        });
        
        setProgress(Math.round(((index + 1) / pagesToCopy.length) * 100));
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const fileName = `kdp_interior_${trimSize.width || customWidth}x${trimSize.height || customHeight}_fixed.pdf`;
      setDownloadUrl(url);
      setDownloadName(fileName);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      const errorStr = typeof error === 'string' ? error : (error?.message || '');
      const isPasswordError = error?.name === 'PasswordException' || 
                              errorStr.toLowerCase().includes('password');
      if (!isPasswordError) {
        console.error('Error fixing PDF:', error);
      }
      if (isPasswordError) {
        alert('Cannot process this PDF because it is password protected. Please remove the password first.');
      } else {
        alert('Error fixing PDF. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ToolLayout
      title="KDP Interior Fixer"
      description="Format your PDF interior to meet Amazon KDP specifications."
      toolId="kdp-fixer"
      acceptedFileTypes={['.pdf', 'image/jpeg', 'image/png']}
      onDownload={fixAndDownload}
      downloadUrl={downloadUrl || undefined}
      downloadFileName={downloadName}
    >
      {({ file: uploadedFile, state: toolState, onReset }) => {
        useEffect(() => {
          if (!uploadedFile) {
            setFile(null);
            setPages([]);
            setProgress(0);
            setIssues([]);
            setDownloadUrl(null);
            setDownloadName('');
            return;
          }
          if (uploadedFile && !file) {
            handleFileUpload({ target: { files: [uploadedFile as File] } } as any);
          }
        }, [uploadedFile]);

        if (toolState === 'DURING') {
          return (
            <div className="flex flex-col lg:flex-row w-full h-full bg-bg-primary overflow-hidden">
              <aside className="w-full lg:w-1/4 bg-surface border-r border-border flex flex-col h-auto lg:h-full overflow-hidden">
                <div className="sidebar-content custom-scrollbar p-6 space-y-6 overflow-y-auto">
                  <div className="space-y-4">
                    <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                      <Ruler className="w-4 h-4 text-accent" /> Trim Size & Bleed
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {TRIM_SIZES.map((size) => (
                        <button
                          key={size.name}
                          onClick={() => setTrimSize(size)}
                          className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                            trimSize.name === size.name
                              ? 'border-accent bg-accent/5 text-accent'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {size.name}
                        </button>
                      ))}
                    </div>

                    {trimSize.name === 'Custom' && (
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                          <label className="block text-[10px] font-bold text-text-muted mb-1 uppercase">Width (in)</label>
                          <input
                            type="number"
                            value={customWidth}
                            onChange={(e) => setCustomWidth(Number(e.target.value))}
                            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-text-muted mb-1 uppercase">Height (in)</label>
                          <input
                            type="number"
                            value={customHeight}
                            onChange={(e) => setCustomHeight(Number(e.target.value))}
                            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-xs"
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between p-3 bg-bg-secondary rounded-xl border border-border mt-4">
                      <div>
                        <h4 className="font-bold text-xs">Bleed Settings</h4>
                        <p className="text-[10px] text-text-muted">Add 0.125" for images that extend to the edge.</p>
                      </div>
                      <button
                        onClick={() => setBleed(!bleed)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${bleed ? 'bg-accent' : 'bg-border'}`}
                      >
                        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${bleed ? 'translate-x-5' : ''}`} />
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-border space-y-4">
                    <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                      <BookOpen className="w-4 h-4 text-accent" /> Paper & Cover
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-2">
                      {['white', 'cream', 'color'].map((type) => (
                        <button
                          key={type}
                          onClick={() => setPaperType(type as any)}
                          className={`p-2 rounded-xl border text-[10px] font-bold capitalize transition-all ${
                            paperType === type
                              ? 'border-accent bg-accent/5 text-accent'
                              : 'border-border hover:border-accent/50'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>

                    <button onClick={generateCoverTemplate} className="btn bs2 w-full text-xs py-2 mt-2">Generate Cover Template</button>
                  </div>

                  <div className="pt-6 border-t border-border space-y-4">
                    <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
                      <FileCheck className="w-4 h-4 text-accent" /> KDP Compliance
                    </h3>
                    <div className="space-y-2">
                      {issues.length === 0 ? (
                        <div className="flex items-center gap-2 text-success text-[10px] font-bold bg-success/10 p-2 rounded-lg">
                          <CheckCircle2 className="w-3 h-3" /> All checks passed!
                        </div>
                      ) : (
                        issues.map((issue, i) => (
                          <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-[10px] font-medium ${
                            issue.type === 'error' ? 'bg-error/10 text-error' : 
                            issue.type === 'warning' ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent'
                          }`}>
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{issue.message}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="p-4 border-t border-border bg-surface">
                  <button 
                    onClick={fixAndDownload} 
                    disabled={loading}
                    className="btn bp gap-2 w-full py-4 text-xs font-black uppercase tracking-widest shadow-lg shadow-accent/20 disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {loading ? `Processing ${progress}%` : 'Download Fixed PDF'}
                  </button>
                </div>
              </aside>

              <main className="flex-1 bg-bg-secondary/20 overflow-y-auto custom-scrollbar p-4 lg:p-8">
                <div className="max-w-5xl mx-auto space-y-6">
                  <div className="flex items-center justify-between bg-surface p-4 rounded-xl border border-border shadow-sm">
                    <h3 className="text-sm font-bold">Live Preview</h3>
                    <div className="flex gap-4 text-[10px] font-bold uppercase text-text-muted">
                      <span className="flex items-center gap-1"><div className="w-3 h-3 border border-error border-dashed" /> Bleed</span>
                      <span className="flex items-center gap-1"><div className="w-3 h-3 border border-accent" /> Trim</span>
                      <span className="flex items-center gap-1"><div className="w-3 h-3 border border-blue-500 border-dotted" /> Safe Margin</span>
                    </div>
                  </div>

                  {loading && (
                    <div className="flex flex-col items-center justify-center py-12 bg-surface rounded-2xl border border-border shadow-sm">
                      <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
                      <p className="text-sm font-bold text-text-primary">Processing PDF... {progress}%</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {pages.slice(0, 2).map((page, i) => (
                      <div key={i} className="space-y-2">
                        <div className="text-center text-xs font-bold text-text-muted uppercase tracking-wider">Page {i + 1} ({i % 2 === 0 ? 'Right' : 'Left'})</div>
                        <div className="relative bg-white shadow-xl mx-auto border border-border overflow-hidden rounded-sm" style={{
                          aspectRatio: `${trimSize.width || customWidth}/${trimSize.height || customHeight}`,
                          maxWidth: '100%'
                        }}>
                          <img src={page.canvas.toDataURL()} className="w-full h-full object-cover opacity-50" />
                          
                          {/* Bleed Guide */}
                          {bleed && <div className="absolute inset-0 border-4 border-error border-dashed opacity-30" />}
                          
                          {/* Trim Guide */}
                          <div className={`absolute border-2 border-accent opacity-50 ${bleed ? 'inset-[0.125in]' : 'inset-0'}`} />
                          
                          {/* Safe Margin Guide */}
                          <div className={`absolute border border-blue-500 border-dotted opacity-50 ${
                            bleed ? 'inset-[0.625in]' : 'inset-[0.5in]'
                          }`} style={{
                            marginLeft: i % 2 === 0 ? '0.75in' : '0.5in',
                            marginRight: i % 2 === 0 ? '0.5in' : '0.75in'
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {coverTemplate && (
                    <div className="bg-surface border border-border rounded-xl p-6 space-y-4 shadow-sm">
                      <h4 className="font-bold text-sm">Cover Template Dimensions</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-bg-secondary p-3 rounded-lg border border-border">
                          <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Width</div>
                          <div className="text-sm font-mono font-bold mt-1">{coverTemplate.totalWidth.toFixed(3)}"</div>
                        </div>
                        <div className="bg-bg-secondary p-3 rounded-lg border border-border">
                          <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Total Height</div>
                          <div className="text-sm font-mono font-bold mt-1">{coverTemplate.totalHeight.toFixed(3)}"</div>
                        </div>
                        <div className="bg-bg-secondary p-3 rounded-lg border border-border">
                          <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Spine Width</div>
                          <div className="text-sm font-mono font-bold mt-1">{coverTemplate.spineWidth.toFixed(3)}"</div>
                        </div>
                        <div className="bg-bg-secondary p-3 rounded-lg border border-border">
                          <div className="text-[10px] text-text-muted uppercase font-bold tracking-wider">Bleed</div>
                          <div className="text-sm font-mono font-bold mt-1">{coverTemplate.bleedSize}"</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </main>
            </div>
          );
        }
        return null;
      }}
    </ToolLayout>
  );
}
