import React, { useState } from 'react';
import { Calendar, Calculator, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export default function DueDateCalculator() {
  const [method, setMethod] = useState<'lmp' | 'conception' | 'ivf' | 'ultrasound'>('lmp');
  
  // States for different methods
  const [dateInput, setDateInput] = useState<string>('');
  const [cycleLength, setCycleLength] = useState<number>(28);
  const [ivfType, setIvfType] = useState<'3day' | '5day'>('5day');
  const [usWeeks, setUsWeeks] = useState<number>(8);
  const [usDays, setUsDays] = useState<number>(0);

  const [resultDate, setResultDate] = useState<Date | null>(null);

  const calculateDueDate = () => {
    if (!dateInput) return;
    
    const baseDate = new Date(dateInput);
    baseDate.setHours(0, 0, 0, 0);
    let edd = new Date(baseDate);

    if (method === 'lmp') {
      // EDD = LMP + 280 days + (cycleLength - 28)
      const offsetDays = cycleLength - 28;
      edd.setDate(edd.getDate() + 280 + offsetDays);
    } 
    else if (method === 'conception') {
      // EDD = Conception + 266 days
      edd.setDate(edd.getDate() + 266);
    }
    else if (method === 'ivf') {
      // For 3-day embryo: Transfer + 263 days
      // For 5-day embryo: Transfer + 261 days
      const addDays = ivfType === '3day' ? 263 : 261;
      edd.setDate(edd.getDate() + addDays);
    }
    else if (method === 'ultrasound') {
      // EDD = Ultrasound Date + 280 days - (Ultrasound Gestational Age)
      const totalGestationalDays = (usWeeks * 7) + usDays;
      const daysRemaining = 280 - totalGestationalDays;
      edd.setDate(edd.getDate() + daysRemaining);
    }

    setResultDate(edd);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
            <Calendar className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Due Date Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Calculate your baby's estimated due date accurately using your last period, conception date, IVF transfer date, or ultrasound measurement.
        </p>
      </div>

      <div className="bg-white p-2 rounded-2xl border border-slate-200 flex flex-wrap gap-2 justify-center mb-6">
        {[
          { id: 'lmp', label: 'Last Period' },
          { id: 'conception', label: 'Conception Date' },
          { id: 'ivf', label: 'IVF Transfer' },
          { id: 'ultrasound', label: 'Ultrasound' }
        ].map((m) => (
          <button
            key={m.id}
            onClick={() => { setMethod(m.id as any); setResultDate(null); }}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-colors ${
              method === m.id ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-slate-600 hover:bg-slate-100'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            
            {method === 'lmp' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">First Day of Last Period</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
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
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                  />
                  <p className="text-xs text-slate-500 mt-2">Typically 28 days.</p>
                </div>
              </>
            )}

            {method === 'conception' && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Estimated Date of Conception</label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                />
              </div>
            )}

            {method === 'ivf' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date of Embryo Transfer</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Embryo Age at Transfer</label>
                  <select
                    value={ivfType}
                    onChange={(e) => setIvfType(e.target.value as any)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                  >
                    <option value="3day">Day 3 Embryo</option>
                    <option value="5day">Day 5 Embryo (Blastocyst)</option>
                  </select>
                </div>
              </>
            )}

            {method === 'ultrasound' && (
              <>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Date of Ultrasound Scan</label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Gestational Age at Scan</label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="42"
                          value={usWeeks}
                          onChange={(e) => setUsWeeks(parseInt(e.target.value) || 0)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                        />
                        <span className="text-slate-500 font-medium">Weeks</span>
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max="6"
                          value={usDays}
                          onChange={(e) => setUsDays(parseInt(e.target.value) || 0)}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-colors"
                        />
                        <span className="text-slate-500 font-medium">Days</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <button
              onClick={calculateDueDate}
              disabled={!dateInput}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl font-bold transition-all active:scale-95"
            >
              <Calculator className="w-5 h-5" /> Calculate Due Date
            </button>
          </div>

          <div className="bg-slate-50 rounded-2xl p-6 sm:p-8 flex flex-col justify-center items-center text-center border border-slate-100">
            {resultDate ? (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Your Estimated Due Date</h3>
                <p className="text-4xl sm:text-5xl font-black text-blue-600">
                  {resultDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
                <p className="text-slate-600 pt-4 text-sm max-w-sm px-4">
                  A normal pregnancy can last anywhere from 38 to 42 weeks. Only about 4% to 5% of babies are born on their exact estimated due date.
                </p>
              </motion.div>
            ) : (
              <div className="text-slate-400 opacity-50 space-y-4">
                <Calculator className="w-16 h-16 mx-auto" />
                <p className="font-medium">Enter your details and calculate to see results.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-yellow-50 p-6 rounded-3xl flex items-start gap-4">
        <Info className="w-6 h-6 text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-800 space-y-2">
          <p><strong>About Due Dates:</strong></p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>LMP:</strong> This is the most standard method. It adds 280 days (40 weeks) to the first day of your last period. It corrects for longer or shorter typical cycle lengths.</li>
            <li><strong>Conception Method:</strong> Used when you know the exact date of conception (e.g., tracking basal body temp). Adds 266 days (38 weeks).</li>
            <li><strong>IVF Method:</strong> Extremely accurate as transfer dates and embryo ages are explicitly known.</li>
            <li><strong>Ultrasound:</strong> Often considered the most accurate method if done in the first trimester, as it measures fetal size directly.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
