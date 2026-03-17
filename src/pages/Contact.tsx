import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MessageSquare, Send, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Contact() {
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title="Contact Us - LoveTools" 
        description="Get in touch with the LoveTools team for support, suggestions, or feedback."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="text-center mb-12">
        <h1 className="text-4xl font-extrabold mb-4">Get in Touch</h1>
        <p className="text-xl text-text-secondary">Have a question or suggestion? We'd love to hear from you.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-1 space-y-6">
          <div className="bg-surface border border-border rounded-2xl p-6">
            <div className="w-12 h-12 bg-accent/10 text-accent rounded-xl flex items-center justify-center mb-4">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="font-bold mb-1">Email Us</h3>
            <p className="text-sm text-text-muted">support@lovetools.io</p>
          </div>
          <div className="bg-surface border border-border rounded-2xl p-6">
            <div className="w-12 h-12 bg-accent/10 text-accent rounded-xl flex items-center justify-center mb-4">
              <MessageSquare className="w-6 h-6" />
            </div>
            <h3 className="font-bold mb-1">Social Media</h3>
            <p className="text-sm text-text-muted">@lovetools</p>
          </div>
        </div>

        <div className="md:col-span-2">
          {submitted ? (
            <div className="bg-success/10 border border-success/20 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-success text-white rounded-full flex items-center justify-center mx-auto mb-6">
                <Send className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-success mb-2">Message Sent!</h2>
              <p className="text-text-secondary">Thank you for reaching out. We'll get back to you as soon as possible.</p>
              <button 
                onClick={() => setSubmitted(false)}
                className="mt-8 text-accent font-bold hover:underline"
              >
                Send another message
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-2xl p-8 space-y-6 shadow-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="fg">
                  <label className="fl">Name</label>
                  <input type="text" className="fi" placeholder="John Doe" required />
                </div>
                <div className="fg">
                  <label className="fl">Email</label>
                  <input type="email" className="fi" placeholder="john@example.com" required />
                </div>
              </div>
              <div className="fg">
                <label className="fl">Subject</label>
                <input type="text" className="fi" placeholder="How can we help?" required />
              </div>
              <div className="fg">
                <label className="fl">Message</label>
                <textarea className="fi min-h-[150px] py-3" placeholder="Tell us more..." required></textarea>
              </div>
              <button type="submit" className="btn bp w-full py-4 text-lg font-bold gap-2">
                <Send className="w-5 h-5" /> Send Message
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
