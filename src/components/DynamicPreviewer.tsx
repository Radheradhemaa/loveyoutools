import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, FileText, FileImage, FileCode, X, File as FileIcon } from 'lucide-react';

type FileType = 'image' | 'pdf' | 'text' | 'svg' | 'unknown';

interface PreviewData {
  url: string;
  type: FileType;
  name: string;
  size: number;
  textContent?: string;
}

export default function DynamicPreviewer() {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (previewData?.url && previewData.type !== 'text') {
        URL.revokeObjectURL(previewData.url);
      }
    };
  }, [previewData]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = async (file: File) => {
    setIsLoading(true);
    
    // Revoke previous URL if exists
    if (previewData?.url && previewData.type !== 'text') {
      URL.revokeObjectURL(previewData.url);
    }

    const fileType = determineFileType(file);
    
    try {
      if (fileType === 'text') {
        const text = await file.text();
        setPreviewData({
          url: '',
          type: 'text',
          name: file.name,
          size: file.size,
          textContent: text,
        });
      } else {
        const url = URL.createObjectURL(file);
        setPreviewData({
          url,
          type: fileType,
          name: file.name,
          size: file.size,
        });
      }
    } catch (error) {
      console.error("Error processing file:", error);
      alert("Failed to process the file.");
    } finally {
      setIsLoading(false);
    }
  };

  const determineFileType = (file: File): FileType => {
    if (file.type.startsWith('image/svg')) return 'svg';
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('text/') || file.name.endsWith('.json') || file.name.endsWith('.md')) return 'text';
    return 'unknown';
  };

  const clearPreview = () => {
    setPreviewData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const renderIcon = (type: FileType) => {
    switch (type) {
      case 'image': return <FileImage className="w-5 h-5 text-blue-500" />;
      case 'svg': return <FileCode className="w-5 h-5 text-purple-500" />;
      case 'pdf': return <FileText className="w-5 h-5 text-red-500" />;
      case 'text': return <FileText className="w-5 h-5 text-emerald-500" />;
      default: return <FileIcon className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <section className="w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 font-sans">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900 mb-2">Dynamic File Previewer</h1>
        <p className="text-gray-500">Upload an image, SVG, PDF, or text file to see the responsive preview.</p>
      </div>

      <motion.div 
        layout
        className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mx-auto w-fit min-w-[300px] max-w-full"
      >
        <AnimatePresence mode="wait">
          {!previewData ? (
            <motion.div
              key="upload-zone"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`p-12 text-center transition-colors duration-200 w-[600px] max-w-full ${
                isDragging ? 'bg-blue-50 border-2 border-dashed border-blue-400' : 'bg-gray-50/50 border-2 border-dashed border-transparent'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="mx-auto w-16 h-16 mb-4 rounded-full bg-white shadow-sm flex items-center justify-center border border-gray-100">
                <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-1">Drag & drop your file here</h3>
              <p className="text-sm text-gray-500 mb-6">Supports JPG, PNG, SVG, PDF, and Text files</p>
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
                accept="image/*,.pdf,text/*,.json,.md,.csv"
                aria-label="File upload"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center px-6 py-2.5 text-sm font-medium text-white bg-gray-900 rounded-xl hover:bg-gray-800 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
                disabled={isLoading}
              >
                {isLoading ? 'Processing...' : 'Browse Files'}
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="preview-zone"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
              className="flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-white rounded-lg shadow-sm border border-gray-100">
                    {renderIcon(previewData.type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{previewData.name}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(previewData.size)}</p>
                  </div>
                </div>
                <button
                  onClick={clearPreview}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                  aria-label="Close preview"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Dynamic Content Area */}
              <motion.figure 
                layout
                className="relative bg-gray-100/50 overflow-hidden flex items-center justify-center min-h-[200px] max-w-full"
              >
                {previewData.type === 'image' || previewData.type === 'svg' ? (
                  <motion.img
                    layout
                    src={previewData.url}
                    alt={`Preview of ${previewData.name}`}
                    className="max-w-full h-auto max-h-[75vh] object-contain block"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  />
                ) : previewData.type === 'pdf' ? (
                  <motion.object
                    layout
                    data={previewData.url}
                    type="application/pdf"
                    className="w-[1200px] max-w-full h-[90vh]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="p-8 text-center">
                      <p className="text-gray-600 mb-4">Your browser does not support embedded PDFs.</p>
                      <a 
                        href={previewData.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Download PDF to view
                      </a>
                    </div>
                  </motion.object>
                ) : previewData.type === 'text' ? (
                  <motion.div 
                    layout
                    className="w-[1200px] max-w-full max-h-[90vh] overflow-y-auto p-6 bg-white text-left"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                  >
                    <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap break-words">
                      {previewData.textContent}
                    </pre>
                  </motion.div>
                ) : (
                  <div className="p-12 text-center">
                    <FileIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Preview not available for this file type.</p>
                  </div>
                )}
              </motion.figure>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
