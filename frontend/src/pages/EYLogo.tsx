import React from 'react';

export function EYLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div 
      className={`${className} bg-black flex items-center justify-center flex-shrink-0 select-none`}
      style={{ minWidth: '40px' }}
    >
      <span className="text-[#FFE600] font-bold text-xl font-display tracking-tight">
        EY
      </span>
    </div>
  );
}