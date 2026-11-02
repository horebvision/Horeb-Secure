'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';

export interface SecuriaLogoProps {
  variant?: 'navbar' | 'full' | 'shield' | 'compact' | 'auth' | 'badge';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showTagline?: boolean;
  showBadge?: boolean;
  badgeText?: string;
  className?: string;
  href?: string;
  priority?: boolean;
  hideTextOnMobile?: boolean;
}

export function SecuriaLogo({
  variant = 'navbar',
  size = 'md',
  showTagline = true,
  showBadge = true,
  badgeText = 'PRO',
  className = '',
  href,
  priority = false,
  hideTextOnMobile = false,
}: SecuriaLogoProps) {
  // Dimension mappings for the emblem
  const sizeMap = {
    sm: { shield: 34, text: 'text-lg', badge: 'text-[9px]', sub: 'text-[10px]' },
    md: { shield: 44, text: 'text-xl', badge: 'text-[10px]', sub: 'text-[11px]' },
    lg: { shield: 60, text: 'text-2xl', badge: 'text-xs', sub: 'text-xs' },
    xl: { shield: 88, text: 'text-4xl', badge: 'text-xs', sub: 'text-sm' },
  };

  const currentSize = sizeMap[size];

  // Shield Emblem with glowing cyber border, metallic depth, and SVG fallback
  const Emblem = ({ dim = currentSize.shield }: { dim?: number }) => {
    const [imgFailed, setImgFailed] = React.useState(false);

    return (
      <div
        className="relative shrink-0 flex items-center justify-center rounded-full p-0.5 bg-gradient-to-tr from-cyan-400 via-blue-600 to-emerald-400 shadow-md shadow-cyan-950/60 group-hover:shadow-cyan-400/40 group-hover:scale-105 transition-all duration-300"
        style={{ width: dim, height: dim }}
      >
        <div className="w-full h-full rounded-full bg-slate-950 overflow-hidden flex items-center justify-center relative">
          {!imgFailed ? (
            <Image
              src="/horeb-secure-logo.png"
              alt="Horeb Secure"
              width={dim * 2}
              height={dim * 2}
              unoptimized
              priority={priority}
              onError={() => setImgFailed(true)}
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-cyan-400">
              <svg className="w-3/5 h-3/5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Styled Horeb Secure Wordmark
  const Wordmark = ({ textSize = currentSize.text }: { textSize?: string }) => (
    <span className={`font-black tracking-wider text-white inline-flex items-center gap-1.5 ${textSize}`}>
      <span className="text-white">HOREB</span>
      <span className="text-cyan-400">SECURE</span>
    </span>
  );

  let content: React.ReactNode = null;

  // 1. Variant 'shield' (emblem only)
  if (variant === 'shield') {
    content = <Emblem />;
  }

  // 1b. Variant 'badge' (Hero seal with animated cyber aura)
  else if (variant === 'badge') {
    content = (
      <div className={`relative flex items-center justify-center group ${className}`}>
        {/* Multi-layered cyber glow aura */}
        <div className="absolute -inset-4 bg-gradient-to-tr from-cyan-500/30 via-blue-600/20 to-emerald-500/30 rounded-full blur-2xl group-hover:opacity-100 opacity-70 transition duration-700 pointer-events-none" />
        <div className="absolute -inset-1 rounded-full border border-cyan-500/30 animate-pulse pointer-events-none" />
        <Emblem dim={currentSize.shield} />
      </div>
    );
  }

  // 2. Variant 'navbar'
  else if (variant === 'navbar') {
    content = (
      <div className={`flex items-center space-x-2.5 sm:space-x-3 group shrink-0 ${className}`}>
        <Emblem dim={38} />
        <div className={hideTextOnMobile ? 'hidden sm:block' : 'block'}>
          <div className="flex items-center gap-1.5">
            <Wordmark textSize="text-xl" />
            {showBadge && (
              <span className="text-[10px] tracking-normal px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 uppercase font-bold shadow-sm shadow-cyan-950/50">
                {badgeText}
              </span>
            )}
          </div>
          {showTagline && (
            <div className="hidden md:flex items-center space-x-1.5 text-[11px] text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              <span className="tracking-tight text-slate-300">Protégeons l'avenir</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 3. Variant 'compact'
  else if (variant === 'compact') {
    content = (
      <div className={`flex items-center space-x-2.5 group ${className}`}>
        <Emblem dim={34} />
        <Wordmark textSize="text-lg" />
      </div>
    );
  }

  // 4. Variant 'auth' (for Login / Register pages)
  else if (variant === 'auth') {
    content = (
      <div className={`flex flex-col items-center text-center group ${className}`}>
        <div className="relative mb-3">
          <div className="absolute -inset-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-3xl blur-xl opacity-30 group-hover:opacity-60 transition duration-500" />
          <Emblem dim={72} />
        </div>
        <Wordmark textSize="text-3xl" />
        <div className="flex items-center gap-2 mt-1">
          <span className="h-px w-6 bg-gradient-to-r from-transparent to-cyan-500" />
          <span className="text-[10px] sm:text-[11px] font-semibold tracking-[0.2em] text-cyan-300 uppercase">
            PROTÉGER AUJOURD'HUI — DEMAIN
          </span>
          <span className="h-px w-6 bg-gradient-to-l from-transparent to-cyan-500" />
        </div>
      </div>
    );
  }

  // 5. Variant 'full' (Hero or Landing)
  else {
    content = (
      <div className={`flex flex-col items-center text-center group ${className}`}>
        <div className="relative mb-4">
          <div className="absolute -inset-3 bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 rounded-full blur-2xl opacity-25 group-hover:opacity-50 transition duration-500" />
          <Emblem dim={currentSize.shield} />
        </div>
        <div className="flex items-center gap-2">
          <Wordmark textSize={currentSize.text} />
          {showBadge && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase font-black">
              {badgeText}
            </span>
          )}
        </div>
        {showTagline && (
          <div className="flex items-center gap-3 mt-2 text-slate-400">
            <span className="h-px w-8 bg-cyan-500/50" />
            <span className={`${currentSize.sub} font-medium tracking-[0.25em] text-slate-300 uppercase`}>
              PROTÉGER AUJOURD'HUI — DEMAIN
            </span>
            <span className="h-px w-8 bg-cyan-500/50" />
          </div>
        )}
      </div>
    );
  }

  if (href) {
    return (
      <Link href={href} className="inline-block focus:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
