/**
 * EY-branded "forgot password" page (login-reset-password.ftl).
 *
 * Reached from the "Mot de passe oublié ?" link on Login.tsx and shares
 * its exact shell (BrandPanel + the same white form card on an off-white
 * ground) rather than falling back to Keycloakify's generic default theme,
 * which is what rendered here before this file existed -- a jump from the
 * branded login page into an unstyled one read as leaving the app.
 *
 * The form posts to `url.loginAction` with the `username` field Keycloak's
 * controller expects for this page (it accepts either the username or the
 * email depending on realm settings; the app treats email as the one
 * identifier everywhere else, so the label matches Login.tsx's own
 * username field instead of branching copy on realm.loginWithEmailAllowed).
 * Keycloak sends the actual reset email itself (SMTP configured at the
 * realm level, see keycloak_bootstrap.py's ensure_realm_smtp) -- this page
 * only collects the address and shows whatever message Keycloak renders
 * back (it always claims success here regardless of whether the address
 * matches an account, so as not to reveal which emails are registered).
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Mail, ArrowRight, ArrowLeft, Check, Loader2, AlertCircle } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoDark from "../assets/EY_logo2.png";
import { BrandPanel } from "../components/BrandPanel";

export default function LoginResetPassword(
    props: PageProps<Extract<KcContext, { pageId: "login-reset-password.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url, auth, messagesPerField, message } = kcContext;

    const [loading, setLoading] = useState(false);

    const fieldErrorExists = messagesPerField.existsError("username");
    const alert: { type: "success" | "error"; html: string } | null = fieldErrorExists
        ? { type: "error", html: kcSanitize(messagesPerField.getFirstError("username")) }
        : message !== undefined
          ? { type: message.type === "error" ? "error" : "success", html: kcSanitize(message.summary) }
          : null;

    const inputBase =
        "w-full h-12 pl-11 pr-4 bg-[#F7F7F5] border border-black/10 text-[15px] text-[#1A1A1A] placeholder-black/30 " +
        "focus:outline-none focus:border-[#1A1A1A] focus:bg-white focus:ring-2 focus:ring-[#1A1A1A]/10 transition-colors";

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="h-screen w-full flex flex-col md:flex-row font-sans selection:bg-[#FFE600] selection:text-black">
                {/* ── Brand panel, same shell as Login.tsx ── */}
                <BrandPanel>
                    <div className="max-w-md fade-in-delayed">
                        <h1 className="text-[26px] leading-[1.15] md:text-[40px] md:leading-[1.12] font-bold text-white tracking-tight text-balance">
                            Réinitialisez. <span className="text-[#FFE600]">Reprenez le contrôle.</span>
                        </h1>
                        <p className="hidden md:block mt-5 text-[15px] leading-relaxed text-white/55 max-w-[38ch]">
                            Indiquez votre adresse e-mail professionnelle : nous vous envoyons un lien pour définir un nouveau mot de passe.
                        </p>
                    </div>
                </BrandPanel>

                {/* ── Form panel, clean and bright: same rhythm as Login.tsx ── */}
                <div className="flex-1 flex flex-col bg-[#FAFAF9] px-6 md:px-10 py-6 md:py-8 overflow-y-auto">
                    {/* Top zone: a small, quiet brand mark at the same inset as the
                        beam panel's logo, so the two line up across the seam. */}
                    <img src={EyLogoDark} alt="EY" className="h-6 md:h-7 w-auto object-contain select-none pointer-events-none fade-in" />

                    {/* Middle zone: the form, on its own white card lifted off the
                        panel's off-white ground -- gives the eye a surface to land
                        on instead of text sitting directly on flat white. */}
                    <div className="flex-1 flex items-center justify-center py-4">
                        <div className="w-full max-w-[400px] fade-in-delayed bg-white rounded-xl border border-black/[0.06] shadow-[0_1px_2px_rgba(16,16,16,0.03),0_20px_44px_-22px_rgba(16,16,16,0.14)] p-6 md:p-7">
                            <div className="mb-5">
                                <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Mot de passe oublié ?</h2>
                                <p className="mt-1.5 text-[13.5px] text-[#6B6B6B]">
                                    Indiquez votre adresse e-mail, nous vous enverrons un lien de réinitialisation.
                                </p>
                            </div>

                            {/* Alert (from Keycloak) */}
                            {alert && (
                                <div
                                    role="alert"
                                    className={`mb-5 px-4 py-3 rounded-md border text-[13px] flex items-start gap-2.5 ${
                                        alert.type === "success"
                                            ? "bg-[#FFFBE0] border-[#F5DE5C] text-[#5C4E00]"
                                            : "bg-[#FDEDED] border-[#F3C6C6] text-[#8A1F1F]"
                                    }`}
                                >
                                    {alert.type === "success" ? (
                                        <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                    )}
                                    <span className="leading-normal font-medium" dangerouslySetInnerHTML={{ __html: alert.html }} />
                                </div>
                            )}

                            {/* Reset form, posts straight to Keycloak */}
                            <form
                                id="kc-reset-password-form"
                                action={url.loginAction}
                                method="post"
                                onSubmit={() => {
                                    setLoading(true);
                                    return true;
                                }}
                                className="space-y-3"
                            >
                                <div className="space-y-1.5">
                                    <label htmlFor="username" className="text-[#1A1A1A] text-[13px] font-semibold block">
                                        Adresse e-mail professionnelle
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-black/30 group-focus-within:text-[#1A1A1A] transition-colors">
                                            <Mail className="w-[18px] h-[18px]" />
                                        </div>
                                        <input
                                            id="username"
                                            name="username"
                                            type="text"
                                            defaultValue={auth.attemptedUsername ?? ""}
                                            autoFocus
                                            autoComplete="username"
                                            aria-invalid={fieldErrorExists}
                                            placeholder="prenom.nom@ey.tn"
                                            className={inputBase}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`w-full h-12 bg-[#FFE600] text-[#1A1A1A] hover:bg-[#F5DA00] hover:shadow-[0_6px_16px_-4px_rgba(255,230,0,0.55)] hover:-translate-y-px active:scale-[0.99] active:translate-y-0 text-[14px] font-bold flex items-center justify-center gap-2.5 rounded-md transition-all duration-150 mt-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2 ${
                                        loading ? "opacity-70 cursor-not-allowed" : ""
                                    }`}
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin text-current" />
                                            Envoi en cours…
                                        </>
                                    ) : (
                                        <>
                                            <span>Envoyer le lien</span>
                                            <ArrowRight className="w-4 h-4 text-current" />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Back to login */}
                            <div className="mt-4 text-center text-[13px] text-[#6B6B6B]">
                                <a
                                    href={url.loginUrl}
                                    className="inline-flex items-center gap-1.5 font-semibold text-[#1A1A1A] hover:underline underline-offset-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    Retour à la connexion
                                </a>
                            </div>

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

                    {/* Bottom zone: mirrors the beam panel's footer line. */}
                    <div className="text-center text-[11px] text-[#9B9B9B] tracking-wide">DataPilot © {new Date().getFullYear()} EY</div>
                </div>
            </div>
        </Template>
    );
}
