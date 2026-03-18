import React from 'react';
import { ChevronLeft, Download, CheckCircle, File, MoreVertical, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface ToolbarProps {
  fileName: string;
  onBack: () => void;
  onComplete: () => void;
}

export default function Toolbar({ fileName, onBack, onComplete }: ToolbarProps) {
  return (
    <header className="sticky top-0 z-[120] bg-surface/80 backdrop-blur-md border-b border-border h-16 sm:h-20 flex items-center justify-between px-4 sm:px-8 shadow-sm">
      <div className="flex items-center gap-4 sm:gap-6">
        <button 
          onClick={onBack}
          className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary group"
          aria-label="Back to Upload"
        >
          <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
        </button>
        
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-accent/10 text-accent rounded-xl flex items-center justify-center shrink-0">
            <File className="w-5 h-5" />
          </div>
          <div className="hidden sm:block">
            <h2 className="text-sm font-black text-text-primary tracking-tight truncate max-w-[200px] md:max-w-md">
              {fileName}
            </h2>
            <p className="text-[10px] font-bold text-accent uppercase tracking-widest">
              Editing Mode
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        <button className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary hidden sm:block">
          <MoreVertical className="w-5 h-5" />
        </button>
        
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onComplete}
          className="btn bp px-6 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-accent/20 font-bold"
        >
          <CheckCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Finish & Download</span>
          <span className="sm:hidden">Finish</span>
        </motion.button>
        
        <button 
          onClick={onBack}
          className="p-2 hover:bg-bg-secondary rounded-xl transition-colors text-text-secondary sm:hidden"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
