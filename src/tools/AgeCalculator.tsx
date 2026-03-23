import { useState, useEffect } from 'react';
import { Calendar, Calculator, Info, RefreshCw, ArrowRight } from 'lucide-react';

export default function AgeCalculator() {
  const [dob, setDob] = useState('');
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<{
    years: number;
    months: number;
    days: number;
    totalMonths: number;
    totalWeeks: number;
    totalDays: number;
    nextBirthdayDays: number;
  } | null>(null);

  useEffect(() => {
    if (!dob || !targetDate) {
      setResult(null);
      return;
    }

    const start = new Date(dob);
    const end = new Date(targetDate);

    if (start > end) {
      setResult(null);
      return;
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.floor(totalDays / 7);
    const totalMonths = (years * 12) + months;

    // Calculate next birthday
    const nextBday = new Date(start);
    nextBday.setFullYear(end.getFullYear());
    if (nextBday < end) {
      nextBday.setFullYear(end.getFullYear() + 1);
    }
    const nextBdayDiff = Math.abs(nextBday.getTime() - end.getTime());
    const nextBirthdayDays = Math.ceil(nextBdayDiff / (1000 * 60 * 60 * 24));

    setResult({ years, months, days, totalMonths, totalWeeks, totalDays, nextBirthdayDays });
  }, [dob, targetDate]);

  const clear = () => {
    setDob('');
    setTargetDate(new Date().toISOString().split('T')[0]);
    setResult(null);
  };

  return (
    <div className="tool-layout-container">
      {/* Left Controls (Sidebar) */}
      <aside className="tool-sidebar">
        <div className="sidebar-content custom-scrollbar p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-[10px] uppercase tracking-widest flex items-center gap-2 text-text-muted">
              <Calendar className="w-4 h-4 text-accent" /> Age Settings
            </h3>
            <button onClick={clear} className="p-1.5 text-text-muted hover:text-accent hover:bg-accent/10 rounded-md transition-colors" title="Reset">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="fg">
              <label className="text-xs font-bold mb-2 block text-text-secondary">Date of Birth</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="fi pl-10 w-full text-sm py-2.5"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <div className="fg">
              <label className="text-xs font-bold mb-2 block text-text-secondary">Calculate age at the date of</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="fi pl-10 w-full text-sm py-2.5"
                />
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-border">
            <div className="bg-accent/5 border border-accent/10 rounded-xl p-4">
              <h4 className="font-bold text-xs flex items-center gap-2 text-accent mb-2">
                <Info className="w-4 h-4" /> Fun Fact
              </h4>
              <p className="text-[10px] text-text-secondary leading-relaxed">
                Did you know? Every second, about 4.3 babies are born worldwide. You are one of the billions of unique stories on this planet!
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Right Preview */}
      <main className="tool-main-preview">
        <div className="preview-content-wrapper p-4 lg:p-8 flex flex-col h-full">
          <div className="flex-1 bg-bg-secondary/30 border border-border rounded-2xl p-8 flex flex-col justify-center items-center text-center relative overflow-hidden shadow-inner">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Calculator className="w-32 h-32" />
            </div>
            
            {result ? (
              <div className="w-full max-w-md space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-500">
                <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider">Your Age Details</h4>
                
                <div className="bg-surface p-8 rounded-2xl border border-border shadow-xl">
                  <div className="text-4xl md:text-5xl font-black text-accent mb-2">
                    {result.years} <span className="text-xl text-text-primary">Y</span> {result.months} <span className="text-xl text-text-primary">M</span> {result.days} <span className="text-xl text-text-primary">D</span>
                  </div>
                  <p className="text-text-muted text-xs font-bold uppercase tracking-widest">Years, Months, and Days</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Total Months', value: result.totalMonths.toLocaleString() },
                    { label: 'Total Weeks', value: result.totalWeeks.toLocaleString() },
                    { label: 'Total Days', value: result.totalDays.toLocaleString() },
                    { label: 'Next Birthday', value: `${result.nextBirthdayDays} Days`, color: 'text-success' }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-surface p-4 rounded-xl border border-border shadow-sm">
                      <div className="text-[10px] text-text-muted font-bold uppercase tracking-wider mb-1">{item.label}</div>
                      <div className={`text-xl font-black ${item.color || 'text-text-primary'}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-text-muted flex flex-col items-center relative z-10 animate-pulse">
                <div className="w-20 h-20 rounded-full bg-border/30 flex items-center justify-center mb-6 shadow-inner">
                  <Calendar className="w-10 h-10 opacity-30" />
                </div>
                <h4 className="text-xl font-bold text-text-primary mb-2">Enter Your Birthday</h4>
                <p className="max-w-[200px] text-sm">Select your date of birth to calculate your exact age.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
