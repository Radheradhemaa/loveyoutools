import React, { useState } from 'react';
import { Heart, Activity, Info, CalendarDays } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PregnancyConceptionCalculator() {
  const [lmpDateStr, setLmpDateStr] = useState<string>('');
  const [cycleLength, setCycleLength] = useState<number>(28);
  
  const [results, setResults] = useState<{
    conceptionDate: Date;
    dueDate: Date;
    currentWeek: number;
    currentDays: number;
    trimester: number;
  } | null>(null);

  const calculate = () => {
    if (!lmpDateStr) return;
    
    const lmpDate = new Date(lmpDateStr);
    lmpDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // EDD = LMP + 280 days + (cycleLength - 28)
    const offsetDays = cycleLength - 28;
    const dueDate = new Date(lmpDate.getTime() + (280 + offsetDays) * 24 * 60 * 60 * 1000);
    
    // Conception = EDD - 266 days
    const conceptionDate = new Date(dueDate.getTime() - 266 * 24 * 60 * 60 * 1000);

    const diffTime = Math.abs(today.getTime() - lmpDate.getTime());
    const diffDaysTotal = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    const weeks = Math.floor(diffDaysTotal / 7);
    const days = diffDaysTotal % 7;

    let trimester = 1;
    if (weeks >= 13 && weeks <= 26) trimester = 2;
    else if (weeks >= 27) trimester = 3;

    setResults({
      conceptionDate,
      dueDate,
      currentWeek: weeks,
      currentDays: days,
      trimester
    });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-rose-100 rounded-2xl flex items-center justify-center">
            <Heart className="w-8 h-8 text-rose-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Pregnancy & Conception Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Identify your exact conception date, gestational age, and due date based on your last menstrual period.
        </p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="grid md:grid-cols-2 gap-6 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">First Day of Last Period (LMP)</label>
            <input
              type="date"
              value={lmpDateStr}
              onChange={(e) => setLmpDateStr(e.target.value)}
              className="w-full px-4 py-3 bg-rose-50/30 border border-rose-100 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Average Cycle Length (Days)</label>
            <input
              type="number"
              min="20"
              max="45"
              value={cycleLength}
              onChange={(e) => setCycleLength(parseInt(e.target.value) || 28)}
              className="w-full px-4 py-3 bg-rose-50/30 border border-rose-100 rounded-xl focus:ring-2 focus:ring-rose-400 focus:border-rose-400 transition-colors"
            />
          </div>
        </div>
        <div className="mt-8">
          <button
            onClick={calculate}
            disabled={!lmpDateStr}
            className="w-full py-4 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-rose-600/20 text-lg"
          >
            Calculate Dates
          </button>
        </div>
      </div>

      {results && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-3xl border border-rose-100 shadow-sm relative overflow-hidden">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Estimated Conception Date</h3>
            <p className="text-3xl font-black text-rose-600 mb-6">{formatDate(results.conceptionDate)}</p>
            
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Estimated Due Date</h3>
            <p className="text-2xl font-bold text-slate-800">{formatDate(results.dueDate)}</p>

            <CalendarDays className="absolute -bottom-8 -right-8 w-40 h-40 text-rose-50 opacity-50" />
          </div>

          <div className="bg-gradient-to-br from-rose-50 to-orange-50 p-8 rounded-3xl border border-rose-100 flex flex-col justify-center">
            <div className="flex items-center gap-3 mb-4">
              <Activity className="w-6 h-6 text-rose-500" />
              <h3 className="text-lg font-bold text-rose-900">Current Gestational Age</h3>
            </div>
            
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-6xl font-black text-rose-600">{results.currentWeek}</span>
              <span className="text-xl font-bold text-rose-800">w</span>
              <span className="text-4xl font-black text-rose-600 ml-2">{results.currentDays}</span>
              <span className="text-xl font-bold text-rose-800">d</span>
            </div>
            
            <p className="text-rose-700 font-medium">Trimester {results.trimester}</p>
          </div>

          <div className="md:col-span-2 bg-slate-50 p-6 rounded-3xl flex items-start gap-4 border border-slate-200">
            <Info className="w-6 h-6 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600 space-y-2">
              <p><strong>Gestational Age vs. Fetal Age:</strong> Gestational age is measured from the first day of your last menstrual period (LMP). Fetal age (the actual age of the baby) is measured from the date of conception. Therefore, gestational age is roughly two weeks greater than fetal age.</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
