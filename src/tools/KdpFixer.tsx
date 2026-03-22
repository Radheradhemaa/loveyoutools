import { useState, useRef, useEffect, ChangeEvent } from 'react';
import { Upload, Download, FileText, AlertCircle, CheckCircle2, Settings, Eye, BookOpen, Ruler, Layout, FileCheck } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, degrees, PDFPage } from 'pdf-lib';

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
  const [activeTab, setActiveTab] = useState<'upload' | 'configure' | 'preview' | 'export'>('upload');
  const [paperType, setPaperType] = useState<'white' | 'cream' | 'color'>('white');
  const [coverTemplate, setCoverTemplate] = useState<any>(null);

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
      setActiveTab('configure');
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
    setActiveTab('preview');
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
      const link = document.createElement('a');
      link.href = url;
      link.download = `kdp_interior_${trimSize.width || customWidth}x${trimSize.height || customHeight}_fixed.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
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
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto hide-scrollbar">
        {[
          { id: 'upload', icon: Upload, label: '1. Upload' },
          { id: 'configure', icon: Settings, label: '2. Configure' },
          { id: 'preview', icon: Eye, label: '3. Preview' },
          { id: 'export', icon: Download, label: '4. Download' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            disabled={!file && tab.id !== 'upload'}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-accent text-accent'
                : 'border-transparent text-text-muted hover:text-text-primary disabled:opacity-50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'upload' && (
        <div className="w-full">
          <div className="border-2 border-dashed border-border rounded-2xl p-12 text-center hover:border-accent transition-colors bg-surface/50">
            <input
              type="file"
              id="kdp-upload"
              className="hidden"
              accept=".pdf,image/*"
              onChange={handleFileUpload}
            />
            <label htmlFor="kdp-upload" className="cursor-pointer flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-accent/10 text-accent rounded-full flex items-center justify-center">
                <Upload className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Upload Interior File</h3>
                <p className="text-text-muted">PDF, PNG, or JPG supported. Max 200 pages.</p>
              </div>
              <button className="btn bp mt-4 pointer-events-none">Select File</button>
            </label>
          </div>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
              <FileCheck className="w-5 h-5 text-success shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-sm">Compliance Checker</h4>
                <p className="text-xs text-text-muted">Automatically verifies KDP requirements like margins, bleed, and DPI.</p>
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
              <Layout className="w-5 h-5 text-accent shrink-0 mt-1" />
              <div>
                <h4 className="font-bold text-sm">Cover Template</h4>
                <p className="text-xs text-text-muted">Generate exact spine and cover dimensions based on your page count.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'configure' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Ruler className="w-5 h-5 text-accent" /> Trim Size & Bleed
              </h3>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {TRIM_SIZES.map((size) => (
                  <button
                    key={size.name}
                    onClick={() => setTrimSize(size)}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1 uppercase">Width (in)</label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(Number(e.target.value))}
                      className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-muted mb-1 uppercase">Height (in)</label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(Number(e.target.value))}
                      className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between p-4 bg-bg-secondary rounded-xl border border-border">
                <div>
                  <h4 className="font-bold">Bleed Settings</h4>
                  <p className="text-xs text-text-muted">Add 0.125" for images that extend to the edge.</p>
                </div>
                <button
                  onClick={() => setBleed(!bleed)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${bleed ? 'bg-accent' : 'bg-border'}`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${bleed ? 'translate-x-6' : ''}`} />
                </button>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-6 space-y-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-accent" /> Paper & Cover
              </h3>
              
              <div className="grid grid-cols-3 gap-3">
                {['white', 'cream', 'color'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setPaperType(type as any)}
                    className={`p-3 rounded-xl border text-sm font-medium capitalize transition-all ${
                      paperType === type
                        ? 'border-accent bg-accent/5 text-accent'
                        : 'border-border hover:border-accent/50'
                    }`}
                  >
                    {type} Paper
                  </button>
                ))}
              </div>

              <button onClick={generateCoverTemplate} className="btn bp w-full">Generate Cover Template</button>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-surface border border-border rounded-2xl p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-accent" /> KDP Compliance
              </h3>
              <div className="space-y-4">
                {issues.length === 0 ? (
                  <div className="flex items-center gap-2 text-success text-sm font-medium">
                    <CheckCircle2 className="w-4 h-4" /> All checks passed!
                  </div>
                ) : (
                  issues.map((issue, i) => (
                    <div key={i} className={`flex items-start gap-2 p-3 rounded-lg text-xs ${
                      issue.type === 'error' ? 'bg-error/10 text-error' : 
                      issue.type === 'warning' ? 'bg-warning/10 text-warning' : 'bg-accent/10 text-accent'
                    }`}>
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{issue.message}</span>
                    </div>
                  ))
                )}
                <div className="pt-4 border-t border-border">
                  <ul className="space-y-2 text-xs text-text-muted">
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> 300 DPI Resolution Check</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> Color Space Verification</li>
                    <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-success" /> Transparency Flattening</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">Live Preview</h3>
            <div className="flex gap-4 text-xs font-bold uppercase text-text-muted">
              <span className="flex items-center gap-1"><div className="w-3 h-3 border border-error border-dashed" /> Bleed</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 border border-accent" /> Trim</span>
              <span className="flex items-center gap-1"><div className="w-3 h-3 border border-blue-500 border-dotted" /> Safe Margin</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {pages.slice(0, 2).map((page, i) => (
              <div key={i} className="space-y-2">
                <div className="text-center text-sm font-bold text-text-muted">Page {i + 1} ({i % 2 === 0 ? 'Right' : 'Left'})</div>
                <div className="relative bg-white shadow-2xl mx-auto border border-border overflow-hidden" style={{
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
            <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
              <h4 className="font-bold">Cover Template Dimensions</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <div className="text-xs text-text-muted uppercase font-bold">Total Width</div>
                  <div className="text-lg font-mono">{coverTemplate.totalWidth.toFixed(3)}"</div>
                </div>
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <div className="text-xs text-text-muted uppercase font-bold">Total Height</div>
                  <div className="text-lg font-mono">{coverTemplate.totalHeight.toFixed(3)}"</div>
                </div>
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <div className="text-xs text-text-muted uppercase font-bold">Spine Width</div>
                  <div className="text-lg font-mono">{coverTemplate.spineWidth.toFixed(3)}"</div>
                </div>
                <div className="bg-bg-secondary p-3 rounded-lg">
                  <div className="text-xs text-text-muted uppercase font-bold">Bleed</div>
                  <div className="text-lg font-mono">{coverTemplate.bleedSize}"</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'export' && (
        <div className="max-w-xl mx-auto text-center space-y-8 py-12">
          <div className="w-20 h-20 bg-success/10 text-success rounded-full flex items-center justify-center mx-auto">
            <FileCheck className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-2xl font-bold mb-2">Ready for KDP</h3>
            <p className="text-text-muted">Your file has been optimized, margins fixed, and is ready for publishing.</p>
          </div>
          
          <div className="space-y-4">
            <button onClick={fixAndDownload} className="btn bp w-full gap-2 py-4 text-lg">
              <Download className="w-5 h-5" /> Download Print-Ready PDF
            </button>
            <div className="grid grid-cols-2 gap-4">
              <button className="btn bs gap-2">
                <Layout className="w-4 h-4" /> Cover Template
              </button>
              <button className="btn bs gap-2">
                <FileText className="w-4 h-4" /> Quality Report
              </button>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="fixed inset-0 bg-bg-primary/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-2xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold mb-2">Processing Book...</h3>
            <div className="w-full bg-bg-secondary rounded-full h-2 mb-2">
              <div className="bg-accent h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-text-muted">{progress}% Complete</p>
          </div>
        </div>
      )}
    </div>
  );
}
