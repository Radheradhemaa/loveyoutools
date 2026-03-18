import React, { useRef, useState } from 'react';
import { Upload, File, X, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UploadBoxProps {
  onUpload: (file: File | File[]) => void;
  acceptedTypes?: string[];
  multiple?: boolean;
}

export default function UploadBox({ onUpload, acceptedTypes, multiple = false }: UploadBoxProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    const selectedFiles = Array.from(files);
    
    // Basic validation
    if (acceptedTypes) {
      const invalidFiles = selectedFiles.filter(file => {
        const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
        return !acceptedTypes.includes(extension) && !acceptedTypes.includes(file.type);
      });
      
      if (invalidFiles.length > 0) {
        setError(`Invalid file type. Please upload: ${acceptedTypes.join(', ')}`);
        return;
      }
    }

    setError(null);
    onUpload(multiple ? selectedFiles : selectedFiles[0]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <motion.div
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative group cursor-pointer
          border-4 border-dashed rounded-[40px] p-12 sm:p-20
          flex flex-col items-center justify-center text-center
          transition-all duration-500
          ${isDragging 
            ? 'border-accent bg-accent/5 scale-[1.02] shadow-2xl shadow-accent/10' 
            : 'border-border bg-surface hover:border-accent/50 hover:bg-bg-secondary/50'
          }
        `}
      >
        <input
          type="file"
          ref={inputRef}
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          accept={acceptedTypes?.join(',')}
          multiple={multiple}
        />

        <div className={`
          w-24 h-24 rounded-3xl mb-8 flex items-center justify-center
          transition-all duration-500 transform group-hover:scale-110 group-hover:rotate-3
          ${isDragging ? 'bg-accent text-white rotate-6' : 'bg-bg-secondary text-accent'}
        `}>
          <Upload className="w-12 h-12" />
        </div>

        <h3 className="text-2xl sm:text-3xl font-black text-text-primary mb-4 tracking-tight">
          {isDragging ? 'Drop it here!' : 'Select or Drop Files'}
        </h3>
        <p className="text-text-muted text-lg max-w-sm mx-auto leading-relaxed">
          {multiple 
            ? 'Upload one or more files to get started' 
            : 'Click to browse or drag and drop your file here'
          }
        </p>

        <div className="mt-10 flex items-center gap-3 px-6 py-3 bg-bg-secondary rounded-full border border-border group-hover:border-accent/30 transition-colors">
          <File className="w-5 h-5 text-accent" />
          <span className="text-sm font-bold text-text-secondary">
            {acceptedTypes ? `Supports: ${acceptedTypes.join(', ').toUpperCase()}` : 'All files supported'}
          </span>
        </div>

        {/* Decorative elements */}
        <div className="absolute top-8 left-8 w-2 h-2 rounded-full bg-accent/20" />
        <div className="absolute bottom-8 right-8 w-2 h-2 rounded-full bg-accent/20" />
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl flex items-center gap-3 text-red-600 dark:text-red-400"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p className="text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-800/30 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
