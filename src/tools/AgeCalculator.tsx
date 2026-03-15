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
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Age Settings
            </h3>
            <button onClick={clear} className="text-text-muted hover:text-accent transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="fg">
              <label className="fl">Date of Birth</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="fi pl-10 w-full"
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
            </div>
            <div className="fg">
              <label className="fl">Calculate age at the date of</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-5 h-5" />
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="fi pl-10 w-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Result Section */}
        <div className="flex flex-col gap-6">
          <div className="bg-bg-secondary border border-border rounded-2xl p-8 flex flex-col justify-center items-center text-center min-h-[300px] relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <Calculator className="w-32 h-32" />
            </div>
            
            {result ? (
              <div className="w-full space-y-4 relative z-10">
                <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Your Age Details</h4>
                
                <div className="bg-surface p-6 rounded-2xl border border-border shadow-sm mb-6">
                  <div className="text-4xl md:text-5xl font-black text-accent mb-2">
                    {result.years} <span className="text-xl text-text-primary">Y</span> {result.months} <span className="text-xl text-text-primary">M</span> {result.days} <span className="text-xl text-text-primary">D</span>
                  </div>
                  <p className="text-text-muted text-sm font-medium">Years, Months, and Days</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Months', value: result.totalMonths.toLocaleString() },
                    { label: 'Total Weeks', value: result.totalWeeks.toLocaleString() },
                    { label: 'Total Days', value: result.totalDays.toLocaleString() },
                    { label: 'Next Birthday', value: `${result.nextBirthdayDays} Days`, color: 'text-success' }
                  ].map((item, idx) => (
                    <div key={idx} className="bg-surface p-3 rounded-xl border border-border shadow-sm">
                      <div className="text-[10px] text-text-muted font-bold uppercase mb-1">{item.label}</div>
                      <div className={`text-lg font-bold ${item.color || 'text-text-primary'}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-text-muted flex flex-col items-center relative z-10">
                <div className="w-20 h-20 rounded-full bg-border/30 flex items-center justify-center mb-6">
                  <Calendar className="w-10 h-10 opacity-30" />
                </div>
                <h4 className="text-xl font-bold text-text-primary mb-2">Enter Your Birthday</h4>
                <p className="max-w-[200px]">Select your date of birth to calculate your exact age.</p>
              </div>
            )}
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-2xl p-6">
            <h4 className="font-bold flex items-center gap-2 text-accent mb-2">
              <Info className="w-4 h-4" />
              Fun Fact
            </h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              Did you know? Every second, about 4.3 babies are born worldwide. You are one of the billions of unique stories on this planet!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
