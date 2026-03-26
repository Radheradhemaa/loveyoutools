import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useFocusMode } from '../../contexts/FocusModeContext';
import Toolbar from './Toolbar';
import UploadBox from './UploadBox';
import Suggestions from './Suggestions';
import PreviewPanel from './PreviewPanel';

export type ToolState = 'BEFORE' | 'DURING' | 'AFTER';

interface ToolLayoutProps {
  title: string;
  description: string;
  toolId: string;
  acceptedFileTypes?: string[];
  multiple?: boolean;
  children?: (props: { 
    file: File | File[] | null; 
    state: ToolState; 
    onComplete: () => void;
    onReset: () => void;
  }) => React.ReactNode;
  renderPreview?: (file: File | File[] | null) => React.ReactNode;
  renderToolbar?: (props: { fileName: string; onBack: () => void; onComplete: () => void }) => React.ReactNode;
  renderAfter?: (props: { onDownload?: () => void; downloadUrl?: string; downloadFileName?: string; onReset: () => void }) => React.ReactNode;
  onDownload?: () => void;
  downloadUrl?: string;
  downloadFileName?: string;
  faq?: { q: string; a: string }[];
}

function RenderPropWrapper({ render, ...props }: any) {
  if (typeof render === 'function') {
    return <>{render(props)}</>;
  }
  return <>{render}</>;
}

export default function ToolLayout({ 
  title, 
  description, 
  toolId,
  acceptedFileTypes,
  multiple = false,
  children,
  renderPreview,
  renderToolbar,
  renderAfter,
  onDownload,
  downloadUrl,
  downloadFileName,
  faq
}: ToolLayoutProps) {
  const [state, setState] = useState<ToolState>('BEFORE');
  const [file, setFile] = useState<File | File[] | null>(null);
  const { setIsFocusMode } = useFocusMode();

  useEffect(() => {
    if (state === 'DURING') {
      setIsFocusMode(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setIsFocusMode(false);
    }
  }, [state, setIsFocusMode]);

  const handleUpload = (uploadedFile: File | File[]) => {
    setFile(uploadedFile);
    setState('DURING');
  };

  const handleComplete = () => {
    setState('AFTER');
    if (onDownload) {
      onDownload();
    }
  };

  const handleReset = () => {
    setFile(null);
    setState('BEFORE');
  };

  const fileName = Array.isArray(file) ? `${file.length} files` : file?.name || '';

  return (
    <div className={`min-h-screen flex flex-col ${state === 'DURING' ? 'fixed inset-0 z-[100] bg-bg-primary overflow-hidden' : ''}`}>
      <AnimatePresence mode="wait">
        {state === 'BEFORE' && (
          <motion.div
            key="before"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-4xl mx-auto px-4 py-8 w-full"
          >
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-text-primary mb-3">
                {title}
              </h1>
              <p className="text-lg text-text-muted max-w-2xl mx-auto">
                {description}
              </p>
            </div>

            <UploadBox 
              onUpload={handleUpload} 
              acceptedTypes={acceptedFileTypes} 
              multiple={multiple} 
            />

            <Suggestions toolId={toolId} faq={faq} />
          </motion.div>
        )}

        {state === 'DURING' && (
          <motion.div
            key="during"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-bg-primary flex flex-col h-[100dvh] lg:h-screen overflow-hidden overscroll-none"
          >
            {renderToolbar ? <RenderPropWrapper render={renderToolbar} fileName={fileName} onBack={handleReset} onComplete={handleComplete} /> : (
              <Toolbar 
                fileName={fileName} 
                onBack={handleReset}
                onComplete={handleComplete}
              />
            )}
            <div className="flex-1 relative overflow-y-auto lg:overflow-hidden bg-bg-secondary/30">
              {children ? <RenderPropWrapper render={children} file={file} state={state} onComplete={handleComplete} onReset={handleReset} /> : (
                renderPreview ? <RenderPropWrapper render={renderPreview} file={file} /> : <PreviewPanel file={file} />
              )}
            </div>
          </motion.div>
        )}

        {state === 'AFTER' && (
          <motion.div
            key="after"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-4xl mx-auto px-4 py-8 w-full text-center"
          >
            {renderAfter ? <RenderPropWrapper render={renderAfter} onDownload={onDownload} downloadUrl={downloadUrl} downloadFileName={downloadFileName} onReset={handleReset} /> : (
              <div className="bg-surface border border-border rounded-3xl p-12 shadow-2xl mb-12">
                <div className="w-20 h-20 bg-accent/10 text-accent rounded-full flex items-center justify-center mx-auto mb-6">
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-3xl font-black text-text-primary mb-4">Processing Complete!</h2>
                <p className="text-text-muted mb-8">Your file is ready for download.</p>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {downloadUrl ? (
                    <a 
                      href={downloadUrl}
                      download={downloadFileName || 'download'}
                      className="btn bp px-12 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 w-full sm:w-auto inline-flex items-center justify-center"
                    >
                      Download File
                    </a>
                  ) : (
                    <button 
                      onClick={onDownload}
                      className="btn bp px-12 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-accent/20 w-full sm:w-auto"
                    >
                      Download File
                    </button>
                  )}
                  <button 
                    onClick={handleReset}
                    className="btn bs px-12 py-4 rounded-2xl text-lg font-bold w-full sm:w-auto"
                  >
                    Edit Another
                  </button>
                </div>
              </div>
            )}

            <Suggestions toolId={toolId} showFullGrid={true} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
