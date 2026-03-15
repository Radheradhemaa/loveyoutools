import { Wrench, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function GenericTool({ tool }: { tool: any }) {
  return (
    <div className="text-center py-16 px-4">
      <div 
        className="w-24 h-24 rounded-3xl flex items-center justify-center text-5xl mx-auto mb-6 shadow-sm"
        style={{ backgroundColor: tool.b }}
      >
        {tool.i}
      </div>
      <h2 className="text-3xl font-bold text-text-primary mb-4">{tool.n}</h2>
      <p className="text-text-secondary text-lg max-w-2xl mx-auto mb-8">
        This tool is currently under development. We are working hard to bring you the best {tool.n} experience directly in your browser.
      </p>
      
      <div className="bg-bg-secondary border border-border rounded-[14px] p-8 max-w-xl mx-auto mb-8">
        <Wrench className="w-12 h-12 text-accent mx-auto mb-4" />
        <h3 className="font-bold text-xl mb-2">In Development</h3>
        <p className="text-text-muted text-sm">
          Our engineers are building this tool using vanilla JavaScript and HTML5 APIs to ensure it's fast, secure, and works entirely offline.
        </p>
      </div>

      <div className="flex justify-center gap-4">
        <Link to="/" className="btn bp gap-2">
          Explore Other Tools <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
