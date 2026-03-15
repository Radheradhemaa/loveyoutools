import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEO from '../components/SEO';

export default function Privacy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <SEO 
        title="Privacy Policy - LoveYouTools" 
        description="Read our privacy policy to understand how we handle your data and protect your privacy."
        url={window.location.href}
      />
      
      <Link to="/" className="inline-flex items-center gap-2 text-text-muted hover:text-accent mb-8 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Home
      </Link>

      <h1 className="text-4xl font-extrabold mb-8">Privacy Policy</h1>
      <div className="prose prose-lg dark:prose-invert max-w-none space-y-6 text-text-secondary">
        <p className="text-sm text-text-muted italic">Last Updated: March 13, 2026</p>
        
        <p>
          At <strong>LoveYouTools</strong>, accessible from loveyoutools.in, one of our main priorities is the privacy of our visitors. 
          This Privacy Policy document contains types of information that is collected and recorded by LoveYouTools and how we use it.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">1. Data Processing</h2>
        <p>
          Most of the tools provided on LoveYouTools process data <strong>locally in your browser</strong>. 
          This means that your files, text, or images are never uploaded to our servers. Processing happens on your device, 
          and the results are generated instantly without any data transfer.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">2. Log Files</h2>
        <p>
          LoveYouTools follows a standard procedure of using log files. These files log visitors when they visit websites. 
          The information collected by log files includes internet protocol (IP) addresses, browser type, Internet Service Provider (ISP), 
          date and time stamp, referring/exit pages, and possibly the number of clicks. These are not linked to any information 
          that is personally identifiable.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">3. Cookies and Web Beacons</h2>
        <p>
          Like any other website, LoveYouTools uses 'cookies'. These cookies are used to store information including visitors' 
          preferences, and the pages on the website that the visitor accessed or visited. The information is used to optimize 
          the users' experience by customizing our web page content based on visitors' browser type and/or other information.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">4. Third Party Privacy Policies</h2>
        <p>
          LoveYouTools's Privacy Policy does not apply to other advertisers or websites. Thus, we are advising you to consult 
          the respective Privacy Policies of these third-party ad servers for more detailed information.
        </p>

        <h2 className="text-2xl font-bold text-text-primary mt-12 mb-4">5. Consent</h2>
        <p>
          By using our website, you hereby consent to our Privacy Policy and agree to its terms.
        </p>
      </div>
    </div>
  );
}
