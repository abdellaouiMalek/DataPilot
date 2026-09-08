/**
 * The dark brand panel shared by every full-screen auth page (login,
 * reset-password, ...): EY's beam mark blown up to real scale, a headline
 * slot each page fills with its own copy, and the footer line. Pulled out
 * of Login.tsx once a second page needed the exact same panel -- copying
 * it is how the old copyright line ("1996-{year}") ended up duplicated
 * and drifting between pages; one panel, one place to get it right.
 */
import type { ReactNode } from "react";

/** The EY beam, blown up: three tapers at slightly diverging angles (not
 * parallel copies) so it reads as light fanning out rather than a stencil
 * repeated three times, plus a soft radial glow anchored at the point they
 * all converge from. Not a trace of the trademark's exact multi-facet path
 * (that reads as a blocky artifact at this scale), the same gesture,
 * redrawn clean for a large graphic instead of a small lockup. */
function BeamMark() {
    return (
        <svg viewBox="0 0 640 520" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <defs>
                <linearGradient id="beam-gold" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F4D400" />
                    <stop offset="100%" stopColor="#FFEE55" />
                </linearGradient>
                <radialGradient id="beam-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#FFE600" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#FFE600" stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx="30" cy="500" r="260" fill="url(#beam-glow)" opacity="0.35" />
            <polygon points="-60,455 420,-10 420,95 10,520" fill="#FFE600" opacity="0.07" />
            <polygon points="-30,485 520,50 520,130 40,540" fill="#FFE600" opacity="0.14" />
            <polygon points="10,505 600,90 600,165 90,545" fill="url(#beam-gold)" />
        </svg>
    );
}

/** Full height on desktop, a compact top band on narrow viewports (never
 * fully hidden, the identity stays even where the form takes over).
 *
 * `md:h-screen` (not `min-h-screen`): paired with the form panel's own
 * `h-screen`, the whole page is capped at one viewport instead of growing
 * past it whenever a page's content (e.g. UpdatePassword's extra checkbox +
 * cancel button) is a bit taller -- that used to force a page scroll on
 * ordinary laptop screens. */
export function BrandPanel({ children }: { children: ReactNode }) {
    return (
        <div className="relative shrink-0 h-[34vh] min-h-[220px] md:h-screen md:w-[46%] lg:w-[42%] bg-[#1A1A1A] overflow-hidden flex flex-col">
            <BeamMark />
            <div className="grain" />

            <div className="relative z-10 flex flex-col h-full px-8 py-6 md:px-14 md:py-9">
                {/* Centered in the space above the footer line rather than
                    bottom-anchored against it, so the headline gets the same
                    "resting in the middle" weight as the form card opposite it. */}
                <div className="flex-1 flex flex-col justify-center">{children}</div>

                <div className="hidden md:flex items-center justify-between pt-5 border-t border-white/10 text-[12px] text-white/60 tracking-wide">
                    <span>EY Consulting Tunisie</span>
                    <span>DataPilot © {new Date().getFullYear()} EY</span>
                </div>
            </div>
        </div>
    );
}
