import React, { useState } from 'react';
import { CalendarDays, Droplet, Info, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

interface CyclePrediction {
  cycleNumber: number;
  periodStart: Date;
  periodEnd: Date;
  ovulationDate: Date;
  fertileStart: Date;
}

export default function PeriodCalculator() {
  const [lmpDate, setLmpDate] = useState<string>('');
  const [cycleLength, setCycleLength] = useState<number>(28);
  const [periodDuration, setPeriodDuration] = useState<number>(5);
  
  const [predictions, setPredictions] = useState<CyclePrediction[] | null>(null);

  const calculatePeriods = () => {
    if (!lmpDate) return;
    
    const baseDate = new Date(lmpDate);
    baseDate.setHours(0, 0, 0, 0);

    const calcPredictions: CyclePrediction[] = [];

    for (let i = 1; i <= 6; i++) {
      // Calculate data for the next 6 months/cycles
      const start = new Date(baseDate.getTime() + (i * cycleLength) * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + (periodDuration - 1) * 24 * 60 * 60 * 1000);
      
      const ovulation = new Date(start.getTime() - 14 * 24 * 60 * 60 * 1000);
      const fertileStart = new Date(ovulation.getTime() - 5 * 24 * 60 * 60 * 1000);

      calcPredictions.push({
        cycleNumber: i,
        periodStart: start,
        periodEnd: end,
        ovulationDate: ovulation,
        fertileStart: fertileStart
      });
    }

    setPredictions(calcPredictions);
  };

  const formatDateShort = (d: Date) => {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };
  const formatYear = (d: Date) => {
    return d.getFullYear();
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
            <Droplet className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Menstrual Period Tracker</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Predict your next 6 menstrual cycles, PMS timings, and ovulation days.
        </p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="grid md:grid-cols-3 gap-6 items-end">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">First Day of Last Period</label>
            <input
              type="date"
              value={lmpDate}
              onChange={(e) => setLmpDate(e.target.value)}
              className="w-full px-4 py-3 bg-red-50/30 border border-red-100 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Cycle Length</label>
            <div className="flex items-center gap-2 border bg-red-50/30 border-red-100 rounded-xl px-2 focus-within:ring-2 focus-within:ring-red-400 transition-colors">
              <input
                type="number"
                min="20"
                max="45"
                value={cycleLength}
                onChange={(e) => setCycleLength(parseInt(e.target.value) || 28)}
                className="w-full px-2 py-3 bg-transparent border-none focus:outline-none focus:ring-0"
              />
              <span className="text-slate-500 font-medium pr-2">Days</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Period Duration</label>
            <div className="flex items-center gap-2 border bg-red-50/30 border-red-100 rounded-xl px-2 focus-within:ring-2 focus-within:ring-red-400 transition-colors">
              <input
                type="number"
                min="1"
                max="10"
                value={periodDuration}
                onChange={(e) => setPeriodDuration(parseInt(e.target.value) || 5)}
                className="w-full px-2 py-3 bg-transparent border-none focus:outline-none focus:ring-0"
              />
              <span className="text-slate-500 font-medium pr-2">Days</span>
            </div>
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={calculatePeriods}
            disabled={!lmpDate}
            className="w-full md:w-auto px-8 py-3.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-red-500/20"
          >
            Predict Future Cycles
          </button>
        </div>
      </div>

      {predictions && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <h3 className="text-2xl font-black text-slate-800 pl-2">Your Next 6 Cycles</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {predictions.map((cycle, idx) => (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
                key={cycle.cycleNumber} 
                className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group hover:border-red-200 hover:shadow-md transition-all"
              >
                <div className="absolute -right-4 -top-4 w-16 h-16 bg-red-50 rounded-full flex items-center justify-center opacity-50 group-hover:bg-red-100 group-hover:scale-110 transition-all">
                  <CalendarDays className="w-6 h-6 text-red-400" />
                </div>
                
                <div className="mb-4">
                  <span className="text-xs font-bold text-red-500 uppercase tracking-widest bg-red-50 px-2 py-1 rounded-md">Cycle {cycle.cycleNumber}</span>
                </div>
                
                <h4 className="text-xl font-black text-slate-800 mb-1">
                  {formatDateShort(cycle.periodStart)} - {formatDateShort(cycle.periodEnd)}
                </h4>
                <p className="text-slate-400 text-xs font-semibold mb-4">{formatYear(cycle.periodStart)}</p>
                
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Ovulation</span>
                    <span className="font-bold text-slate-700">{formatDateShort(cycle.ovulationDate)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">Fertile Window Start</span>
                    <span className="font-bold text-slate-700">{formatDateShort(cycle.fertileStart)}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl flex items-start gap-4">
            <Info className="w-6 h-6 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600">
              <p>Calendar predictions are based on statistical averages of the cycle length you provided. Stress, diet, exercise, and medical conditions can significantly affect cycle regularity.</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
