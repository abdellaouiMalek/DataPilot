/**
 * EY-branded generic error page (error.ftl).
 *
 * Keycloak renders this whenever a flow fails outside a specific form's own
 * inline validation -- notably `ResetCredentialEmail`'s `EmailException`
 * (SMTP misconfigured/unreachable, see keycloak_bootstrap.py's
 * ensure_realm_smtp), but also e.g. an expired action link. Without this
 * file it fell through to Keycloakify's own generic DefaultPage (see
 * KcPage.tsx's `default:` branch, `doUseDefaultCss={true}`) -- a jump into
 * unstyled Keycloak chrome, same problem LoginResetPassword.tsx fixed for
 * the forgot-password page. Shares the exact same shell (BrandPanel + white
 * form card) so a failure never reads as "left the app".
 *
 * No form here, nothing to submit -- `message.summary` is Keycloak's own
 * error text (French, now that the realm's locale is French, see
 * keycloak_bootstrap.py's ensure_french_locale) and `client.baseUrl` is
 * Keycloak's own field for "the app that sent the user here" -- both
 * already resolved server-side, never invented client-side.
 */
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { AlertCircle, ArrowLeft } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoDark from "../assets/EY_logo2.png";
import { BrandPanel } from "../components/BrandPanel";

export default function Error(props: PageProps<Extract<KcContext, { pageId: "error.ftl" }>, I18n>) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { message, client, skipLink } = kcContext;

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="h-screen w-full flex flex-col md:flex-row font-sans selection:bg-[#FFE600] selection:text-black">
                {/* ── Brand panel, same shell as Login.tsx / LoginResetPassword.tsx / UpdatePassword.tsx ── */}
                <BrandPanel>
                    <div className="max-w-md fade-in-delayed">
                        <h1 className="text-[26px] leading-[1.15] md:text-[40px] md:leading-[1.12] font-bold text-white tracking-tight text-balance">
                            Un imprévu. <span className="text-[#FFE600]">Rien de grave.</span>
                        </h1>
                        <p className="hidden md:block mt-5 text-[15px] leading-relaxed text-white/55 max-w-[38ch]">
                            Cette étape n'a pas pu aboutir. Vous pouvez revenir en arrière et réessayer.
                        </p>
                    </div>
                </BrandPanel>

                {/* ── Form panel, clean and bright: same rhythm as the other auth pages ── */}
                <div className="flex-1 flex flex-col bg-[#FAFAF9] px-6 md:px-10 py-6 md:py-8 overflow-y-auto">
                    <img src={EyLogoDark} alt="EY" className="h-6 md:h-7 w-auto object-contain select-none pointer-events-none fade-in" />

                    <div className="flex-1 flex items-center justify-center py-4">
                        <div className="w-full max-w-[400px] fade-in-delayed bg-white rounded-xl border border-black/[0.06] shadow-[0_1px_2px_rgba(16,16,16,0.03),0_20px_44px_-22px_rgba(16,16,16,0.14)] p-6 md:p-7">
                            <div className="mb-5">
                                <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Une erreur est survenue</h2>
                                <p className="mt-1.5 text-[13.5px] text-[#6B6B6B]">Voici le détail transmis par le serveur.</p>
                            </div>

                            {/* Message d'erreur (texte réel de Keycloak, deja localise) */}
                            <div
                                role="alert"
                                className="mb-5 px-4 py-3 rounded-md border text-[13px] flex items-start gap-2.5 bg-[#FDEDED] border-[#F3C6C6] text-[#8A1F1F]"
                            >
                                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span className="leading-normal font-medium" dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }} />
                            </div>

                            {/* Retour -- vers l'application d'origine si Keycloak la connait, sinon vers la connexion */}
                            {!skipLink && (
                                <a
                                    href={client?.baseUrl || "/"}
                                    className="w-full h-12 bg-[#FFE600] text-[#1A1A1A] hover:bg-[#F5DA00] hover:shadow-[0_6px_16px_-4px_rgba(255,230,0,0.55)] hover:-translate-y-px active:scale-[0.99] active:translate-y-0 text-[14px] font-bold flex items-center justify-center gap-2.5 rounded-md transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2"
                                >
                                    <ArrowLeft className="w-4 h-4 text-current" />
                                    <span>Retour à DataPilot</span>
                                </a>
                            )}

                            {/* Support */}
                            <div className="mt-5 pt-4 border-t border-black/10 flex items-center justify-between text-[12px] text-[#9B9B9B]">
                                <span>Besoin d&apos;aide ?</span>
                                <a
                                    href="mailto:support@ey-digital.tn"
                                    className="font-semibold text-[#4A4A4A] hover:text-[#1A1A1A] transition-colors rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
                                >
                                    support@ey-digital.tn
                                </a>
                            </div>
                        </div>
                    </div>

                    <div className="text-center text-[11px] text-[#9B9B9B] tracking-wide">DataPilot © {new Date().getFullYear()} EY</div>
                </div>
            </div>
        </Template>
    );
}
