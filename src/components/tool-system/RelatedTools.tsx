import React from 'react';
import { Link } from 'react-router-dom';
import { tools } from '../../data/tools';
import { ArrowRight } from 'lucide-react';

interface RelatedToolsProps {
  currentToolId: string;
  limit?: number;
}

export default function RelatedTools({ currentToolId, limit = 3 }: RelatedToolsProps) {
  // Find current tool to get its category
  const currentTool = tools.find(t => t.id === currentToolId);
  
  // Filter tools in the same category, excluding the current one
  const related = tools
    .filter(t => t.id !== currentToolId && t.c === currentTool?.c)
    .slice(0, limit);

  // If not enough related tools in same category, add some popular ones
  if (related.length < limit) {
    const others = tools
      .filter(t => t.id !== currentToolId && !related.find(r => r.id === t.id))
      .slice(0, limit - related.length);
    related.push(...others);
  }

  return (
    <div className="space-y-4 pt-6 border-t border-border/50">
      <h3 className="font-bold text-sm uppercase tracking-wider text-text-muted flex items-center justify-between">
        Related Tools
        <Link to="/" className="text-[10px] text-accent hover:underline flex items-center gap-1 normal-case tracking-normal">
          View All <ArrowRight className="w-2 h-2" />
        </Link>
      </h3>
      <div className="grid gap-3">
        {related.map(tool => (
          <Link
            key={tool.id}
            to={`/${tool.id}`}
            className="group flex items-center gap-3 p-2 rounded-xl border border-border/50 bg-bg-secondary/30 hover:bg-accent/5 hover:border-accent/20 transition-all"
          >
            <div 
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-sm group-hover:scale-110 transition-transform"
              style={{ backgroundColor: tool.b }}
            >
              <span>{tool.i}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold text-text-primary truncate group-hover:text-accent transition-colors">
                {tool.n}
              </h4>
              <p className="text-[10px] text-text-muted truncate">
                {tool.c}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
