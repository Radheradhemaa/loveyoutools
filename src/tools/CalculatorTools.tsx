import React, { useState, useEffect } from 'react';
import { Calculator, Info, RefreshCw, ArrowRight, Percent, Landmark, Receipt, Tag, Scale, Calendar, TrendingUp, Coins } from 'lucide-react';

export default function CalculatorTools({ toolId }: { toolId: string }) {
  const [inputs, setInputs] = useState<any>({});
  const [result, setResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('1');

  useEffect(() => {
    setInputs({});
    setResult(null);
    setActiveTab('1');
  }, [toolId]);

  const calculate = () => {
    let res: any = null;
    switch (toolId) {
      case 'percentage-calculator':
        const v1 = parseFloat(inputs.v1 || 0);
        const v2 = parseFloat(inputs.v2 || 0);
        if (activeTab === '1') {
          res = { 'Result': `${v1}% of ${v2} is ${(v1 / 100) * v2}` };
        } else if (activeTab === '2') {
          res = { 'Result': `${v1} is ${((v1 / v2) * 100).toFixed(2)}% of ${v2}` };
        } else {
          const diff = v2 - v1;
          const percent = (diff / v1) * 100;
          res = {
            'Difference': diff.toFixed(2),
            'Percentage Change': `${percent.toFixed(2)}%`,
            'Type': percent >= 0 ? 'Increase' : 'Decrease'
          };
        }
        break;

      case 'loan-emi-calculator':
        const p = parseFloat(inputs.p || 0);
        const r = parseFloat(inputs.r || 0) / 12 / 100;
        const n = parseFloat(inputs.n || 0) * 12;
        if (p > 0 && r > 0 && n > 0) {
          const emi = p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
          const totalPayment = emi * n;
          const totalInterest = totalPayment - p;
          res = {
            'Monthly EMI': `₹${emi.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Principal Amount': `₹${p.toLocaleString()}`,
            'Total Interest': `₹${totalInterest.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Amount Payable': `₹${totalPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          };
        }
        break;

      case 'gst-calculator':
        const amt = parseFloat(inputs.amt || 0);
        const rate = parseFloat(inputs.rate || 0);
        const gst = (amt * rate) / 100;
        if (activeTab === '1') { // Add GST
          res = {
            'Net Amount': `₹${amt.toLocaleString()}`,
            'GST Amount': `₹${gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Amount (Incl. GST)': `₹${(amt + gst).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          };
        } else { // Remove GST
          const original = amt / (1 + rate / 100);
          const gstRemoved = amt - original;
          res = {
            'Total Amount (Incl. GST)': `₹${amt.toLocaleString()}`,
            'GST Amount': `₹${gstRemoved.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Net Amount (Excl. GST)': `₹${original.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          };
        }
        break;

      case 'discount-calculator':
        const price = parseFloat(inputs.price || 0);
        const disc = parseFloat(inputs.disc || 0);
        const tax = parseFloat(inputs.tax || 0);
        const savings = (price * disc) / 100;
        const discountedPrice = price - savings;
        const taxAmount = (discountedPrice * tax) / 100;
        const finalPrice = discountedPrice + taxAmount;
        res = {
          'Original Price': `₹${price.toLocaleString()}`,
          'Savings': `₹${savings.toLocaleString()}`,
          'Price After Discount': `₹${discountedPrice.toLocaleString()}`,
          'Tax Amount': `₹${taxAmount.toLocaleString()}`,
          'Final Price': `₹${finalPrice.toLocaleString()}`
        };
        break;

      case 'bmi-calculator':
        const weight = parseFloat(inputs.w || 0);
        const height = parseFloat(inputs.h || 0) / 100;
        if (weight > 0 && height > 0) {
          const bmi = weight / (height * height);
          let category = '';
          if (bmi < 18.5) { category = 'Underweight'; }
          else if (bmi < 25) { category = 'Normal Weight'; }
          else if (bmi < 30) { category = 'Overweight'; }
          else { category = 'Obese'; }
          
          res = {
            'Your BMI': bmi.toFixed(1),
            'Category': category,
            'Healthy Range': '18.5 - 24.9'
          };
        }
        break;

      case 'date-difference-calculator':
        const d1 = new Date(inputs.d1);
        const d2 = new Date(inputs.d2);
        if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
          const diffTime = Math.abs(d2.getTime() - d1.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const years = Math.floor(diffDays / 365);
          const months = Math.floor((diffDays % 365) / 30.44);
          const days = Math.floor((diffDays % 365) % 30.44);
          
          res = {
            'Total Days': diffDays.toLocaleString(),
            'Total Weeks': (diffDays / 7).toFixed(1),
            'Formatted': `${years} Years, ${months} Months, ${days} Days`
          };
        }
        break;

      case 'compound-interest-calculator':
        const cp = parseFloat(inputs.p || 0);
        const cr = parseFloat(inputs.r || 0) / 100;
        const ct = parseFloat(inputs.t || 0);
        const cf = parseFloat(inputs.f || 1);
        if (cp > 0 && cr > 0 && ct > 0) {
          const ca = cp * Math.pow(1 + cr / cf, cf * ct);
          res = {
            'Principal Amount': `₹${cp.toLocaleString()}`,
            'Total Interest': `₹${(ca - cp).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            'Total Value': `₹${ca.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          };
        }
        break;

      case 'tip-calculator':
        const bill = parseFloat(inputs.bill || 0);
        const tip = parseFloat(inputs.tip || 0);
        const ppl = parseFloat(inputs.ppl || 1);
        if (bill > 0) {
          const tipAmt = (bill * tip) / 100;
          const total = bill + tipAmt;
          res = {
            'Tip Amount': `₹${tipAmt.toFixed(2)}`,
            'Total Bill': `₹${total.toFixed(2)}`,
            'Per Person': `₹${(total / ppl).toFixed(2)}`
          };
        }
        break;
    }
    setResult(res);
  };

  const clear = () => {
    setInputs({});
    setResult(null);
  };

  const renderIcon = () => {
    switch (toolId) {
      case 'percentage-calculator': return <Percent className="w-5 h-5" />;
      case 'loan-emi-calculator': return <Landmark className="w-5 h-5" />;
      case 'gst-calculator': return <Receipt className="w-5 h-5" />;
      case 'discount-calculator': return <Tag className="w-5 h-5" />;
      case 'bmi-calculator': return <Scale className="w-5 h-5" />;
      case 'date-difference-calculator': return <Calendar className="w-5 h-5" />;
      case 'compound-interest-calculator': return <TrendingUp className="w-5 h-5" />;
      case 'tip-calculator': return <Coins className="w-5 h-5" />;
      default: return <Calculator className="w-5 h-5" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold flex items-center gap-2">
              {renderIcon()}
              Calculator Settings
            </h3>
            <button onClick={clear} className="text-text-muted hover:text-accent transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            {toolId === 'percentage-calculator' && (
              <>
                <div className="flex p-1 bg-bg-secondary rounded-xl mb-4">
                  {['1', '2', '3'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => { setActiveTab(tab); setResult(null); }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === tab ? 'bg-surface text-accent shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
                    >
                      {tab === '1' ? 'X% of Y' : tab === '2' ? 'X is what % of Y' : '% Change'}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">{activeTab === '3' ? 'Initial Value' : 'Value 1'}</label>
                    <input type="number" className="fi" value={inputs.v1 || ''} onChange={e => setInputs({...inputs, v1: e.target.value})} placeholder="0" />
                  </div>
                  <div className="fg">
                    <label className="fl">{activeTab === '3' ? 'Final Value' : 'Value 2'}</label>
                    <input type="number" className="fi" value={inputs.v2 || ''} onChange={e => setInputs({...inputs, v2: e.target.value})} placeholder="0" />
                  </div>
                </div>
              </>
            )}

            {toolId === 'loan-emi-calculator' && (
              <>
                <div className="fg">
                  <label className="fl">Loan Amount (Principal)</label>
                  <input type="number" className="fi" value={inputs.p || ''} onChange={e => setInputs({...inputs, p: e.target.value})} placeholder="e.g. 500000" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">Interest Rate (% p.a.)</label>
                    <input type="number" className="fi" value={inputs.r || ''} onChange={e => setInputs({...inputs, r: e.target.value})} placeholder="e.g. 8.5" />
                  </div>
                  <div className="fg">
                    <label className="fl">Loan Tenure (Years)</label>
                    <input type="number" className="fi" value={inputs.n || ''} onChange={e => setInputs({...inputs, n: e.target.value})} placeholder="e.g. 5" />
                  </div>
                </div>
              </>
            )}

            {toolId === 'gst-calculator' && (
              <>
                <div className="flex p-1 bg-bg-secondary rounded-xl mb-4">
                  <button onClick={() => setActiveTab('1')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === '1' ? 'bg-surface text-accent shadow-sm' : 'text-text-muted'}`}>Add GST</button>
                  <button onClick={() => setActiveTab('2')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === '2' ? 'bg-surface text-accent shadow-sm' : 'text-text-muted'}`}>Remove GST</button>
                </div>
                <div className="fg">
                  <label className="fl">Amount</label>
                  <input type="number" className="fi" value={inputs.amt || ''} onChange={e => setInputs({...inputs, amt: e.target.value})} placeholder="0" />
                </div>
                <div className="fg">
                  <label className="fl">GST Rate (%)</label>
                  <select className="fi" value={inputs.rate || '18'} onChange={e => setInputs({...inputs, rate: e.target.value})}>
                    {[5, 12, 18, 28].map(r => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </>
            )}

            {toolId === 'discount-calculator' && (
              <>
                <div className="fg">
                  <label className="fl">Original Price</label>
                  <input type="number" className="fi" value={inputs.price || ''} onChange={e => setInputs({...inputs, price: e.target.value})} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">Discount (%)</label>
                    <input type="number" className="fi" value={inputs.disc || ''} onChange={e => setInputs({...inputs, disc: e.target.value})} placeholder="0" />
                  </div>
                  <div className="fg">
                    <label className="fl">Tax (%) (Optional)</label>
                    <input type="number" className="fi" value={inputs.tax || ''} onChange={e => setInputs({...inputs, tax: e.target.value})} placeholder="0" />
                  </div>
                </div>
              </>
            )}

            {toolId === 'bmi-calculator' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">Weight (kg)</label>
                    <input type="number" className="fi" value={inputs.w || ''} onChange={e => setInputs({...inputs, w: e.target.value})} placeholder="e.g. 70" />
                  </div>
                  <div className="fg">
                    <label className="fl">Height (cm)</label>
                    <input type="number" className="fi" value={inputs.h || ''} onChange={e => setInputs({...inputs, h: e.target.value})} placeholder="e.g. 175" />
                  </div>
                </div>
              </>
            )}

            {toolId === 'date-difference-calculator' && (
              <>
                <div className="fg">
                  <label className="fl">Start Date</label>
                  <input type="date" className="fi" value={inputs.d1 || ''} onChange={e => setInputs({...inputs, d1: e.target.value})} />
                </div>
                <div className="fg">
                  <label className="fl">End Date</label>
                  <input type="date" className="fi" value={inputs.d2 || ''} onChange={e => setInputs({...inputs, d2: e.target.value})} />
                </div>
              </>
            )}

            {toolId === 'compound-interest-calculator' && (
              <>
                <div className="fg">
                  <label className="fl">Principal Amount</label>
                  <input type="number" className="fi" value={inputs.p || ''} onChange={e => setInputs({...inputs, p: e.target.value})} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">Interest Rate (%)</label>
                    <input type="number" className="fi" value={inputs.r || ''} onChange={e => setInputs({...inputs, r: e.target.value})} placeholder="0" />
                  </div>
                  <div className="fg">
                    <label className="fl">Time (Years)</label>
                    <input type="number" className="fi" value={inputs.t || ''} onChange={e => setInputs({...inputs, t: e.target.value})} placeholder="0" />
                  </div>
                </div>
                <div className="fg">
                  <label className="fl">Compounding Frequency</label>
                  <select className="fi" value={inputs.f || '1'} onChange={e => setInputs({...inputs, f: e.target.value})}>
                    <option value="1">Annually</option>
                    <option value="2">Semi-Annually</option>
                    <option value="4">Quarterly</option>
                    <option value="12">Monthly</option>
                  </select>
                </div>
              </>
            )}

            {toolId === 'tip-calculator' && (
              <>
                <div className="fg">
                  <label className="fl">Bill Amount</label>
                  <input type="number" className="fi" value={inputs.bill || ''} onChange={e => setInputs({...inputs, bill: e.target.value})} placeholder="0" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="fg">
                    <label className="fl">Tip (%)</label>
                    <input type="number" className="fi" value={inputs.tip || ''} onChange={e => setInputs({...inputs, tip: e.target.value})} placeholder="e.g. 10" />
                  </div>
                  <div className="fg">
                    <label className="fl">Split (People)</label>
                    <input type="number" className="fi" value={inputs.ppl || ''} onChange={e => setInputs({...inputs, ppl: e.target.value})} placeholder="1" />
                  </div>
                </div>
              </>
            )}

            <button onClick={calculate} className="btn bp w-full py-4 text-lg font-bold gap-2 mt-4 shadow-lg shadow-accent/20">
              <Calculator className="w-5 h-5" /> Calculate Now
            </button>
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
                <h4 className="text-sm font-bold text-text-muted uppercase tracking-wider mb-4">Calculation Results</h4>
                {Object.entries(result).map(([key, val]) => (
                  <div key={key} className="bg-surface p-5 rounded-2xl border border-border shadow-sm flex justify-between items-center group hover:border-accent transition-all">
                    <div className="text-left">
                      <div className="text-xs text-text-muted font-bold uppercase mb-1">{key}</div>
                      <div className="text-2xl font-black text-accent">{String(val)}</div>
                    </div>
                    <div className="w-10 h-10 rounded-full bg-accent/5 flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all">
                      <ArrowRight className="w-5 h-5" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-text-muted flex flex-col items-center relative z-10">
                <div className="w-20 h-20 rounded-full bg-border/30 flex items-center justify-center mb-6">
                  <Calculator className="w-10 h-10 opacity-30" />
                </div>
                <h4 className="text-xl font-bold text-text-primary mb-2">Ready to Calculate</h4>
                <p className="max-w-[200px]">Enter your numbers on the left to see the magic happen.</p>
              </div>
            )}
          </div>

          <div className="bg-accent/5 border border-accent/10 rounded-2xl p-6">
            <h4 className="font-bold flex items-center gap-2 text-accent mb-2">
              <Info className="w-4 h-4" />
              Pro Tip
            </h4>
            <p className="text-sm text-text-secondary leading-relaxed">
              All calculations are done locally in your browser. Your financial data is never sent to any server, keeping it 100% private and secure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
