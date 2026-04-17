import React, { useState } from 'react';
import { Target, Info, CalendarClock, ArrowUpRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function ConceptionCalculator() {
  const [dueDateStr, setDueDateStr] = useState<string>('');
  
  const [results, setResults] = useState<{
    conceptionDate: Date;
    fertileWindowStart: Date;
    fertileWindowEnd: Date;
    intercourseRangeStart: Date;
    intercourseRangeEnd: Date;
  } | null>(null);

  const calculateConception = () => {
    if (!dueDateStr) return;
    
    // Normalize to 00:00:00
    const dueDate = new Date(dueDateStr);
    dueDate.setHours(0, 0, 0, 0);

    // Conception is typically 266 days (38 weeks) before the due date
    const conceptionDate = new Date(dueDate.getTime() - 266 * 24 * 60 * 60 * 1000);
    
    // Fertile window: usually 5 days before ovulation/conception + the day of
    const fertileWindowStart = new Date(conceptionDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    const fertileWindowEnd = new Date(conceptionDate.getTime() + 1 * 24 * 60 * 60 * 1000); // Egg survives 24hr

    // Intercourse likely happened in this slightly wider window (sperm survives up to 5 days, egg 1 day)
    const intercourseRangeStart = new Date(conceptionDate.getTime() - 5 * 24 * 60 * 60 * 1000);
    const intercourseRangeEnd = new Date(conceptionDate.getTime() + 1 * 24 * 60 * 60 * 1000);

    setResults({
      conceptionDate,
      fertileWindowStart,
      fertileWindowEnd,
      intercourseRangeStart,
      intercourseRangeEnd
    });
  };

  const formatDate = (d: Date) => {
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  };
  const formatDateShort = (d: Date) => {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-purple-100 rounded-2xl flex items-center justify-center">
            <Target className="w-8 h-8 text-purple-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Conception Reverse-Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Already know your due date or had your baby? Reverse-calculate exactly when conception occurred and when your fertile window was.
        </p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="max-w-md mx-auto space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Estimated (or Actual) Due Date</label>
            <input
              type="date"
              value={dueDateStr}
              onChange={(e) => setDueDateStr(e.target.value)}
              className="w-full px-4 py-3 bg-purple-50/30 border border-purple-100 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 transition-colors"
            />
          </div>
          <button
            onClick={calculateConception}
            disabled={!dueDateStr}
            className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-purple-600/20"
          >
            Calculate Conception Date
          </button>
        </div>
      </div>

      {results && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="bg-gradient-to-br from-purple-600 to-indigo-600 p-8 rounded-3xl text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10 text-center">
              <h3 className="text-purple-100 font-bold mb-2 tracking-widest uppercase text-sm">Estimated Date of Conception</h3>
              <p className="text-3xl sm:text-5xl font-black mb-4">{formatDate(results.conceptionDate)}</p>
              <p className="text-purple-100/90 text-sm max-w-md mx-auto">
                Conception usually occurs exactly 266 days (38 weeks) before the standard 40-week due date.
              </p>
            </div>
            <CalendarClock className="absolute -bottom-10 -left-10 w-48 h-48 text-white/10 rotate-12" />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-sm relative overflow-hidden group">
              <ArrowUpRight className="absolute top-4 right-4 text-slate-300 group-hover:text-purple-400 transition-colors" />
              <h4 className="font-bold text-slate-800 mb-2">Fertile Window</h4>
              <p className="text-2xl font-black text-purple-600">
                {formatDateShort(results.fertileWindowStart)} — {formatDateShort(results.fertileWindowEnd)}
              </p>
              <p className="text-sm text-slate-500 mt-3">
                This is the 6-day window where intercourse was most likely to result in pregnancy.
              </p>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-purple-100 shadow-sm relative overflow-hidden group">
               <ArrowUpRight className="absolute top-4 right-4 text-slate-300 group-hover:text-purple-400 transition-colors" />
              <h4 className="font-bold text-slate-800 mb-2">Intercourse Dates</h4>
              <p className="text-2xl font-black text-indigo-600">
                {formatDateShort(results.intercourseRangeStart)} — {formatDateShort(results.intercourseRangeEnd)}
              </p>
              <p className="text-sm text-slate-500 mt-3">
                Intercourse leading to this pregnancy almost certainly occurred within this timeframe.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-3xl flex items-start gap-4">
            <Info className="w-6 h-6 text-slate-400 shrink-0 mt-0.5" />
            <div className="text-sm text-slate-600">
              <p>Because sperm can live inside the female body for up to 5 days, the act of intercourse that resulted in pregnancy may have occurred several days before the actual date of conception (when the egg was fertilized).</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
