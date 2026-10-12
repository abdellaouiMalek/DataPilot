/**
 * The two-panel auth shell (BrandPanel + white card on the off-white
 * ground) that Login/LoginResetPassword/UpdatePassword each spelled out
 * inline. Extracted when four more pages -- info, page-expired,
 * logout-confirm, update-profile -- needed the exact same frame: the
 * headline copy and the card body are all that actually differ between
 * them, and duplicating the surrounding markup seven times is how the
 * footer year drifted between pages before BrandPanel was pulled out.
 *
 * The existing three pages keep their own inline copy of this frame --
 * they carry per-page details (Login's social block, UpdatePassword's
 * policy list) that don't belong in a shared shell, and rewriting working
 * pages to route through it would be churn for no visible gain.
 */
import type { ReactNode } from "react";
import EyLogoDark from "../assets/EY_logo2.png";
import { BrandPanel } from "./BrandPanel";

export function AuthShell({
    headline,
    intro,
    children
}: {
    /** Brand-panel headline. Pass a fragment to accent part of it in EY yellow. */
    headline: ReactNode;
    /** Supporting line under the headline; desktop only, like the other pages. */
    intro?: ReactNode;
    /** The white card's contents. */
    children: ReactNode;
}) {
    return (
        <div className="h-screen w-full flex flex-col md:flex-row font-sans selection:bg-[#FFE600] selection:text-black">
            <BrandPanel>
                <div className="max-w-md fade-in-delayed">
                    <h1 className="text-[26px] leading-[1.15] md:text-[40px] md:leading-[1.12] font-bold text-white tracking-tight text-balance">
                        {headline}
                    </h1>
                    {intro && (
                        <p className="hidden md:block mt-5 text-[15px] leading-relaxed text-white/55 max-w-[38ch]">{intro}</p>
                    )}
                </div>
            </BrandPanel>

            <div className="flex-1 flex flex-col bg-[#FAFAF9] px-6 md:px-10 py-6 md:py-8 overflow-y-auto">
                <img src={EyLogoDark} alt="EY" className="h-6 md:h-7 w-auto object-contain select-none pointer-events-none fade-in" />

                <div className="flex-1 flex items-center justify-center py-4">
                    <div className="w-full max-w-[400px] fade-in-delayed bg-white rounded-xl border border-black/[0.06] shadow-[0_1px_2px_rgba(16,16,16,0.03),0_20px_44px_-22px_rgba(16,16,16,0.14)] p-6 md:p-7">
                        {children}
                    </div>
                </div>

                <div className="text-center text-[11px] text-[#9B9B9B] tracking-wide">DataPilot © {new Date().getFullYear()} EY</div>
            </div>
        </div>
    );
}

/** The yellow primary button, as an <a>. Same visual as the submit buttons
 *  on the form pages -- these four pages navigate rather than submit. */
export const primaryActionClass =
    "w-full h-12 bg-[#FFE600] text-[#1A1A1A] hover:bg-[#F5DA00] hover:shadow-[0_6px_16px_-4px_rgba(255,230,0,0.55)] " +
    "hover:-translate-y-px active:scale-[0.99] active:translate-y-0 text-[14px] font-bold flex items-center justify-center " +
    "gap-2.5 rounded-md transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 " +
    "focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2";

/** The quiet secondary button (bordered, no fill), for "cancel"-weight actions. */
export const secondaryActionClass =
    "w-full h-12 bg-white text-[#1A1A1A] border border-black/15 hover:border-[#1A1A1A] hover:bg-[#F7F7F5] " +
    "text-[14px] font-semibold flex items-center justify-center gap-2 rounded-md transition-all duration-150 " +
    "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2";

/** The support line every auth card closes with. */
export function SupportFooter() {
    return (
        <div className="mt-5 pt-4 border-t border-black/10 flex items-center justify-between text-[12px] text-[#9B9B9B]">
            <span>Besoin d&apos;aide&nbsp;?</span>
            <a
                href="mailto:support@ey-digital.tn"
                className="font-semibold text-[#4A4A4A] hover:text-[#1A1A1A] transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
            >
                support@ey-digital.tn
            </a>
        </div>
    );
}
