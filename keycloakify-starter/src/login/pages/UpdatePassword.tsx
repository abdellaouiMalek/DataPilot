/**
 * EY-branded "set your password" page (login-update-password.ftl).
 *
 * Keycloak forces this required action whenever a temporary password is
 * used (new accounts, or after an admin reset), it can't be skipped by
 * styling the login page alone. Now shares Login.tsx / LoginResetPassword.tsx's
 * split-panel shell (BrandPanel + white form card) instead of the earlier
 * standalone "vault" black-box design, so all three read as one continuous
 * DataPilot flow rather than a jump into a differently-designed "Keycloak".
 *
 * Fields/behaviour are wired to Keycloak: the form posts to `url.loginAction`
 * with the `password-new` / `password-confirm` / `logout-sessions` field
 * names Keycloak expects; the password match check below is a UX hint only,
 * Keycloak still validates the confirm-match and any password policy itself.
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoDark from "../assets/EY_logo2.png";
import { BrandPanel } from "../components/BrandPanel";

export default function UpdatePassword(
    props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url, messagesPerField, isAppInitiatedAction, message } = kcContext;

    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [passwordNew, setPasswordNew] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    const fieldErrorExists = messagesPerField.existsError("password", "password-confirm");
    const alert: { type: "success" | "error"; html: string } | null = fieldErrorExists
        ? { type: "error", html: kcSanitize(messagesPerField.getFirstError("password", "password-confirm")) }
        : message !== undefined
          ? { type: message.type === "error" ? "error" : "success", html: kcSanitize(message.summary) }
          : null;

    const matchState: "empty" | "match" | "mismatch" =
        passwordConfirm.length === 0 ? "empty" : passwordNew === passwordConfirm ? "match" : "mismatch";

    const inputBase =
        "w-full h-12 pl-11 pr-11 bg-[#F7F7F5] border border-black/10 text-[15px] text-[#1A1A1A] placeholder-black/30 " +
        "focus:outline-none focus:border-[#1A1A1A] focus:bg-white focus:ring-2 focus:ring-[#1A1A1A]/10 transition-colors";

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="h-screen w-full flex flex-col md:flex-row font-sans selection:bg-[#FFE600] selection:text-black">
                {/* ── Brand panel, same shell as Login.tsx / LoginResetPassword.tsx ── */}
                <BrandPanel>
                    <div className="max-w-md fade-in-delayed">
                        <h1 className="text-[26px] leading-[1.15] md:text-[40px] md:leading-[1.12] font-bold text-white tracking-tight text-balance">
                            Bienvenue. <span className="text-[#FFE600]">Sécurisez votre accès.</span>
                        </h1>
                        <p className="hidden md:block mt-5 text-[15px] leading-relaxed text-white/55 max-w-[38ch]">
                            Compte créé par un administrateur EY avec un accès temporaire : définissez votre mot de passe pour accéder à
                            DataPilot.
                        </p>
                    </div>
                </BrandPanel>

                {/* ── Form panel, clean and bright: same rhythm as the other auth pages ── */}
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
                                <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Définissez votre mot de passe</h2>
                                <p className="mt-1.5 text-[13.5px] text-[#6B6B6B]">Dernière étape avant d&apos;accéder à DataPilot.</p>
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

                            {/* Set-password form, posts straight to Keycloak */}
                            <form
                                id="kc-passwd-update-form"
                                action={url.loginAction}
                                method="post"
                                onSubmit={() => {
                                    setLoading(true);
                                    return true;
                                }}
                                className="space-y-3"
                            >
                                {/* NEW PASSWORD */}
                                <div className="space-y-1.5">
                                    <label htmlFor="password-new" className="text-[#1A1A1A] text-[13px] font-semibold block">
                                        Nouveau mot de passe
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-black/30 group-focus-within:text-[#1A1A1A] transition-colors">
                                            <Lock className="w-[18px] h-[18px]" />
                                        </div>
                                        <input
                                            id="password-new"
                                            name="password-new"
                                            type={showNew ? "text" : "password"}
                                            value={passwordNew}
                                            onChange={e => setPasswordNew(e.target.value)}
                                            autoFocus
                                            autoComplete="new-password"
                                            aria-invalid={fieldErrorExists}
                                            placeholder="••••••••••••"
                                            className={inputBase}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNew(!showNew)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-black/30 hover:text-[#1A1A1A] transition-colors cursor-pointer bg-transparent border-none outline-none rounded-r-md focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/25 focus-visible:ring-inset"
                                            aria-label={showNew ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                        >
                                            {showNew ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                        </button>
                                    </div>
                                </div>

                                {/* CONFIRM PASSWORD */}
                                <div className="space-y-1.5">
                                    <label htmlFor="password-confirm" className="text-[#1A1A1A] text-[13px] font-semibold block">
                                        Confirmer le mot de passe
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-black/30 group-focus-within:text-[#1A1A1A] transition-colors">
                                            <Lock className="w-[18px] h-[18px]" />
                                        </div>
                                        <input
                                            id="password-confirm"
                                            name="password-confirm"
                                            type={showConfirm ? "text" : "password"}
                                            value={passwordConfirm}
                                            onChange={e => setPasswordConfirm(e.target.value)}
                                            autoComplete="new-password"
                                            aria-invalid={fieldErrorExists}
                                            placeholder="••••••••••••"
                                            className={inputBase}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-black/30 hover:text-[#1A1A1A] transition-colors cursor-pointer bg-transparent border-none outline-none rounded-r-md focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/25 focus-visible:ring-inset"
                                            aria-label={showConfirm ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                        >
                                            {showConfirm ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                        </button>
                                    </div>
                                    {/* Live hint only, Keycloak is the source of truth on submit */}
                                    {matchState !== "empty" && (
                                        <p
                                            className={`text-[12px] font-semibold flex items-center gap-1.5 pt-0.5 ${
                                                matchState === "match" ? "text-emerald-600" : "text-amber-600"
                                            }`}
                                        >
                                            {matchState === "match" ? (
                                                <>
                                                    <Check className="w-3.5 h-3.5" /> Les mots de passe correspondent
                                                </>
                                            ) : (
                                                "Les mots de passe ne correspondent pas encore"
                                            )}
                                        </p>
                                    )}
                                </div>

                                {/* LOGOUT OTHER SESSIONS */}
                                <div className="flex items-center pt-0.5">
                                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            id="logout-sessions"
                                            name="logout-sessions"
                                            value="on"
                                            defaultChecked
                                            className="sr-only peer"
                                        />
                                        <div className="w-[18px] h-[18px] rounded border border-black/20 bg-white flex items-center justify-center transition-all peer-checked:bg-[#FFE600] peer-checked:border-[#FFE600] peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-[#1A1A1A]/40">
                                            <Check className="w-3 h-3 text-[#1A1A1A] stroke-[3.5] opacity-0 peer-checked:opacity-100" />
                                        </div>
                                        <span className="text-[13px] text-[#4A4A4A] font-medium">Déconnecter mes autres sessions</span>
                                    </label>
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
                                            Enregistrement…
                                        </>
                                    ) : (
                                        <>
                                            <span>Enregistrer</span>
                                            <ArrowRight className="w-4 h-4 text-current" />
                                        </>
                                    )}
                                </button>

                                {isAppInitiatedAction && (
                                    <button
                                        type="submit"
                                        name="cancel-aia"
                                        value="true"
                                        className="w-full h-11 border border-black/10 text-[13px] font-semibold text-[#6B6B6B] hover:border-[#1A1A1A] hover:text-[#1A1A1A] rounded-md transition-colors cursor-pointer"
                                    >
                                        Annuler
                                    </button>
                                )}
                            </form>

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
