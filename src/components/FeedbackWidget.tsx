import React, { useState } from 'react';
import { MessageSquare, X, Smartphone, CheckCircle2 } from 'lucide-react';

export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'feedback' | 'whatsapp' | 'success'>('feedback');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMode('success');
    setTimeout(() => {
      setIsOpen(false);
    }, 3000);
  };

  const handleWhatsAppOptIn = (e: React.FormEvent) => {
    e.preventDefault();
    setMode('success');
    setTimeout(() => {
      setIsOpen(false);
    }, 3000);
  };

  return (
    <>
      <button
        onClick={() => {
          setIsOpen(true);
          setMode('feedback');
        }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-accent text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-black hover:scale-105 transition-all z-40"
        title="Send Feedback"
      >
        <MessageSquare className="w-6 h-6" />
      </button>

      {isOpen && (
        <div className="fixed bottom-24 right-6 w-[360px] bg-surface border border-border shadow-2xl rounded-2xl overflow-hidden z-50 flex flex-col">
          <div className="bg-bg-secondary p-4 flex justify-between items-center border-b border-border">
            <h3 className="font-bold text-lg text-text-primary">
              {mode === 'whatsapp' ? 'WhatsApp Updates' : 'We value your input!'}
            </h3>
            <button onClick={() => setIsOpen(false)} className="text-text-muted hover:text-red-500">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 flex-1 max-h-[70vh] overflow-y-auto">
            {mode === 'success' ? (
              <div className="text-center py-8">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-4" />
                <h4 className="font-bold text-lg mb-2">Thank You!</h4>
                <p className="text-sm text-text-secondary">Your feedback helps us improve LoveyouTools.</p>
              </div>
            ) : mode === 'feedback' ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-text-secondary">Did you encounter a bug, or have a feature request? Let us know.</p>
                <div className="fg">
                  <label className="fl">Rating</label>
                  <select className="fi" required defaultValue="5">
                    <option value="5">⭐⭐⭐⭐⭐ - Excellent</option>
                    <option value="4">⭐⭐⭐⭐ - Good</option>
                    <option value="3">⭐⭐⭐ - Okay</option>
                    <option value="2">⭐⭐ - Poor</option>
                    <option value="1">⭐ - Terrible</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Your Feedback</label>
                  <textarea className="fi min-h-[100px] text-sm" placeholder="Tell us what you think..." required></textarea>
                </div>
                <button type="submit" className="btn bp w-full">Submit Feedback</button>
                <div className="text-center mt-3 pt-3 border-t border-border">
                  <button 
                    type="button" 
                    onClick={() => setMode('whatsapp')}
                    className="text-xs text-accent font-medium hover:underline flex items-center justify-center gap-1 w-full"
                  >
                    <Smartphone className="w-3 h-3" /> Get Updates via WhatsApp
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleWhatsAppOptIn} className="space-y-4">
                <p className="text-sm text-text-secondary">Opt-in to our WhatsApp Confirmation System to receive direct updates, tool links, and support.</p>
                <div className="fg">
                  <label className="fl flex justify-between">
                    <span>Phone Number</span>
                    <span className="text-[10px] text-text-muted">Will not be shared</span>
                  </label>
                  <input type="tel" className="fi" placeholder="+1 (555) 000-0000" required />
                </div>
                <div className="fg">
                  <label className="fl">Preferred Language</label>
                  <select className="fi">
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="es">Spanish</option>
                  </select>
                </div>
                <label className="flex items-start gap-2 cursor-pointer mt-2 text-xs text-text-muted">
                  <input type="checkbox" required className="mt-0.5 rounded text-accent" />
                  <span>I agree to receive messages from LoveyouTools. I can opt out anytime.</span>
                </label>
                <div className="flex gap-2">
                   <button type="button" onClick={() => setMode('feedback')} className="btn bs flex-1">Back</button>
                   <button type="submit" className="btn bp flex-1">Subscribe</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
