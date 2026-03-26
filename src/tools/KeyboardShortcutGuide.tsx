import React, { useState, useEffect, useMemo } from 'react';
import { Search, Monitor, Command, FileSpreadsheet, Code, Chrome, Play, RotateCcw, Copy, CheckCircle2, XCircle, Award, LayoutDashboard, Type, Youtube, Terminal } from 'lucide-react';

type Shortcut = {
  id: string;
  action: string;
  windows: string;
  mac: string;
  category: string;
};

const SHORTCUTS: Shortcut[] = [
  // General / OS Basics
  { id: '1', action: 'Copy', windows: 'Ctrl+C', mac: 'Cmd+C', category: 'General' },
  { id: '2', action: 'Paste', windows: 'Ctrl+V', mac: 'Cmd+V', category: 'General' },
  { id: '3', action: 'Cut', windows: 'Ctrl+X', mac: 'Cmd+X', category: 'General' },
  { id: '4', action: 'Undo', windows: 'Ctrl+Z', mac: 'Cmd+Z', category: 'General' },
  { id: '5', action: 'Redo', windows: 'Ctrl+Y', mac: 'Cmd+Shift+Z', category: 'General' },
  { id: '6', action: 'Select All', windows: 'Ctrl+A', mac: 'Cmd+A', category: 'General' },
  { id: '7', action: 'Save', windows: 'Ctrl+S', mac: 'Cmd+S', category: 'General' },
  { id: '8', action: 'Find', windows: 'Ctrl+F', mac: 'Cmd+F', category: 'General' },
  { id: '9', action: 'Print', windows: 'Ctrl+P', mac: 'Cmd+P', category: 'General' },

  // Advanced OS (Lesser Known)
  { id: '10', action: 'Clipboard History', windows: 'Win+V', mac: 'Cmd+Shift+V', category: 'General' },
  { id: '11', action: 'Emoji Picker', windows: 'Win+.', mac: 'Cmd+Ctrl+Space', category: 'General' },
  { id: '12', action: 'Lock Screen', windows: 'Win+L', mac: 'Cmd+Ctrl+Q', category: 'General' },
  { id: '13', action: 'Task Manager / Force Quit', windows: 'Ctrl+Shift+Esc', mac: 'Cmd+Option+Esc', category: 'General' },
  { id: '14', action: 'Permanent Delete', windows: 'Shift+Delete', mac: 'Cmd+Option+Delete', category: 'General' },
  { id: '15', action: 'Rename File', windows: 'F2', mac: 'Return', category: 'General' },
  { id: '16', action: 'Show Desktop', windows: 'Win+D', mac: 'F11', category: 'General' },
  { id: '17', action: 'New Virtual Desktop', windows: 'Win+Ctrl+D', mac: 'Ctrl+Up', category: 'General' },
  { id: '18', action: 'Switch Virtual Desktop', windows: 'Win+Ctrl+Arrow', mac: 'Ctrl+Arrow', category: 'General' },
  { id: '19', action: 'Close Virtual Desktop', windows: 'Win+Ctrl+F4', mac: 'Option+Click (X)', category: 'General' },
  { id: '20', action: 'Snip & Sketch / Screenshot', windows: 'Win+Shift+S', mac: 'Cmd+Shift+4', category: 'General' },
  { id: '21', action: 'Open File Properties', windows: 'Alt+Enter', mac: 'Cmd+I', category: 'General' },
  { id: '22', action: 'Minimize All Windows', windows: 'Win+M', mac: 'Cmd+Option+M', category: 'General' },
  { id: '23', action: 'Quick Link Menu', windows: 'Win+X', mac: 'N/A', category: 'General' },
  { id: '24', action: 'Spotlight / Windows Search', windows: 'Win+S', mac: 'Cmd+Space', category: 'General' },

  // Text Editing (Pro Level)
  { id: '25', action: 'Delete Word Behind', windows: 'Ctrl+Backspace', mac: 'Option+Delete', category: 'Text Editing' },
  { id: '26', action: 'Delete Word Ahead', windows: 'Ctrl+Delete', mac: 'Fn+Option+Delete', category: 'Text Editing' },
  { id: '27', action: 'Jump to Start of Line', windows: 'Home', mac: 'Cmd+Left', category: 'Text Editing' },
  { id: '28', action: 'Jump to End of Line', windows: 'End', mac: 'Cmd+Right', category: 'Text Editing' },
  { id: '29', action: 'Jump Word by Word', windows: 'Ctrl+Arrow', mac: 'Option+Arrow', category: 'Text Editing' },
  { id: '30', action: 'Select Word by Word', windows: 'Ctrl+Shift+Arrow', mac: 'Option+Shift+Arrow', category: 'Text Editing' },
  { id: '31', action: 'Select to Start of Line', windows: 'Shift+Home', mac: 'Cmd+Shift+Left', category: 'Text Editing' },
  { id: '32', action: 'Select to End of Line', windows: 'Shift+End', mac: 'Cmd+Shift+Right', category: 'Text Editing' },

  // Chrome / Browser
  { id: '33', action: 'New Tab', windows: 'Ctrl+T', mac: 'Cmd+T', category: 'Browser' },
  { id: '34', action: 'Close Tab', windows: 'Ctrl+W', mac: 'Cmd+W', category: 'Browser' },
  { id: '35', action: 'Reopen Closed Tab', windows: 'Ctrl+Shift+T', mac: 'Cmd+Shift+T', category: 'Browser' },
  { id: '36', action: 'Next Tab', windows: 'Ctrl+Tab', mac: 'Cmd+Option+Right', category: 'Browser' },
  { id: '37', action: 'Previous Tab', windows: 'Ctrl+Shift+Tab', mac: 'Cmd+Option+Left', category: 'Browser' },
  { id: '38', action: 'Focus Address Bar', windows: 'Ctrl+L', mac: 'Cmd+L', category: 'Browser' },
  { id: '39', action: 'Clear Browsing Data', windows: 'Ctrl+Shift+Delete', mac: 'Cmd+Shift+Delete', category: 'Browser' },
  { id: '40', action: 'Incognito Mode', windows: 'Ctrl+Shift+N', mac: 'Cmd+Shift+N', category: 'Browser' },
  { id: '41', action: 'Hard Reload (Clear Cache)', windows: 'Ctrl+Shift+R', mac: 'Cmd+Shift+R', category: 'Browser' },
  { id: '42', action: 'Jump to Specific Tab', windows: 'Ctrl+1-8', mac: 'Cmd+1-8', category: 'Browser' },
  { id: '43', action: 'Jump to Last Tab', windows: 'Ctrl+9', mac: 'Cmd+9', category: 'Browser' },
  { id: '44', action: 'History', windows: 'Ctrl+H', mac: 'Cmd+Y', category: 'Browser' },
  { id: '45', action: 'Downloads', windows: 'Ctrl+J', mac: 'Cmd+Shift+J', category: 'Browser' },
  { id: '46', action: 'Developer Tools', windows: 'Ctrl+Shift+I', mac: 'Cmd+Option+I', category: 'Browser' },
  { id: '47', action: 'Scroll Down Page', windows: 'Space', mac: 'Space', category: 'Browser' },
  { id: '48', action: 'Scroll Up Page', windows: 'Shift+Space', mac: 'Shift+Space', category: 'Browser' },
  
  // VS Code
  { id: '49', action: 'Command Palette', windows: 'Ctrl+Shift+P', mac: 'Cmd+Shift+P', category: 'VS Code' },
  { id: '50', action: 'Quick Open', windows: 'Ctrl+P', mac: 'Cmd+P', category: 'VS Code' },
  { id: '51', action: 'Toggle Sidebar', windows: 'Ctrl+B', mac: 'Cmd+B', category: 'VS Code' },
  { id: '52', action: 'Toggle Terminal', windows: 'Ctrl+`', mac: 'Cmd+`', category: 'VS Code' },
  { id: '53', action: 'Format Document', windows: 'Shift+Alt+F', mac: 'Shift+Option+F', category: 'VS Code' },
  { id: '54', action: 'Duplicate Line Down', windows: 'Shift+Alt+Down', mac: 'Shift+Option+Down', category: 'VS Code' },
  { id: '55', action: 'Move Line Up', windows: 'Alt+Up', mac: 'Option+Up', category: 'VS Code' },
  { id: '56', action: 'Move Line Down', windows: 'Alt+Down', mac: 'Option+Down', category: 'VS Code' },
  { id: '57', action: 'Select Next Occurrence', windows: 'Ctrl+D', mac: 'Cmd+D', category: 'VS Code' },
  { id: '58', action: 'Select All Occurrences', windows: 'Ctrl+Shift+L', mac: 'Cmd+Shift+L', category: 'VS Code' },
  { id: '59', action: 'Toggle Line Comment', windows: 'Ctrl+/', mac: 'Cmd+/', category: 'VS Code' },
  { id: '60', action: 'Multi-Cursor Click', windows: 'Alt+Click', mac: 'Option+Click', category: 'VS Code' },

  // Excel
  { id: '61', action: 'Edit Cell', windows: 'F2', mac: 'Ctrl+U', category: 'Excel' },
  { id: '62', action: 'Insert Sum', windows: 'Alt+=', mac: 'Cmd+Shift+T', category: 'Excel' },
  { id: '63', action: 'Format Cells', windows: 'Ctrl+1', mac: 'Cmd+1', category: 'Excel' },
  { id: '64', action: 'Insert Table', windows: 'Ctrl+T', mac: 'Cmd+T', category: 'Excel' },
  { id: '65', action: 'Current Date', windows: 'Ctrl+;', mac: 'Ctrl+;', category: 'Excel' },
  { id: '66', action: 'Current Time', windows: 'Ctrl+Shift+;', mac: 'Cmd+;', category: 'Excel' },
  { id: '67', action: 'Show Formulas', windows: 'Ctrl+`', mac: 'Cmd+`', category: 'Excel' },
  { id: '68', action: 'Repeat Last Action', windows: 'F4', mac: 'Cmd+Y', category: 'Excel' },
  { id: '69', action: 'Toggle Filters', windows: 'Ctrl+Shift+L', mac: 'Cmd+Shift+F', category: 'Excel' },
  { id: '70', action: 'New Line in Cell', windows: 'Alt+Enter', mac: 'Option+Return', category: 'Excel' },
  { id: '71', action: 'Select Entire Column', windows: 'Ctrl+Space', mac: 'Ctrl+Space', category: 'Excel' },
  { id: '72', action: 'Select Entire Row', windows: 'Shift+Space', mac: 'Shift+Space', category: 'Excel' },

  // YouTube
  { id: '73', action: 'Play / Pause', windows: 'K', mac: 'K', category: 'YouTube' },
  { id: '74', action: 'Rewind 10 Seconds', windows: 'J', mac: 'J', category: 'YouTube' },
  { id: '75', action: 'Fast Forward 10 Seconds', windows: 'L', mac: 'L', category: 'YouTube' },
  { id: '76', action: 'Mute / Unmute', windows: 'M', mac: 'M', category: 'YouTube' },
  { id: '77', action: 'Fullscreen', windows: 'F', mac: 'F', category: 'YouTube' },
  { id: '78', action: 'Toggle Captions', windows: 'C', mac: 'C', category: 'YouTube' },
  { id: '79', action: 'Increase Playback Speed', windows: 'Shift+.', mac: 'Shift+.', category: 'YouTube' },
  { id: '80', action: 'Decrease Playback Speed', windows: 'Shift+,', mac: 'Shift+,', category: 'YouTube' },
  { id: '81', action: 'Seek to Specific %', windows: '0-9', mac: '0-9', category: 'YouTube' },
  { id: '82', action: 'Next Frame (when paused)', windows: '.', mac: '.', category: 'YouTube' },
  { id: '83', action: 'Previous Frame (when paused)', windows: ',', mac: ',', category: 'YouTube' },

  // Terminal / Command Prompt
  { id: '84', action: 'Clear Terminal', windows: 'Ctrl+L', mac: 'Cmd+K', category: 'Terminal' },
  { id: '85', action: 'Cancel Current Command', windows: 'Ctrl+C', mac: 'Ctrl+C', category: 'Terminal' },
  { id: '86', action: 'Exit Terminal', windows: 'Ctrl+D', mac: 'Ctrl+D', category: 'Terminal' },
  { id: '87', action: 'Search Command History', windows: 'Ctrl+R', mac: 'Ctrl+R', category: 'Terminal' },
  { id: '88', action: 'Move to Start of Line', windows: 'Ctrl+A', mac: 'Ctrl+A', category: 'Terminal' },
  { id: '89', action: 'Move to End of Line', windows: 'Ctrl+E', mac: 'Ctrl+E', category: 'Terminal' },
];

const CATEGORIES = [
  { id: 'All', icon: <Search className="w-4 h-4" /> },
  { id: 'General', icon: <Monitor className="w-4 h-4" /> },
  { id: 'Text Editing', icon: <Type className="w-4 h-4" /> },
  { id: 'Browser', icon: <Chrome className="w-4 h-4" /> },
  { id: 'VS Code', icon: <Code className="w-4 h-4" /> },
  { id: 'Excel', icon: <FileSpreadsheet className="w-4 h-4" /> },
  { id: 'YouTube', icon: <Youtube className="w-4 h-4" /> },
  { id: 'Terminal', icon: <Terminal className="w-4 h-4" /> },
];

export default function KeyboardShortcutGuide() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  
  // Practice Mode State
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [practiceOs, setPracticeOs] = useState<'windows' | 'mac'>('windows');
  const [currentPractice, setCurrentPractice] = useState<Shortcut | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [pressedKeysStr, setPressedKeysStr] = useState<string>('');
  const [toast, setToast] = useState<string | null>(null);

  const filteredShortcuts = useMemo(() => {
    return SHORTCUTS.filter(s => {
      const matchesSearch = s.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.windows.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            s.mac.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [searchQuery, selectedCategory]);

  const startPractice = () => {
    setIsPracticeMode(true);
    setScore(0);
    setStreak(0);
    setFeedback(null);
    setPressedKeysStr('');
    nextQuestion();
  };

  const nextQuestion = () => {
    const validShortcuts = SHORTCUTS.filter(s => {
      const target = practiceOs === 'windows' ? s.windows : s.mac;
      return target !== 'N/A';
    });
    const randomIdx = Math.floor(Math.random() * validShortcuts.length);
    setCurrentPractice(validShortcuts[randomIdx]);
    setFeedback(null);
    setPressedKeysStr('');
  };

  const stopPractice = () => {
    setIsPracticeMode(false);
    setCurrentPractice(null);
  };

  useEffect(() => {
    if (!isPracticeMode || !currentPractice) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault(); // Prevent browser defaults (e.g., Ctrl+S, Ctrl+F)

      const keys: string[] = [];
      if (e.ctrlKey) keys.push('Ctrl');
      if (e.metaKey) keys.push('Cmd');
      if (e.altKey) keys.push(practiceOs === 'mac' ? 'Option' : 'Alt');
      if (e.shiftKey) keys.push('Shift');

      // Ignore if only modifier is pressed
      if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
        setPressedKeysStr(keys.join('+'));
        return;
      }

      // Handle main key
      let mainKey = e.key.toUpperCase();
      if (e.code.startsWith('Key')) mainKey = e.code.replace('Key', '');
      if (e.code.startsWith('Digit')) mainKey = e.code.replace('Digit', '');
      if (e.key === ' ') mainKey = 'Space';
      if (e.key === 'ArrowUp') mainKey = 'Up';
      if (e.key === 'ArrowDown') mainKey = 'Down';
      if (e.key === 'ArrowLeft') mainKey = 'Left';
      if (e.key === 'ArrowRight') mainKey = 'Right';

      keys.push(mainKey);
      const pressedCombo = keys.join('+');
      setPressedKeysStr(pressedCombo);

      const targetCombo = practiceOs === 'windows' ? currentPractice.windows : currentPractice.mac;
      
      // Normalize target for comparison
      const normalizedTarget = targetCombo.toUpperCase().replace('META', 'CMD');
      const normalizedPressed = pressedCombo.toUpperCase();

      if (normalizedPressed === normalizedTarget) {
        setFeedback('correct');
        setScore(s => s + 10);
        setStreak(s => s + 1);
        showToast('Correct! +10 points');
        setTimeout(nextQuestion, 1000);
      } else {
        setFeedback('wrong');
        setStreak(0);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (feedback === 'correct') return;
      // Reset display if all keys released
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setTimeout(() => {
          if (feedback !== 'correct') setPressedKeysStr('');
        }, 500);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPracticeMode, currentPractice, practiceOs, feedback]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  };

  return (
    <div className="space-y-6">
      <div className="max-w-[1200px] mx-auto w-full bg-[#f5f3ef] dark:bg-surface rounded-2xl overflow-hidden shadow-sm border border-border">
        
        {/* Top Search Bar */}
        <div className="bg-white dark:bg-surface-light p-4 border-b border-border sticky top-0 z-10 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search shortcuts (e.g., Copy, Ctrl+C)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#f5f3ef] dark:bg-surface rounded-xl border-none focus:ring-2 focus:ring-[#e8501a] text-[#18120e] dark:text-text outline-none transition-all"
            />
          </div>
          
          <button
            onClick={isPracticeMode ? stopPractice : startPractice}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold transition-all ${
              isPracticeMode 
                ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-surface dark:text-text dark:hover:bg-border' 
                : 'bg-[#e8501a] text-white hover:bg-[#d04313] shadow-lg shadow-[#e8501a]/20'
            }`}
          >
            {isPracticeMode ? <RotateCcw className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {isPracticeMode ? 'Exit Practice' : 'Start Practice'}
          </button>
        </div>

        <div className="flex flex-col md:flex-row min-h-[600px]">
          
          {/* Sidebar Categories */}
          {!isPracticeMode && (
            <div className="w-full md:w-64 bg-white dark:bg-surface-light border-r border-border p-4 flex flex-row md:flex-col gap-2 overflow-x-auto">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all whitespace-nowrap ${
                    selectedCategory === cat.id 
                      ? 'bg-[#e8501a]/10 text-[#e8501a]' 
                      : 'text-text-muted hover:bg-[#f5f3ef] dark:hover:bg-surface'
                  }`}
                >
                  {cat.icon}
                  {cat.id}
                </button>
              ))}
            </div>
          )}

          {/* Main Content Area */}
          <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
            
            {isPracticeMode ? (
              <div className="max-w-2xl mx-auto bg-white dark:bg-surface-light rounded-2xl p-8 shadow-sm border border-border text-center animate-in fade-in slide-in-from-bottom-4">
                
                <div className="flex justify-between items-center mb-8">
                  <div className="flex gap-2 bg-[#f5f3ef] dark:bg-surface p-1 rounded-lg">
                    <button 
                      onClick={() => setPracticeOs('windows')}
                      className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${practiceOs === 'windows' ? 'bg-white dark:bg-surface-light shadow-sm text-[#e8501a]' : 'text-text-muted'}`}
                    >
                      Windows
                    </button>
                    <button 
                      onClick={() => setPracticeOs('mac')}
                      className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${practiceOs === 'mac' ? 'bg-white dark:bg-surface-light shadow-sm text-[#e8501a]' : 'text-text-muted'}`}
                    >
                      Mac
                    </button>
                  </div>
                  
                  <div className="flex gap-4 text-sm font-bold">
                    <div className="flex items-center gap-1 text-text-muted">
                      <Award className="w-4 h-4 text-[#e8501a]" /> Score: {score}
                    </div>
                    <div className="flex items-center gap-1 text-text-muted">
                      🔥 Streak: {streak}
                    </div>
                  </div>
                </div>

                <div className="mb-12">
                  <h2 className="text-text-muted text-sm font-bold uppercase tracking-wider mb-2">Press shortcut for</h2>
                  <div className="text-3xl sm:text-4xl font-black text-[#18120e] dark:text-text">
                    {currentPractice?.action}
                  </div>
                  <div className="text-sm text-text-muted mt-2">
                    Category: {currentPractice?.category}
                  </div>
                </div>

                <div className="min-h-[120px] flex flex-col items-center justify-center">
                  <div className="flex flex-wrap justify-center gap-2 mb-4">
                    {pressedKeysStr ? (
                      pressedKeysStr.split('+').map((key, i) => (
                        <kbd key={i} className="px-4 py-3 bg-[#f5f3ef] dark:bg-surface border-2 border-border rounded-xl text-xl font-bold text-[#18120e] dark:text-text shadow-sm">
                          {key}
                        </kbd>
                      ))
                    ) : (
                      <div className="text-text-muted animate-pulse">Waiting for input...</div>
                    )}
                  </div>

                  {feedback === 'correct' && (
                    <div className="flex items-center gap-2 text-green-600 font-bold animate-in zoom-in">
                      <CheckCircle2 className="w-5 h-5" /> Correct!
                    </div>
                  )}
                  {feedback === 'wrong' && (
                    <div className="flex items-center gap-2 text-red-500 font-bold animate-in shake">
                      <XCircle className="w-5 h-5" /> Try Again
                    </div>
                  )}
                </div>

                <div className="mt-8 pt-8 border-t border-border flex justify-between items-center">
                  <button onClick={stopPractice} className="text-text-muted hover:text-[#18120e] dark:hover:text-text font-medium text-sm transition-colors">
                    End Practice
                  </button>
                  <button onClick={nextQuestion} className="px-4 py-2 bg-[#f5f3ef] dark:bg-surface text-[#18120e] dark:text-text rounded-lg font-bold hover:bg-gray-200 dark:hover:bg-border transition-colors">
                    Skip Question
                  </button>
                </div>

              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredShortcuts.map((shortcut) => (
                  <div key={shortcut.id} className="bg-white dark:bg-surface-light p-5 rounded-2xl border border-border hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-[#18120e] dark:text-text text-lg">{shortcut.action}</h3>
                        <span className="text-xs font-medium text-text-muted bg-[#f5f3ef] dark:bg-surface px-2 py-1 rounded-md mt-1 inline-block">
                          {shortcut.category}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-text-muted flex items-center gap-1"><Monitor className="w-3 h-3"/> Windows</span>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {shortcut.windows.split('+').map((key, idx, arr) => (
                            <React.Fragment key={idx}>
                              <kbd className="px-2 py-1 bg-[#f5f3ef] dark:bg-surface border border-border rounded text-xs font-mono font-bold text-[#18120e] dark:text-text shadow-sm whitespace-nowrap">
                                {key}
                              </kbd>
                              {idx < arr.length - 1 && <span className="text-text-muted text-xs font-bold">+</span>}
                            </React.Fragment>
                          ))}
                          <button onClick={() => copyToClipboard(shortcut.windows)} className="p-1 ml-1 text-text-muted hover:text-[#e8501a] opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-text-muted flex items-center gap-1"><Command className="w-3 h-3"/> Mac</span>
                        <div className="flex items-center gap-1 flex-wrap justify-end">
                          {shortcut.mac.split('+').map((key, idx, arr) => (
                            <React.Fragment key={idx}>
                              <kbd className="px-2 py-1 bg-[#f5f3ef] dark:bg-surface border border-border rounded text-xs font-mono font-bold text-[#18120e] dark:text-text shadow-sm whitespace-nowrap">
                                {key}
                              </kbd>
                              {idx < arr.length - 1 && <span className="text-text-muted text-xs font-bold">+</span>}
                            </React.Fragment>
                          ))}
                          <button onClick={() => copyToClipboard(shortcut.mac)} className="p-1 ml-1 text-text-muted hover:text-[#e8501a] opacity-0 group-hover:opacity-100 transition-opacity">
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                
                {filteredShortcuts.length === 0 && (
                  <div className="col-span-full py-12 text-center text-text-muted">
                    <Search className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No shortcuts found for "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-[#18120e] text-white px-4 py-2 rounded-lg shadow-xl font-medium animate-in slide-in-from-bottom-4 z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
