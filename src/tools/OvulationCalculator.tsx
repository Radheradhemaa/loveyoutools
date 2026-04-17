import React, { useState } from 'react';
import { HeartPulse, Calendar, Info, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

export default function OvulationCalculator() {
  const [lmpDate, setLmpDate] = useState<string>('');
  const [cycleLength, setCycleLength] = useState<number>(28);
  const [lutealPhase, setLutealPhase] = useState<number>(14);

  const [results, setResults] = useState<{
    nextPeriod: Date;
    ovulation: Date;
    fertileWindowStart: Date;
    fertileWindowEnd: Date;
    testDate: Date;
  } | null>(null);

  const calculateOvulation = () => {
    if (!lmpDate) return;
    
    // Normalize LMP to 00:00:00
    const lmp = new Date(lmpDate);
    lmp.setHours(0, 0, 0, 0);

    // Next Period = LMP + cycle length
    const nextPeriod = new Date(lmp.getTime() + cycleLength * 24 * 60 * 60 * 1000);
    
    // Ovulation Date = Next Period - luteal phase
    const ovulation = new Date(nextPeriod.getTime() - lutealPhase * 24 * 60 * 60 * 1000);

    // Fertile Window: 5 days leading up to ovulation, plus the day of ovulation
    const fertileWindowStart = new Date(ovulation.getTime() - 5 * 24 * 60 * 60 * 1000);
    const fertileWindowEnd = new Date(ovulation.getTime() + 1 * 24 * 60 * 60 * 1000); // Egg survives 24hrs

    // Pregnancy Test Date: 1 day after missed period (nextPeriod + 1 day)
    const testDate = new Date(nextPeriod.getTime() + 1 * 24 * 60 * 60 * 1000);

    setResults({
      nextPeriod,
      ovulation,
      fertileWindowStart,
      fertileWindowEnd,
      testDate,
    });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-pink-100 rounded-2xl flex items-center justify-center">
            <HeartPulse className="w-8 h-8 text-pink-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Ovulation Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Identify your most fertile days to maximize your chances of getting pregnant. Based on standard fertility awareness methods.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Input Form */}
        <div className="md:col-span-1 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6 flex flex-col">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">First Day of Last Period</label>
            <input
              type="date"
              value={lmpDate}
              onChange={(e) => setLmpDate(e.target.value)}
              className="w-full px-4 py-3 bg-pink-50/50 border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Average Cycle Length</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="20"
                max="45"
                value={cycleLength}
                onChange={(e) => setCycleLength(parseInt(e.target.value) || 28)}
                className="w-full px-4 py-3 bg-pink-50/50 border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-colors"
              />
              <span className="text-slate-500 font-medium">Days</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Usually 21–35 days.</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Luteal Phase (Optional)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="10"
                max="16"
                value={lutealPhase}
                onChange={(e) => setLutealPhase(parseInt(e.target.value) || 14)}
                className="w-full px-4 py-3 bg-pink-50/50 border border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-colors opacity-80"
              />
              <span className="text-slate-500 font-medium opacity-80">Days</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">Leave as 14 if unsure.</p>
          </div>
          
          <div className="mt-auto pt-4">
            <button
              onClick={calculateOvulation}
              disabled={!lmpDate}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-pink-600 hover:bg-pink-700 disabled:bg-pink-300 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-pink-600/20"
            >
              Calculate Fertility
            </button>
          </div>
        </div>

        {/* Results View */}
        <div className="md:col-span-2">
          {results ? (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <div className="bg-pink-600 p-8 rounded-3xl text-white shadow-lg shadow-pink-600/20 relative overflow-hidden">
                <div className="relative z-10">
                  <h3 className="text-pink-100 font-bold mb-1">Expected Ovulation Date</h3>
                  <p className="text-4xl sm:text-5xl font-black mb-4">{formatDate(results.ovulation)}</p>
                  <p className="text-pink-100/90 text-sm max-w-sm">
                    This is your most fertile day. Ovulation occurs when an egg is released from the ovary.
                  </p>
                </div>
                <HeartPulse className="absolute -bottom-10 -right-10 w-48 h-48 text-pink-500/50 rotate-12" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-pink-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-800">Fertile Window</h4>
                  </div>
                  <p className="text-lg font-black text-rose-600">
                    {results.fertileWindowStart.getDate()} {results.fertileWindowStart.toLocaleString('default', { month: 'short' })} — {results.fertileWindowEnd.getDate()} {results.fertileWindowEnd.toLocaleString('default', { month: 'short' })}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">These are the days you are most likely to conceive. Have intercourse every 1-2 days during this window.</p>
                </div>

                <div className="bg-white p-6 rounded-3xl border border-pink-100 shadow-sm">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                      <Activity className="w-5 h-5" />
                    </div>
                    <h4 className="font-bold text-slate-800">Pregnancy Test Date</h4>
                  </div>
                  <p className="text-lg font-black text-purple-600">
                    {formatDate(results.testDate)}
                  </p>
                  <p className="text-sm text-slate-500 mt-2">Wait until this date (or your missed period) for the most accurate home pregnancy test results.</p>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full bg-slate-50 border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 text-center text-slate-400">
              <Calendar className="w-16 h-16 mb-4 opacity-50" />
              <p className="font-medium text-lg text-slate-500">Awaiting your cycle details</p>
              <p className="text-sm max-w-sm mt-2">Enter your menstrual cycle information to predict your ovulation and fertile window.</p>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 p-6 rounded-3xl flex items-start gap-4">
        <Info className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800 space-y-3">
          <p><strong>Science behind the calculator:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Sperm Survival:</strong> Sperm can live inside the female reproductive tract for up to 5 days, waiting to fertilize an egg.</li>
            <li><strong>Egg Lifespan:</strong> Once released (ovulation), an egg is viable for fertilization for only 12 to 24 hours.</li>
            <li><strong>The Window:</strong> Therefore, your "fertile window" includes the 5 days leading up to ovulation and the day of ovulation itself. Intercourse during this time yields the highest probability of conception.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
