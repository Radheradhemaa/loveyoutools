import { useEffect } from 'react';

interface AdSlotProps {
  className?: string;
  adSlot?: string;
  adFormat?: 'auto' | 'fluid' | 'rectangle';
  fullWidthResponsive?: boolean;
}

export default function AdSlot({ className = '', adSlot = '1234567890', adFormat = 'auto', fullWidthResponsive = true }: AdSlotProps) {
  useEffect(() => {
    try {
      // Push the ad to AdSense on mount
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error('AdSense push error:', e);
    }
  }, []);

  return (
    <div className={`ad-container my-6 flex justify-center text-center ${className}`}>
      {/* Placeholder for Development & AdSense Approval */}
      <div className="w-full max-w-[728px] min-h-[90px] bg-bg-secondary border border-border-color rounded-lg flex items-center justify-center p-4">
        <span className="text-text-muted text-sm font-medium">Advertisement</span>
      </div>
      
      {/* 
        REAL ADSENSE CODE (Uncomment once approved & update ca-pub ID)
        <ins 
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client="ca-pub-YOUR_PUBLISHER_ID_HERE" 
          data-ad-slot={adSlot}
          data-ad-format={adFormat}
          data-full-width-responsive={fullWidthResponsive ? "true" : "false"}
        ></ins>
      */}
    </div>
  );
}
