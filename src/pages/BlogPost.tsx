import { useParams, Link, Navigate } from 'react-router-dom';
import { blogPosts } from '../data/blog';
import { tools } from '../data/tools';
import { Calendar, User, ArrowLeft, Share2, Facebook, Twitter, Linkedin } from 'lucide-react';
import SEO from '../components/SEO';

export default function BlogPost() {
  const { id } = useParams();
  const post = blogPosts.find(p => p.id === id);

  if (!post) {
    return <Navigate to="/blog" replace />;
  }

  const relatedTool = post.toolId ? tools.find(t => t.id === post.toolId) : null;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "image": post.image,
    "author": {
      "@type": "Person",
      "name": post.author
    },
    "datePublished": post.date,
    "publisher": {
      "@type": "Organization",
      "name": "LoveYouTools",
      "logo": {
        "@type": "ImageObject",
        "url": `${window.location.origin}/images/loveyoutools-logo.png`
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": window.location.href
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title={`${post.title} - LoveYouTools Blog`} 
        description={post.excerpt}
        url={window.location.href}
        type="article"
        image={post.image}
        schema={articleSchema}
      />
      
      <Link to="/blog" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Blog
      </Link>

      <article>
        <header className="mb-12">
          <div className="flex items-center gap-4 text-sm text-text-muted mb-6">
            <span className="bg-accent/10 text-accent px-3 py-1 rounded-full font-bold uppercase tracking-wider text-xs">
              {post.category}
            </span>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" /> {post.date}
            </div>
            <div className="flex items-center gap-1">
              <User className="w-4 h-4" /> {post.author}
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-8 leading-tight">{post.title}</h1>
          <img 
            src={post.image} 
            alt={post.title} 
            className="w-full aspect-video object-cover rounded-3xl shadow-lg"
            referrerPolicy="no-referrer"
          />
        </header>

        <div 
          className="prose prose-lg dark:prose-invert max-w-none mb-16 text-text-secondary
            prose-headings:text-text-primary prose-strong:text-text-primary
            prose-a:text-accent prose-a:no-underline hover:prose-a:underline"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />

        {relatedTool && (
          <div className="bg-accent/5 border border-accent/20 rounded-3xl p-8 mb-16 flex flex-col sm:flex-row items-center gap-8">
            <div className="w-20 h-20 bg-surface rounded-2xl flex items-center justify-center text-4xl shadow-sm">
              {relatedTool.i}
            </div>
            <div className="text-center sm:text-left flex-grow">
              <h3 className="text-xl font-bold mb-2">Try the {relatedTool.n}</h3>
              <p className="text-text-secondary mb-0">{relatedTool.d}</p>
            </div>
            <Link to={`/${relatedTool.id}`} className="btn bp whitespace-nowrap px-8">
              Open Tool
            </Link>
          </div>
        )}

        <footer className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-bold text-text-muted uppercase tracking-widest">Share</span>
            <div className="flex gap-2">
              <button className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all">
                <Facebook className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all">
                <Twitter className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all">
                <Linkedin className="w-4 h-4" />
              </button>
              <button className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center hover:bg-accent hover:text-white hover:border-accent transition-all">
                <Share2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2">
            {['Tools', 'Guide', post.category].map(tag => (
              <span key={tag} className="text-xs font-medium px-3 py-1 bg-bg-secondary text-text-muted rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        </footer>
      </article>
    </div>
  );
}
