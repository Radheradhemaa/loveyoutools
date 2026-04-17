import React, { useState, useMemo } from 'react';
import { IndianRupee, DollarSign, Wallet, Calculator, Clock, Info, Banknote, CalendarDays, BookOpen, Sigma } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type Frequency = 'hourly' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'annually';

export default function SalaryCalculator() {
  const currentYear = new Date().getFullYear();
  const [currency, setCurrency] = useState<'USD' | 'INR'>('USD');
  const [baseInput, setBaseInput] = useState<number | ''>(50000);
  const [inputFrequency, setInputFrequency] = useState<Frequency>('annually');
  const [workingDaysSelection, setWorkingDaysSelection] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri
  const [hoursPerDay, setHoursPerDay] = useState<number>(8);
  const [holidays, setHolidays] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());

  const frequencyOptions: { id: Frequency; label: string }[] = [
    { id: 'hourly', label: 'Hourly' },
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'biweekly', label: 'Bi-Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'annually', label: 'Annually' },
  ];

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const daysOfWeekList = [
    { id: 1, label: 'M' },
    { id: 2, label: 'T' },
    { id: 3, label: 'W' },
    { id: 4, label: 'T' },
    { id: 5, label: 'F' },
    { id: 6, label: 'S' },
    { id: 0, label: 'S' },
  ];

  const results = useMemo(() => {
    let annually = 0;
    const input = Number(baseInput) || 0;
    const hpd = Number(hoursPerDay) || 0;

    const year = new Date().getFullYear();

    // 1. Calculate base Work Days
    let totalYearWorkDays = 0;
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;
    for (let d = 1; d <= daysInYear; d++) {
      const date = new Date(year, 0, d);
      if (workingDaysSelection.includes(date.getDay())) totalYearWorkDays++;
    }

    let monthWorkDays = 0;
    const daysInMonth = new Date(year, selectedMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, selectedMonth, d);
      if (workingDaysSelection.includes(date.getDay())) monthWorkDays++;
    }

    const netYearWorkDays = Math.max(1, totalYearWorkDays - holidays);
    const netMonthWorkDays = Math.max(1, monthWorkDays - holidays);

    let monthly = 0, biweekly = 0, weekly = 0, daily = 0, hourly = 0;

    // 2. Base Amount -> Annually First
    switch (inputFrequency) {
      case 'hourly':
        hourly = input;
        daily = hourly * hpd;
        annually = daily * netYearWorkDays;
        break;
      case 'daily':
        daily = input;
        hourly = hpd > 0 ? daily / hpd : 0;
        annually = daily * netYearWorkDays;
        break;
      case 'weekly':
        weekly = input;
        annually = weekly * 52;
        break;
      case 'biweekly':
        biweekly = input;
        annually = biweekly * 26;
        break;
      case 'monthly':
        monthly = input;
        daily = monthly / netMonthWorkDays;
        hourly = hpd > 0 ? daily / hpd : 0;
        annually = monthly * 12;
        break;
      case 'annually':
        annually = input;
        break;
    }

    // 3. Fallbacks
    if (!monthly) monthly = annually / 12;
    if (!biweekly) biweekly = annually / 26;
    if (!weekly) weekly = annually / 52;
    if (!daily && inputFrequency !== 'monthly') daily = annually / netYearWorkDays;
    if (!hourly && inputFrequency !== 'monthly') hourly = hpd > 0 ? daily / hpd : 0;

    return {
      annually,
      monthly,
      biweekly,
      weekly,
      daily,
      hourly,
      input,
      hpd,
      netYearWorkDays,
      netMonthWorkDays,
      selectedMonthName: months[selectedMonth],
      currentYear: year
    };
  }, [baseInput, inputFrequency, workingDaysSelection, hoursPerDay, holidays, selectedMonth]);

  const formatCurrency = (val: number) => {
    const locale = currency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(val);
  };

  const handleCurrencySwitch = (curr: 'USD' | 'INR') => {
    setCurrency(curr);
    if (curr === 'INR' && baseInput === 50000) {
      setBaseInput(1200000);
    } else if (curr === 'USD' && baseInput === 1200000) {
      setBaseInput(50000);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-4 mb-8">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center shadow-inner">
            <Calculator className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <h2 className="text-3xl font-black text-slate-800">Simple Salary Calculator</h2>
        <p className="text-slate-500 max-w-xl mx-auto">
          Convert your gross salary between hourly, daily, weekly, monthly, and annual intervals. See exactly how the math works step-by-step.
        </p>

        {/* Currency Toggle */}
        <div className="flex justify-center pt-2">
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200 inline-flex items-center shadow-sm">
            <button
              onClick={() => handleCurrencySwitch('USD')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                currency === 'USD' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              🇺🇸 USD
            </button>
            <button
              onClick={() => handleCurrencySwitch('INR')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                currency === 'INR' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              🇮🇳 INR
            </button>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-start">
        {/* Left Column: Inputs & Results */}
        <div className="space-y-6">
          {/* Income Input Card */}
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
              <Wallet className="w-5 h-5 text-blue-600" /> Your Income
            </h3>
            
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  {currency === 'USD' ? <DollarSign className="w-5 h-5 text-slate-400" /> : <IndianRupee className="w-5 h-5 text-slate-400" />}
                </div>
                <input
                  type="number"
                  value={baseInput}
                  onChange={(e) => setBaseInput(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 font-bold text-lg text-slate-800 transition-all"
                  placeholder={currency === 'INR' ? "e.g. 1200000" : "e.g. 50000"}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {frequencyOptions.map(f => (
                  <button
                    key={f.id}
                    onClick={() => setInputFrequency(f.id)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                      inputFrequency === f.id 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <AnimatePresence>
                {inputFrequency === 'monthly' && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }} 
                    animate={{ opacity: 1, height: 'auto' }} 
                    exit={{ opacity: 0, height: 0 }}
                    className="pt-4 border-t border-slate-100 overflow-hidden"
                  >
                    <label className="block text-xs font-semibold text-slate-500 mb-2">Select Month (Live {results.currentYear} Calendar)</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-blue-700 outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition-all cursor-pointer"
                    >
                      {months.map((m, i) => (
                        <option key={i} value={i}>{m} {results.currentYear}</option>
                      ))}
                    </select>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="pt-4 border-t border-slate-100">
                <label className="block text-xs font-semibold text-slate-500 mb-3">Select Working Days</label>
                <div className="flex gap-2 justify-between">
                  {daysOfWeekList.map(d => (
                    <button
                      key={`${d.id}-${d.label}`}
                      onClick={() => {
                        if (workingDaysSelection.includes(d.id)) {
                          setWorkingDaysSelection(prev => prev.filter(id => id !== d.id));
                        } else {
                          setWorkingDaysSelection(prev => [...prev, d.id]);
                        }
                      }}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all ${
                        workingDaysSelection.includes(d.id)
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">
                    {inputFrequency === 'monthly' ? 'Holidays (Select. Month)' : 'Holidays (Per Year)'}
                  </label>
                  <input
                    type="number"
                    value={holidays}
                    onChange={(e) => setHolidays(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-400 outline-none hover:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Hours per Day</label>
                  <input
                    type="number"
                    value={hoursPerDay}
                    onChange={(e) => setHoursPerDay(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-blue-400 outline-none hover:bg-white transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Conversion Results Card */}
          <div className="bg-slate-900 p-6 rounded-3xl text-white shadow-xl relative overflow-hidden">
            <div className="absolute -top-4 -right-4 p-4 opacity-10 pointer-events-none">
              <Banknote className="w-48 h-48" />
            </div>
            <div className="relative z-10">
              <h3 className="text-blue-300 font-bold uppercase tracking-widest text-xs mb-5 flex items-center gap-2">
                <CalendarDays className="w-4 h-4" /> Calculated Conversions
              </h3>
              
              <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-3">
                  <span className="text-slate-300 text-sm font-medium">Annually</span>
                  <span className="text-2xl font-black text-white">{formatCurrency(results.annually)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/10 pb-3">
                  <span className="text-slate-300 text-sm font-medium">Monthly</span>
                  <span className="text-xl font-bold text-blue-50">{formatCurrency(results.monthly)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/10 pb-3">
                  <span className="text-slate-300 text-sm font-medium">Bi-Weekly</span>
                  <span className="text-xl font-bold text-blue-50">{formatCurrency(results.biweekly)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/10 pb-3">
                  <span className="text-slate-300 text-sm font-medium">Weekly</span>
                  <span className="text-xl font-bold text-blue-50">{formatCurrency(results.weekly)}</span>
                </div>
                <div className="flex justify-between items-end border-b border-white/10 pb-3">
                  <span className="text-slate-300 text-sm font-medium">Daily</span>
                  <span className="text-xl font-bold text-blue-50">{formatCurrency(results.daily)}</span>
                </div>
                <div className="flex justify-between items-end pt-1">
                  <span className="text-slate-300 text-sm font-medium">Hourly</span>
                  <span className="text-xl font-bold text-blue-50">{formatCurrency(results.hourly)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Formulas Column */}
        <div className="bg-blue-50/80 p-6 md:p-8 rounded-3xl border border-blue-100 flex flex-col h-full shadow-sm">
          <h3 className="text-xl font-black text-blue-950 flex items-center gap-2 mb-8">
            <BookOpen className="w-6 h-6 text-blue-600" /> How It's Calculated
          </h3>
          
          <div className="space-y-8 flex-1 text-sm text-slate-700">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="mt-1 shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md">1</div>
              <div>
                <h4 className="text-base font-bold text-slate-900 mb-2">Find the Annual Gross Salary</h4>
                <p className="mb-3 leading-relaxed text-slate-600">First, we convert your input into a total yearly amount. We assume there are exactly 52 working weeks in a standard year.</p>
                <div className="bg-white p-4 rounded-2xl border border-blue-100 font-mono text-sm text-blue-800 shadow-sm overflow-x-auto whitespace-nowrap">
                  {inputFrequency === 'hourly' && <>Annual = <span className="font-bold">Hourly ({formatCurrency(results.input)})</span> × {results.hpd} hrs/day × {results.netYearWorkDays} days/yr<br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                  {inputFrequency === 'daily' && <>Annual = <span className="font-bold">Daily ({formatCurrency(results.input)})</span> × {results.netYearWorkDays} days/yr<br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                  {inputFrequency === 'weekly' && <>Annual = <span className="font-bold">Weekly ({formatCurrency(results.input)})</span> × 52 wks<br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                  {inputFrequency === 'biweekly' && <>Annual = <span className="font-bold">Bi-Weekly ({formatCurrency(results.input)})</span> × 26 periods<br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                  {inputFrequency === 'monthly' && <>Annual = <span className="font-bold">Monthly ({formatCurrency(results.input)})</span> × 12 months<br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                  {inputFrequency === 'annually' && <>Annual = <span className="font-bold">Input Amount</span><br /><span className="text-slate-400 mt-1 block">Annual = {formatCurrency(results.annually)}</span></>}
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="mt-1 shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-black text-sm shadow-md">2</div>
              <div className="w-full">
                <h4 className="text-base font-bold text-slate-900 mb-2">Break It Down Into Frequencies</h4>
                <p className="mb-3 leading-relaxed text-slate-600">Once we have the Annual Salary ({formatCurrency(results.annually)}), we divide it using standard payroll formulas.</p>
                <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm">
                  <ul className="space-y-4 font-mono text-[13px]">
                    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                       <span className="text-slate-500">Monthly</span> 
                       <span className="bg-slate-50 px-2 py-1 rounded text-slate-700">Annual ÷ 12 <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.monthly)}</span></span>
                    </li>
                    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                       <span className="text-slate-500">Bi-Weekly</span> 
                       <span className="bg-slate-50 px-2 py-1 rounded text-slate-700">Annual ÷ 26 <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.biweekly)}</span></span>
                    </li>
                    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                       <span className="text-slate-500">Weekly</span> 
                       <span className="bg-slate-50 px-2 py-1 rounded text-slate-700">Annual ÷ 52 <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.weekly)}</span></span>
                    </li>
                    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3 gap-2">
                       <span className="text-slate-500">Daily</span> 
                       <span className="bg-slate-50 px-2 py-1 rounded text-slate-700">
                         {inputFrequency === 'monthly' ? (
                            <>Monthly ÷ {results.netMonthWorkDays} net work days <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.daily)}</span></>
                         ) : (
                            <>Annual ÷ {results.netYearWorkDays} net days/yr <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.daily)}</span></>
                         )}
                       </span>
                    </li>
                    <li className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                       <span className="text-slate-500">Hourly</span> 
                       <span className="bg-slate-50 px-2 py-1 rounded text-slate-700">
                            Daily ÷ {results.hpd} hrs/day <span className="text-blue-500 font-bold ml-2">→ {formatCurrency(results.hourly)}</span>
                       </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-blue-100/60 p-5 rounded-2xl mt-8 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 leading-relaxed font-medium">
              <strong>Gross Pay Only:</strong> These calculations reflect Gross Pay (before taxes, retirement, insurance, or deductions). True take-home pay will be lower.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
