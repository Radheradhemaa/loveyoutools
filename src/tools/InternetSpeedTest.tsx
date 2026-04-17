import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wifi, 
  ArrowDown, 
  ArrowUp, 
  Activity, 
  RefreshCw, 
  Globe, 
  Server, 
  Info, 
  Zap, 
  ShieldCheck, 
  AlertCircle
} from 'lucide-react';

// Configuration
const TEST_DURATION = 8000; // ms per phase
const DOWNLOAD_URLS = [
  'https://speed.cloudflare.com/__down?bytes=25000000',
  'https://fastly.picsum.photos/id/20/5000/5000.jpg',
  'https://fastly.picsum.photos/id/30/5000/5000.jpg'
];
const UPLOAD_URLS = [
  'https://speed.cloudflare.com/__up',
  'https://httpbin.org/post'
];
const PING_URL = 'https://ip-api.com/json';
const API_FALLBACKS = [
  'https://ipapi.co/json/',
  'https://api.ipify.org?format=json'
];

interface SpeedMetrics {
  download: number; // Mbps
  upload: number;   // Mbps
  ping: number;     // ms
  jitter: number;   // ms
}

interface TestProgress {
  phase: 'idle' | 'preparing' | 'ping' | 'download' | 'upload' | 'complete';
  progress: number; // 0 to 100
  currentSpeed: number; // Current instantaneous speed
}

export default function InternetSpeedTest() {
  const [metrics, setMetrics] = useState<SpeedMetrics>({
    download: 0,
    upload: 0,
    ping: 0,
    jitter: 0
  });
  const [progress, setProgress] = useState<TestProgress>({
    phase: 'idle',
    progress: 0,
    currentSpeed: 0
  });
  const [history, setHistory] = useState<number[]>([]);
  const [clientInfo, setClientInfo] = useState<{ ip: string; isp: string; location: string }>({
    ip: 'Detecting...',
    isp: 'Detecting...',
    location: 'Detecting...'
  });
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch client info on mount
  useEffect(() => {
    const fetchClientInfo = async () => {
      try {
        // Try primary API (ip-api.com)
        const response = await fetch(PING_URL);
        const data = await response.json();
        
        if (data && data.status !== 'fail') {
          setClientInfo({
            ip: data.query || 'Unknown',
            isp: data.isp || 'Unknown',
            location: (data.city && data.country) ? `${data.city}, ${data.country}` : 'Unknown'
          });
          return;
        }
        throw new Error('Primary API failed');
      } catch (err) {
        console.warn('Primary IP API failed, trying fallback...', err);
        
        try {
          // Try ipapi.co fallback
          const response = await fetch(API_FALLBACKS[0]);
          const data = await response.json();
          
          if (data && !data.error) {
            setClientInfo({
              ip: data.ip || 'Unknown',
              isp: data.org || 'Unknown',
              location: (data.city && data.country_name) ? `${data.city}, ${data.country_name}` : 'Unknown'
            });
            return;
          }
          throw new Error('Secondary API failed');
        } catch (err2) {
          console.warn('Secondary IP API failed, trying basic IP...', err2);
          
          try {
            // Try very basic ipify fallback
            const response = await fetch(API_FALLBACKS[1]);
            const data = await response.json();
            
            if (data && data.ip) {
              setClientInfo(prev => ({
                ...prev,
                ip: data.ip,
                isp: 'Unknown Provider',
                location: 'Unknown Location'
              }));
              return;
            }
          } catch (err3) {
            console.error('All IP APIs failed', err3);
          }
        }
      }
      
      setClientInfo({
        ip: 'Not Detected',
        isp: 'Not Detected',
        location: 'Not Detected'
      });
    };

    fetchClientInfo();
  }, []);

  const runPingTest = async (): Promise<{ ping: number; jitter: number }> => {
    const pings: number[] = [];
    for (let i = 0; i < 5; i++) {
       if (abortControllerRef.current?.signal.aborted) break;
      const start = performance.now();
      try {
        // Use a simple fetch with small response for ping
        const response = await fetch(PING_URL, { cache: 'no-store', signal: abortControllerRef.current?.signal });
        if (response.ok) {
          pings.push(performance.now() - start);
        } else {
          throw new Error('Ping failed');
        }
      } catch (e) {
        // Double fallback
        try {
          await fetch('https://1.1.1.1/cdn-cgi/trace', { mode: 'no-cors', cache: 'no-store', signal: abortControllerRef.current?.signal });
          pings.push(performance.now() - start);
        } catch (e2) {
          console.warn('Ping fallback failed', e2);
        }
      }
      // Small delay between pings
      await new Promise(r => setTimeout(r, 100));
    }
    
    if (pings.length === 0) return { ping: 0, jitter: 0 };
    const avgPing = pings.reduce((a, b) => a + b) / pings.length;
    const diffs = pings.slice(1).map((p, i) => Math.abs(p - pings[i]));
    const jitter = diffs.length > 0 ? diffs.reduce((a, b) => a + b) / diffs.length : 0;
    
    return { ping: avgPing, jitter };
  };

  const runDownloadTest = async (onProgress: (speed: number, progress: number) => void): Promise<number> => {
    const start = performance.now();
    let totalBytes = 0;
    
    // Attempt download from multiple mirrors if one fails
    let lastError = null;
    for (const baseUrl of DOWNLOAD_URLS) {
      try {
        const url = `${baseUrl}?t=${Date.now()}`;
        const response = await fetch(url, { signal: abortControllerRef.current?.signal });
        
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        if (!response.body) throw new Error('ReadableStream not supported');
        
        const reader = response.body.getReader();
        const contentLength = parseInt(response.headers.get('Content-Length') || '8000000'); // Estimate 8MB

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          totalBytes += value.length;
          
          const now = performance.now();
          const elapsed = (now - start) / 1000;
          if (elapsed > 0) {
            const speedMbps = (totalBytes * 8) / (elapsed * 1024 * 1024);
            const prg = Math.min((totalBytes / contentLength) * 100, 100);
            onProgress(speedMbps, prg);
          }

          // Limit test duration
          if (now - start > TEST_DURATION) {
            reader.cancel();
            break;
          }
        }

        const totalElapsed = (performance.now() - start) / 1000;
        return (totalBytes * 8) / (totalElapsed * 1024 * 1024);
      } catch (err: any) {
        if (err.name === 'AbortError') throw err;
        lastError = err;
        console.warn(`Download mirror failed: ${baseUrl}`, err);
        continue; // Try next mirror
      }
    }
    throw lastError || new Error('All download mirrors failed');
  };

  const runUploadTest = async (onProgress: (speed: number, progress: number) => void): Promise<number> => {
    let lastError = null;
    
    for (const uploadUrl of UPLOAD_URLS) {
      try {
        const result = await new Promise<number>((resolve, reject) => {
          // Generate data for upload
          const dataSize = 2 * 1024 * 1024; // 2MB is safer for various endpoints
          const data = new Uint8Array(dataSize);
          
          const chunkSize = 65536;
          for (let i = 0; i < dataSize; i += chunkSize) {
            const chunk = data.subarray(i, Math.min(i + chunkSize, dataSize));
            window.crypto.getRandomValues(chunk);
          }
          
          const xhr = new XMLHttpRequest();
          const start = performance.now();
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const now = performance.now();
              const elapsed = (now - start) / 1000;
              if (elapsed > 0) {
                const speedMbps = (e.loaded * 8) / (elapsed * 1024 * 1024);
                const prg = (e.loaded / e.total) * 100;
                onProgress(speedMbps, prg);
              }
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const totalElapsed = (performance.now() - start) / 1000;
              const finalSpeed = (dataSize * 8) / (totalElapsed * 1024 * 1024);
              resolve(finalSpeed);
            } else {
              reject(new Error(`Status ${xhr.status}`));
            }
          };
          
          xhr.onerror = () => {
            reject(new Error('Network error or CORS issue'));
          };
          
          xhr.onabort = () => reject(new Error('AbortError'));
          
          xhr.open('POST', uploadUrl);
          // Only set content-type if not cloudflare to avoid some preflight issues
          if (!uploadUrl.includes('cloudflare')) {
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          }
          xhr.send(data);
          
          if (abortControllerRef.current) {
            const abortHandler = () => {
              xhr.abort();
              reject(new Error('AbortError'));
            };
            abortControllerRef.current.signal.addEventListener('abort', abortHandler);
          }
        });
        return result;
      } catch (err: any) {
        if (err.message === 'AbortError') throw err;
        lastError = err;
        console.warn(`Upload mirror failed: ${uploadUrl}`, err);
        continue;
      }
    }
    throw lastError || new Error('All upload mirrors failed');
  };

  const startTest = async () => {
    setError(null);
    abortControllerRef.current = new AbortController();
    setMetrics({ download: 0, upload: 0, ping: 0, jitter: 0 });
    setHistory([]);
    
    try {
      // Initial state
      setProgress({ phase: 'preparing', progress: 0, currentSpeed: 0 });
      await new Promise(r => setTimeout(r, 600));

      // Phase 1: Ping
      setProgress({ phase: 'ping', progress: 0, currentSpeed: 0 });
      const pingResult = await runPingTest();
      setMetrics(prev => ({ ...prev, ...pingResult }));
      await new Promise(r => setTimeout(r, 500));

      // Phase 2: Download
      setProgress({ phase: 'download', progress: 0, currentSpeed: 0 });
      const downloadSpeed = await runDownloadTest((speed, prg) => {
        setProgress(p => ({ ...p, progress: prg, currentSpeed: speed }));
        setHistory(h => [...h, speed].slice(-50));
      });
      setMetrics(prev => ({ ...prev, download: downloadSpeed }));
      await new Promise(r => setTimeout(r, 500));

      // Phase 3: Upload
      setProgress({ phase: 'upload', progress: 0, currentSpeed: 0 });
      const uploadSpeed = await runUploadTest((speed, prg) => {
        setProgress(p => ({ ...p, progress: prg, currentSpeed: speed }));
      });
      setMetrics(prev => ({ ...prev, upload: uploadSpeed }));

      setProgress({ phase: 'complete', progress: 100, currentSpeed: 0 });
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setError('Test failed. Please check your connection and try again.');
      setProgress({ phase: 'idle', progress: 0, currentSpeed: 0 });
      console.error(err);
    }
  };

  const cancelTest = () => {
    abortControllerRef.current?.abort();
    setProgress({ phase: 'idle', progress: 0, currentSpeed: 0 });
  };

  const renderGauge = () => {
    // Scale speed to 0-100 range for visuals (log-ish or cap at 500)
    const displaySpeed = progress.currentSpeed;
    const maxScale = 500;
    const rotation = Math.min((displaySpeed / maxScale) * 180 - 90, 90);
    
    return (
      <div className="relative w-64 h-32 overflow-hidden mx-auto mt-8">
        {/* Semi-Circle Background */}
        <div className="absolute inset-x-0 bottom-0 h-64 border-[16px] border-border rounded-full" />
        
        {/* Progress Fill */}
        <motion.div 
          className="absolute inset-x-0 bottom-0 h-64 border-[16px] border-accent rounded-full border-t-transparent border-l-transparent"
          initial={{ rotate: -135 }}
          animate={{ rotate: rotation - 45 }}
          transition={{ type: 'spring', stiffness: 50, damping: 10 }}
        />

        {/* Needle */}
        <motion.div 
          className="absolute left-1/2 bottom-0 w-2 h-24 bg-accent -ml-1 origin-bottom rounded-full shadow-lg"
          animate={{ rotate: rotation }}
          transition={{ type: 'spring', stiffness: 50, damping: 10 }}
        >
          <div className="absolute top-0 left-1/2 -ml-1.5 w-3 h-3 bg-accent rounded-full border-2 border-surface" />
        </motion.div>

        {/* Center Point */}
        <div className="absolute left-1/2 bottom-0 -ml-4 w-8 h-8 bg-surface border-4 border-accent rounded-full z-10" />
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'PING', value: metrics.ping.toFixed(0), unit: 'ms', icon: <ArrowDown className="w-4 h-4" />, color: 'text-blue-500' },
          { label: 'JITTER', value: metrics.jitter.toFixed(0), unit: 'ms', icon: <Activity className="w-4 h-4" />, color: 'text-purple-500' },
          { label: 'MY LOCATION', value: clientInfo.location.split(',')[0], unit: '', icon: <Globe className="w-4 h-4" />, color: 'text-green-500', desc: clientInfo.ip }
        ].map((item, i) => (
          <div key={i} className="bg-surface border border-border rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-text-muted mb-1 tracking-wider uppercase">{item.label}</p>
              <div className="flex items-baseline gap-1">
                <span className={`text-2xl font-bold ${item.color}`}>{item.value}</span>
                <span className="text-sm text-text-muted">{item.unit}</span>
              </div>
              {item.desc && <p className="text-[10px] text-text-muted mt-1 truncate max-w-[150px]">{item.desc}</p>}
            </div>
            <div className={`w-10 h-10 rounded-xl bg-opacity-10 flex items-center justify-center ${item.color.replace('text-', 'bg-')}`}>
              {item.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Main Speed Display */}
      <div className="bg-surface border border-border rounded-3xl p-8 sm:p-12 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 left-0 w-full h-1 bg-border overflow-hidden">
          {progress.phase !== 'idle' && progress.phase !== 'complete' && (
            <motion.div 
              className="h-full bg-accent"
              initial={{ width: 0 }}
              animate={{ width: `${progress.progress}%` }}
            />
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left: Gauges and Main Number */}
          <div className="text-center space-y-6">
            <div className="relative">
              <AnimatePresence mode="wait">
                <motion.div
                  key={progress.phase}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute -top-6 inset-x-0 text-accent font-bold text-sm tracking-widest uppercase"
                >
                  {progress.phase === 'idle' ? 'Ready to Test' : 
                   progress.phase === 'preparing' ? 'Connecting...' :
                   progress.phase === 'complete' ? 'Test Complete' : 
                   `${progress.phase} testing...`}
                </motion.div>
              </AnimatePresence>

              {renderGauge()}

              <div className="mt-8">
                <span className="text-7xl sm:text-8xl font-black text-text-primary tracking-tighter block">
                  {progress.phase === 'idle' ? '00.0' : 
                   progress.phase === 'download' || progress.phase === 'upload' ? progress.currentSpeed.toFixed(1) :
                   metrics.download.toFixed(1)}
                </span>
                <span className="text-xl font-bold text-text-muted tracking-widest uppercase">Mbps</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {progress.phase === 'idle' || progress.phase === 'complete' ? (
                <button 
                  onClick={startTest}
                  className="btn bp px-10 h-14 text-lg gap-3 shadow-lg shadow-accent/20"
                >
                  <Zap className="w-5 h-5 fill-current" /> {progress.phase === 'complete' ? 'Test Again' : 'Start Speed Test'}
                </button>
              ) : (
                <button 
                  onClick={cancelTest}
                  className="btn bg-red-500/10 text-red-600 hover:bg-red-500/20 px-10 h-14 text-lg gap-2"
                >
                  <RefreshCw className="w-5 h-5 animate-spin" /> Stop Test
                </button>
              )}
            </div>
          </div>

          {/* Right: Detailed Stats */}
          <div className="space-y-6">
            <div className="flex items-center gap-3 p-6 bg-blue-500/5 rounded-2xl border border-blue-500/10">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <ArrowDown className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-blue-500/60 uppercase tracking-wider">Download Speed</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-text-primary">
                    {metrics.download > 0 ? metrics.download.toFixed(2) : '-'}
                  </span>
                  <span className="text-sm font-medium text-text-muted">Mbps</span>
                </div>
              </div>
              {progress.phase === 'download' && <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />}
            </div>

            <div className="flex items-center gap-3 p-6 bg-purple-500/5 rounded-2xl border border-purple-500/10">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                <ArrowUp className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-purple-500/60 uppercase tracking-wider">Upload Speed</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-text-primary">
                    {metrics.upload > 0 ? metrics.upload.toFixed(2) : '-'}
                  </span>
                  <span className="text-sm font-medium text-text-muted">Mbps</span>
                </div>
              </div>
              {progress.phase === 'upload' && <RefreshCw className="w-5 h-5 animate-spin text-purple-500" />}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-bg-secondary rounded-2xl text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-tighter mb-1">Provider</p>
                <p className="text-sm font-bold text-text-primary truncate" title={clientInfo.isp}>{clientInfo.isp || 'Unknown'}</p>
              </div>
              <div className="p-4 bg-bg-secondary rounded-2xl text-center">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-tighter mb-1">Server</p>
                <p className="text-sm font-bold text-text-primary flex items-center justify-center gap-1">
                  <Server className="w-3 h-3 text-accent" /> Nearest
                </p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-600 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Speed Graph (Simulated History Visualization) */}
      {history.length > 0 && (
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold flex items-center gap-2">
              <Activity className="w-5 h-5 text-accent" /> Speed Consistency
            </h3>
            <span className="text-xs text-text-muted">History (Last 50 data points)</span>
          </div>
          <div className="h-24 w-full flex items-end gap-[2px]">
            {history.map((h, i) => (
              <motion.div 
                key={i} 
                className="flex-1 bg-accent/40 rounded-t-sm"
                style={{ height: `${Math.min((h / 100) * 100, 100)}%` }}
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Advanced Info Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-success" /> Why this test is accurate?
          </h3>
          <ul className="space-y-3">
            {[
              'Direct browser-to-server connection without third-party proxies.',
              'Real-time packet RTT (Round Trip Time) measurement for Ping.',
              'Jitter analysis to detect connection stability issues.',
              'High-resolution Performance API for microsecond timing.',
              'Cross-region CDN endpoints for low-latency bandwidth testing.'
            ].map((text, i) => (
              <li key={i} className="flex gap-3 text-sm text-text-secondary">
                <div className="w-1.5 h-1.5 rounded-full bg-accent mt-2 shrink-0" />
                {text}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-accent">
            <Info className="w-5 h-5" /> Detailed Network Specs
          </h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-accent/10 pb-2">
              <span className="text-sm text-text-muted">User IP Address</span>
              <span className="text-sm font-mono font-bold text-text-primary">{clientInfo.ip}</span>
            </div>
            <div className="flex justify-between items-center border-b border-accent/10 pb-2">
              <span className="text-sm text-text-muted">ISP Name</span>
              <span className="text-sm font-bold text-text-primary text-right pl-4">{clientInfo.isp}</span>
            </div>
            <div className="flex justify-between items-center border-b border-accent/10 pb-2">
              <span className="text-sm text-text-muted">Current Browser</span>
              <span className="text-sm font-bold text-text-primary truncate pl-4">
                {typeof window !== 'undefined' ? (window.navigator.userAgent.match(/(Chrome|Safari|Firefox|Edg)/)?.[0] || 'Browser') : 'Unknown'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-muted">Encryption</span>
              <span className="text-sm font-bold text-success flex items-center gap-1">
                <ShieldCheck className="w-4 h-4" /> HTTPS (SSL)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
