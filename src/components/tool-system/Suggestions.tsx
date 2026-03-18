import React from 'react';
import { Link } from 'react-router-dom';
import { tools, categories } from '../../data/tools';
import { ChevronRight, Star, ArrowRight, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface SuggestionsProps {
  toolId: string;
  showFullGrid?: boolean;
  faq?: { q: string; a: string }[];
}

export default function Suggestions({ toolId, showFullGrid = false, faq }: SuggestionsProps) {
  const currentTool = tools.find(t => t.id === toolId);
  const relatedTools = tools
    .filter(t => t.id !== toolId && t.c === currentTool?.c)
    .slice(0, 4);

  const recommendedTools = tools
    .filter(t => t.id !== toolId)
    .sort(() => Math.random() - 0.5)
    .slice(0, 8);

  return (
    <div className="mt-20 space-y-20">
      {/* Related Tools */}
      <section>
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-2xl font-black text-text-primary tracking-tight">Related Tools</h3>
          <Link to="/" className="text-sm font-bold text-accent hover:underline flex items-center gap-1">
            Browse all <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {relatedTools.map((tool, index) => (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Link
                to={`/${tool.id}`}
                className="group p-6 bg-surface border border-border rounded-3xl hover:border-accent/30 hover:shadow-2xl hover:shadow-accent/5 transition-all block h-full"
              >
                <div className="w-12 h-12 bg-bg-secondary text-2xl flex items-center justify-center rounded-2xl mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                  {tool.i}
                </div>
                <h4 className="font-black text-text-primary mb-2 tracking-tight group-hover:text-accent transition-colors">
                  {tool.n}
                </h4>
                <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                  {tool.d}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* FAQ Section */}
      {faq && faq.length > 0 && (
        <section className="bg-bg-secondary/50 rounded-[40px] p-12 sm:p-20 border border-border">
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-12 bg-accent text-white rounded-2xl flex items-center justify-center shadow-lg shadow-accent/20">
              <HelpCircle className="w-6 h-6" />
            </div>
            <h3 className="text-3xl font-black text-text-primary tracking-tight">Frequently Asked Questions</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            {faq.map((item, index) => (
              <div key={index} className="space-y-4">
                <h4 className="text-lg font-black text-text-primary tracking-tight flex gap-3">
                  <span className="text-accent">Q.</span> {item.q}
                </h4>
                <p className="text-text-muted leading-relaxed pl-8 border-l-2 border-border">
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Grid (Shown after download or if explicitly requested) */}
      {(showFullGrid || !faq) && (
        <section>
          <div className="text-center mb-12">
            <h3 className="text-3xl font-black text-text-primary tracking-tight mb-4">Recommended for You</h3>
            <p className="text-text-muted">Discover more tools to simplify your digital workflow.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {recommendedTools.map((tool, index) => (
              <Link
                key={tool.id}
                to={`/${tool.id}`}
                className="group p-6 bg-surface border border-border rounded-3xl hover:border-accent/30 hover:shadow-2xl hover:shadow-accent/5 transition-all flex items-center gap-4"
              >
                <div className="w-12 h-12 bg-bg-secondary text-2xl flex items-center justify-center rounded-2xl shrink-0 group-hover:scale-110 group-hover:rotate-3 transition-transform">
                  {tool.i}
                </div>
                <div className="min-w-0">
                  <h4 className="font-black text-text-primary text-sm tracking-tight truncate group-hover:text-accent transition-colors">
                    {tool.n}
                  </h4>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    <span className="text-[10px] font-bold text-text-muted uppercase tracking-widest">Popular</span>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-text-muted ml-auto opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
