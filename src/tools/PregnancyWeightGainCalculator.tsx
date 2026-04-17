import React, { useState } from 'react';
import { Scale, Info, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PregnancyWeightGainCalculator() {
  const [heightFt, setHeightFt] = useState<number>(5);
  const [heightIn, setHeightIn] = useState<number>(5);
  const [preWeight, setPreWeight] = useState<number>(140);
  const [currentWeight, setCurrentWeight] = useState<number>(150);
  const [currentWeek, setCurrentWeek] = useState<number>(20);
  const [isTwins, setIsTwins] = useState<boolean>(false);

  const [results, setResults] = useState<{
    preBmi: number;
    bmiCategory: string;
    totalGainRecommended: [number, number];
    currentGain: number;
    expectedGainAtWeek: [number, number];
    status: 'low' | 'normal' | 'high';
  } | null>(null);

  const calculateWeightGain = () => {
    // 1. Calculate Pre-pregnancy BMI
    const totalInches = (heightFt * 12) + heightIn;
    const heightMeters = totalInches * 0.0254;
    const weightKg = preWeight * 0.453592;
    const bmi = weightKg / (heightMeters * heightMeters);

    let category = '';
    let totalRecommended: [number, number] = [0, 0];
    let weeklyRate2nd3rdTrim: [number, number] = [0, 0]; // (lbs per week)

    // Guidelines based on Institute of Medicine (IOM) for singletons
    if (!isTwins) {
      if (bmi < 18.5) {
        category = 'Underweight';
        totalRecommended = [28, 40];
        weeklyRate2nd3rdTrim = [1.0, 1.3];
      } else if (bmi >= 18.5 && bmi <= 24.9) {
        category = 'Normal Weight';
        totalRecommended = [25, 35];
        weeklyRate2nd3rdTrim = [0.8, 1.0];
      } else if (bmi >= 25.0 && bmi <= 29.9) {
        category = 'Overweight';
        totalRecommended = [15, 25];
        weeklyRate2nd3rdTrim = [0.5, 0.7];
      } else {
        category = 'Obese';
        totalRecommended = [11, 20];
        weeklyRate2nd3rdTrim = [0.4, 0.6];
      }
    } else {
      // Guidelines for Twins
      if (bmi < 18.5) {
        category = 'Underweight';
        totalRecommended = [50, 62];
      } else if (bmi >= 18.5 && bmi <= 24.9) {
        category = 'Normal Weight';
        totalRecommended = [37, 54];
      } else if (bmi >= 25.0 && bmi <= 29.9) {
        category = 'Overweight';
        totalRecommended = [31, 50];
      } else {
        category = 'Obese';
        totalRecommended = [25, 42];
      }
      weeklyRate2nd3rdTrim = [1.5, 2.0]; // Approximations for twins
    }

    const currentGain = currentWeight - preWeight;

    // Calculate expected gain up to current week
    // Assumption: 1st trimester (weeks 1-13) gain is a flat rate: 1-4 lbs total for normal weight
    let expectedMin = 0;
    let expectedMax = 0;

    const firstTrimGainMin = bmi < 18.5 ? 2.2 : (bmi >= 25 ? 1.1 : 2.2);
    const firstTrimGainMax = bmi < 18.5 ? 6.6 : (bmi >= 25 ? 4.4 : 6.6);

    if (currentWeek <= 13) {
      // Linear scale during 1st trimester
      expectedMin = (firstTrimGainMin / 13) * currentWeek;
      expectedMax = (firstTrimGainMax / 13) * currentWeek;
    } else {
      const weeksInto2nd = currentWeek - 13;
      expectedMin = firstTrimGainMin + (weeksInto2nd * weeklyRate2nd3rdTrim[0]);
      expectedMax = firstTrimGainMax + (weeksInto2nd * weeklyRate2nd3rdTrim[1]);
    }

    // Determine Status
    let status: 'low' | 'normal' | 'high' = 'normal';
    if (currentGain < expectedMin - 1.0) status = 'low'; // 1 lb leeway
    else if (currentGain > expectedMax + 1.0) status = 'high';

    setResults({
      preBmi: bmi,
      bmiCategory: category,
      totalGainRecommended: totalRecommended,
      currentGain,
      expectedGainAtWeek: [expectedMin, expectedMax],
      status
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center">
            <Scale className="w-8 h-8 text-teal-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Pregnancy Weight Gain Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Ensure you and your baby are on track. Calculate your recommended weight gain week-by-week based on IOM guidelines.
        </p>
      </div>

      <div className="grid md:grid-cols-5 gap-6">
        {/* Input Form */}
        <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Height</label>
            <div className="flex gap-2">
              <div className="flex-1 flex items-center border bg-slate-50 border-slate-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-teal-400">
                <input
                  type="number" min="3" max="7" value={heightFt}
                  onChange={(e) => setHeightFt(parseInt(e.target.value) || 0)}
                  className="w-full py-3 bg-transparent border-none focus:outline-none focus:ring-0"
                />
                <span className="text-slate-400 font-medium">ft</span>
              </div>
              <div className="flex-1 flex items-center border bg-slate-50 border-slate-200 rounded-xl px-3 focus-within:ring-2 focus-within:ring-teal-400">
                <input
                  type="number" min="0" max="11" value={heightIn}
                  onChange={(e) => setHeightIn(parseInt(e.target.value) || 0)}
                  className="w-full py-3 bg-transparent border-none focus:outline-none focus:ring-0"
                />
                <span className="text-slate-400 font-medium">in</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Pre-Pregnancy Weight (lbs)</label>
            <input
              type="number" value={preWeight}
              onChange={(e) => setPreWeight(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Current Weight (lbs)</label>
            <input
              type="number" value={currentWeight}
              onChange={(e) => setCurrentWeight(parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Current Week of Pregnancy</label>
            <input
              type="number" min="1" max="42" value={currentWeek}
              onChange={(e) => setCurrentWeek(parseInt(e.target.value) || 1)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-teal-400 focus:border-teal-400"
            />
          </div>

          <div className="flex items-center gap-3 py-2">
            <input
              type="checkbox" id="twins" checked={isTwins}
              onChange={(e) => setIsTwins(e.target.checked)}
              className="w-5 h-5 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
            />
            <label htmlFor="twins" className="text-sm font-semibold text-slate-700">Expecting Twins?</label>
          </div>

          <button
            onClick={calculateWeightGain}
            className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-teal-600/20"
          >
            Calculate Status
          </button>
        </div>

        {/* Results */}
        <div className="md:col-span-3">
          {results ? (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="space-y-6">
              <div className={`p-8 rounded-3xl text-white shadow-lg relative overflow-hidden ${
                results.status === 'normal' ? 'bg-gradient-to-br from-teal-500 to-emerald-600' :
                results.status === 'high' ? 'bg-gradient-to-br from-orange-500 to-red-500' :
                'bg-gradient-to-br from-blue-400 to-blue-600'
              }`}>
                <div className="relative z-10 flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center shrink-0 border-2 border-white/30 backdrop-blur-sm">
                    {results.status === 'normal' ? <CheckCircle2 className="w-10 h-10" /> : <AlertTriangle className="w-10 h-10" />}
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-white/80 font-bold uppercase tracking-widest text-sm mb-1">Your Status</h3>
                    <p className="text-3xl font-black mb-2">
                      {results.status === 'normal' ? "You're on track!" :
                       results.status === 'high' ? "Checking in..." : "Slightly low"}
                    </p>
                    <p className="text-white/90 text-sm">
                      {results.status === 'normal' ? `Your ${results.currentGain.toFixed(1)} lb gain is right within the recommended range for week ${currentWeek}.` :
                       results.status === 'high' ? `Your ${results.currentGain.toFixed(1)} lb gain is slightly above the recommended range for week ${currentWeek}.` :
                       `Your ${results.currentGain.toFixed(1)} lb gain is slightly below the recommended range for week ${currentWeek}.`}
                    </p>
                  </div>
                </div>
                <TrendingUp className="absolute -bottom-8 -right-8 w-40 h-40 text-white/10" />
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center sm:text-left">
                  <h4 className="text-sm font-bold text-slate-500 mb-2">Recommended Gain by Week {currentWeek}</h4>
                  <p className="text-3xl font-black text-slate-800">
                    {results.expectedGainAtWeek[0].toFixed(1)} - {results.expectedGainAtWeek[1].toFixed(1)} <span className="text-lg">lbs</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Based on your pre-pregnancy BMI.</p>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm text-center sm:text-left">
                  <h4 className="text-sm font-bold text-slate-500 mb-2">Total Recommended (Full Term)</h4>
                  <p className="text-3xl font-black text-slate-800">
                    {results.totalGainRecommended[0]} - {results.totalGainRecommended[1]} <span className="text-lg">lbs</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-2">Total weight gain expected by 40 weeks.</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center justify-between">
                <span className="font-bold text-slate-700">Pre-Pregnancy BMI:</span>
                <div className="text-right">
                  <span className="font-black text-xl text-slate-800">{results.preBmi.toFixed(1)}</span>
                  <span className="ml-2 px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-bold uppercase">{results.bmiCategory}</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full bg-slate-50 border border-slate-200 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 text-center text-slate-400 min-h-[300px]">
              <Scale className="w-16 h-16 mb-4 opacity-50" />
              <p className="font-medium text-lg text-slate-500">Calculate Your Weight Gain Target</p>
              <p className="text-sm max-w-sm mt-2">Find out if your weight gain is on track for a healthy pregnancy based on medical guidelines.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
