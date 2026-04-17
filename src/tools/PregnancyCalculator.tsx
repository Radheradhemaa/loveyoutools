import React, { useState, useEffect } from 'react';
import { Baby, Calendar, Info, Activity, Star, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const FRUITS: Record<number, { name: string, length: string, weight: string, emoji: string }> = {
  4: { name: 'Poppy Seed', length: '0.04 in', weight: '< 0.01 oz', emoji: '🌑' },
  5: { name: 'Apple Seed', length: '0.05 in', weight: '< 0.01 oz', emoji: '🍎' },
  6: { name: 'Sweet Pea', length: '0.13 in', weight: '< 0.01 oz', emoji: '🟢' },
  7: { name: 'Blueberry', length: '0.51 in', weight: '< 0.01 oz', emoji: '🫐' },
  8: { name: 'Raspberry', length: '0.63 in', weight: '0.04 oz', emoji: '🍇' },
  9: { name: 'Green Olive', length: '0.90 in', weight: '0.07 oz', emoji: '🫒' },
  10: { name: 'Prune', length: '1.22 in', weight: '0.14 oz', emoji: '🫐' },
  11: { name: 'Lime', length: '1.61 in', weight: '0.25 oz', emoji: '🍋' },
  12: { name: 'Plum', length: '2.13 in', weight: '0.49 oz', emoji: '🍑' },
  13: { name: 'Peach', length: '2.91 in', weight: '0.81 oz', emoji: '🍑' },
  14: { name: 'Lemon', length: '3.42 in', weight: '1.52 oz', emoji: '🍋' },
  15: { name: 'Apple', length: '3.98 in', weight: '2.47 oz', emoji: '🍎' },
  16: { name: 'Avocado', length: '4.57 in', weight: '3.53 oz', emoji: '🥑' },
  17: { name: 'Pear', length: '5.12 in', weight: '4.94 oz', emoji: '🍐' },
  18: { name: 'Sweet Potato', length: '5.59 in', weight: '6.70 oz', emoji: '🍠' },
  19: { name: 'Mango', length: '6.02 in', weight: '8.47 oz', emoji: '🥭' },
  20: { name: 'Banana', length: '6.46 in', weight: '10.58 oz', emoji: '🍌' },
  21: { name: 'Pomegranate', length: '10.51 in', weight: '12.70 oz', emoji: '🍎' },
  22: { name: 'Papaya', length: '10.94 in', weight: '15.17 oz', emoji: '🍉' },
  23: { name: 'Grapefruit', length: '11.38 in', weight: '1.10 lb', emoji: '🍊' },
  24: { name: 'Cantaloupe', length: '11.81 in', weight: '1.32 lb', emoji: '🍈' },
  25: { name: 'Cauliflower', length: '13.62 in', weight: '1.46 lb', emoji: '🥦' },
  26: { name: 'Lettuce', length: '14.02 in', weight: '1.68 lb', emoji: '🥬' },
  27: { name: 'Rutabaga', length: '14.41 in', weight: '1.93 lb', emoji: '🧅' },
  28: { name: 'Eggplant', length: '14.80 in', weight: '2.22 lb', emoji: '🍆' },
  29: { name: 'Butternut Squash', length: '15.20 in', weight: '2.54 lb', emoji: '🫑' },
  30: { name: 'Cabbage', length: '15.71 in', weight: '2.91 lb', emoji: '🥬' },
  31: { name: 'Coconut', length: '16.18 in', weight: '3.31 lb', emoji: '🥥' },
  32: { name: 'Jicama', length: '16.69 in', weight: '3.75 lb', emoji: '🥔' },
  33: { name: 'Pineapple', length: '17.20 in', weight: '4.23 lb', emoji: '🍍' },
  34: { name: 'Cantaloupe', length: '17.72 in', weight: '4.73 lb', emoji: '🍈' },
  35: { name: 'Honeydew Melon', length: '18.19 in', weight: '5.25 lb', emoji: '🍈' },
  36: { name: 'Romaine Lettuce', length: '18.66 in', weight: '5.78 lb', emoji: '🥬' },
  37: { name: 'Swiss Chard', length: '19.13 in', weight: '6.30 lb', emoji: '🥬' },
  38: { name: 'Leek', length: '19.61 in', weight: '6.80 lb', emoji: '🧅' },
  39: { name: 'Mini Watermelon', length: '19.96 in', weight: '7.25 lb', emoji: '🍉' },
  40: { name: 'Small Pumpkin', length: '20.16 in', weight: '7.63 lb', emoji: '🎃' },
  41: { name: 'Watermelon', length: '20.35 in', weight: '7.93 lb', emoji: '🍉' },
  42: { name: 'Jackfruit', length: '20.80 in', weight: '8.20 lb', emoji: '🍈' }
};

export default function PregnancyCalculator() {
  const [lmpDate, setLmpDate] = useState<string>('');
  
  const [results, setResults] = useState<{
    weeks: number;
    days: number;
    dueDate: Date;
    trimester: number;
    progressPercentage: number;
    daysRemaining: number;
    milestones: { name: string; date: Date; passed: boolean }[];
  } | null>(null);

  useEffect(() => {
    if (!lmpDate) {
      setResults(null);
      return;
    }

    const today = new Date();
    // Normalize today
    today.setHours(0, 0, 0, 0);

    const lmp = new Date(lmpDate);
    lmp.setHours(0, 0, 0, 0);

    // Calculate Due Date (Naegele's rule: LMP + 280 days)
    const dueDate = new Date(lmp.getTime() + 280 * 24 * 60 * 60 * 1000);

    // Calculate Gestational Age
    const diffTime = Math.abs(today.getTime() - lmp.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // Gestation is typically capped at 42 weeks
    let weeks = Math.floor(diffDays / 7);
    let days = diffDays % 7;

    if (today < lmp || diffDays > 300) {
      setResults(null);
      return;
    }

    let trimester = 1;
    if (weeks >= 13 && weeks <= 26) trimester = 2;
    else if (weeks >= 27) trimester = 3;

    const progressPercentage = Math.min((diffDays / 280) * 100, 100);
    const daysRemaining = Math.max(0, 280 - diffDays);

    // Milestones
    const milestones = [
      { name: 'Start of 2nd Trimester', date: new Date(lmp.getTime() + 13 * 7 * 24 * 60 * 60 * 1000) },
      { name: 'Anatomy Scan (Ultrasound)', date: new Date(lmp.getTime() + 20 * 7 * 24 * 60 * 60 * 1000) },
      { name: 'Start of 3rd Trimester', date: new Date(lmp.getTime() + 27 * 7 * 24 * 60 * 60 * 1000) },
      { name: 'Full Term (Safe to deliver)', date: new Date(lmp.getTime() + 37 * 7 * 24 * 60 * 60 * 1000) },
      { name: 'Estimated Due Date', date: dueDate }
    ].map(m => ({ ...m, passed: today >= m.date }));

    setResults({ weeks, days, dueDate, trimester, progressPercentage, daysRemaining, milestones });

  }, [lmpDate]);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-10">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-2xl flex items-center justify-center">
            <Baby className="w-8 h-8 text-yellow-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Pregnancy Timeline Calculator</h2>
        <p className="text-slate-500 max-w-2xl mx-auto">
          Enter the first day of your Last Menstrual Period (LMP) to generate a detailed timeline of your pregnancy, baby size estimates, and key milestones.
        </p>
      </div>

      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-sm border border-slate-200">
        <div className="max-w-md mx-auto space-y-4">
          <label className="block text-sm font-semibold text-slate-700">First Day of Last Period (LMP)</label>
          <input
            type="date"
            value={lmpDate}
            onChange={(e) => setLmpDate(e.target.value)}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 transition-colors"
          />
        </div>
      </div>

      {results && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {/* Main Stats Card */}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="col-span-2 bg-gradient-to-br from-yellow-50 to-orange-50 p-6 sm:p-8 rounded-3xl border border-yellow-100">
              <h3 className="text-yellow-800 font-bold mb-2">You are currently</h3>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black text-yellow-600">{results.weeks}</span>
                <span className="text-xl font-bold text-yellow-700">weeks</span>
                <span className="text-4xl font-black text-yellow-600 ml-2">{results.days}</span>
                <span className="text-xl font-bold text-yellow-700">days</span>
              </div>
              <div className="mt-6">
                <div className="flex justify-between text-sm font-medium text-yellow-800 mb-2">
                  <span>Trimester {results.trimester}</span>
                  <span>{results.daysRemaining} days left</span>
                </div>
                <div className="w-full bg-yellow-200/50 rounded-full h-4 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${results.progressPercentage}%` }}
                    transition={{ duration: 1 }}
                    className="bg-yellow-500 h-full rounded-full"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 flex flex-col justify-center items-center text-center">
              <Calendar className="w-8 h-8 text-slate-400 mb-3" />
              <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-widest">Estimated Due Date</h3>
              <p className="text-2xl font-black text-slate-800 mt-2">
                {results.dueDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          </div>

          {/* Baby Size View */}
          {FRUITS[results.weeks] && (
            <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 flex flex-col sm:flex-row items-center gap-8">
              <div className="text-7xl bg-slate-50 w-32 h-32 rounded-full flex items-center justify-center border border-slate-100 shadow-inner">
                {FRUITS[results.weeks].emoji}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <div className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                  <Star className="w-3 h-3" /> Growth Update
                </div>
                <h3 className="text-2xl font-black text-slate-800">Your baby is the size of a {FRUITS[results.weeks].name}</h3>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-4">
                  <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-xl">
                    <Activity className="w-4 h-4 text-slate-400" />
                    <strong>Length:</strong> {FRUITS[results.weeks].length}
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 bg-slate-50 px-4 py-2 rounded-xl">
                    <Activity className="w-4 h-4 text-slate-400" />
                    <strong>Weight:</strong> {FRUITS[results.weeks].weight}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Milestones */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Key Milestones</h3>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-yellow-400 before:to-slate-200">
              {results.milestones.map((milestone, idx) => (
                <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-4 border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10"
                       style={{ backgroundColor: milestone.passed ? '#facc15' : '#f1f5f9', color: milestone.passed ? '#fff' : '' }}>
                    {milestone.passed && <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  
                  <div className={"w-[calc(100%-3rem)] md:w-[calc(50%-2rem)] p-4 rounded-2xl border " + (milestone.passed ? "bg-yellow-50/50 border-yellow-200" : "bg-white border-slate-200 text-slate-400")}>
                    <h4 className={"font-bold mb-1 " + (milestone.passed ? "text-slate-800" : "text-slate-500")}>{milestone.name}</h4>
                    <p className="text-sm font-medium opacity-80">{milestone.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="bg-blue-50 p-6 rounded-3xl flex items-start gap-4">
            <Info className="w-6 h-6 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p><strong>Note:</strong> This pregnancy calendar uses Naegele's rule, which assumes a standard 28-day menstrual cycle with ovulation occurring on day 14. Only about 5% of babies are born precisely on their estimated due date. Always consult with your healthcare provider for the most accurate medical advice.</p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

const CheckCircle2 = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
