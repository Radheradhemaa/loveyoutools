import { Link } from 'react-router-dom';
import { blogPosts } from '../data/blog';
import { Calendar, User, ArrowRight, ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Blog() {
  return (
    <div className="max-w-[1380px] mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <SEO 
        title="Blog - LoveYouTools" 
        description="Read our latest guides, tips, and news about online tools, productivity, and privacy."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <div className="text-center mb-16">
        <h1 className="text-5xl font-extrabold mb-4">Our Blog</h1>
        <p className="text-xl text-text-secondary max-w-2xl mx-auto">
          Guides, tips, and insights to help you make the most of our tools and stay safe online.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {blogPosts.map((post) => (
          <article key={post.id} className="bg-surface border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-all flex flex-col">
            <Link to={`/blog/${post.id}`} className="block aspect-video overflow-hidden">
              <img 
                src={post.image} 
                alt={post.title} 
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
            </Link>
            <div className="p-6 flex-grow flex flex-col">
              <div className="flex items-center gap-4 text-xs text-text-muted mb-4">
                <span className="bg-accent/10 text-accent px-2 py-1 rounded-md font-bold uppercase tracking-wider">
                  {post.category}
                </span>
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {post.date}
                </div>
              </div>
              <h2 className="text-xl font-bold mb-3 hover:text-accent transition-colors">
                <Link to={`/blog/${post.id}`}>{post.title}</Link>
              </h2>
              <p className="text-text-secondary text-sm mb-6 line-clamp-3 flex-grow">
                {post.excerpt}
              </p>
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-border">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent">
                    <User className="w-4 h-4" />
                  </div>
                  {post.author}
                </div>
                <Link to={`/blog/${post.id}`} className="text-accent font-bold text-sm flex items-center gap-1 hover:gap-2 transition-all">
                  Read More <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
