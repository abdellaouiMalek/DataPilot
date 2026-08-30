/**
 * EY-branded login page (login.ftl) — split-screen redesign.
 *
 * Replaces the earlier full-black "vault" concept with a two-panel layout:
 * a dark brand panel built around EY's own beam mark (blown up to real
 * scale rather than left as a small logo lockup — that's the one signature
 * move this page is built around), and a clean form panel. The form panel
 * is deliberately bright, not dark-on-dark: this is a screen bank staff
 * and EY consultants open every single day, so daily-use comfort
 * (contrast, input size, a calm ground) matters more than atmosphere here.
 * Both panels share the same three-zone rhythm (small mark at top, main
 * content centered, a footer line at the bottom) so the two sides read as
 * one considered page rather than a graphic bolted onto a bare form — the
 * form itself sits on a true white card lifted slightly off the panel's
 * off-white ground, instead of floating directly on the same flat surface.
 * On narrow viewports the brand panel collapses to a compact top band
 * instead of disappearing, so the identity never fully drops out.
 *
 * All form behaviour is wired to Keycloak: the form posts to `url.loginAction`,
 * inputs use the `username` / `password` / `rememberMe` field names Keycloak
 * expects, and validation/error messages come from `kcContext` (no client-side
 * fake auth) — unchanged from the previous version, only the visual layer
 * was rebuilt.
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Mail, Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoLight from "../assets/ey-logo.png";
import EyLogoDark from "../assets/EY_logo2.png";

/** The EY beam, blown up: three tapers at slightly diverging angles (not
 * parallel copies) so it reads as light fanning out rather than a stencil
 * repeated three times, plus a soft radial glow anchored at the point they
 * all converge from. Not a trace of the trademark's exact multi-facet path
 * (that reads as a blocky artifact at this scale) — the same gesture,
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

export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { social, realm, url, usernameHidden, login, auth, registrationDisabled, messagesPerField, message } = kcContext;

    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Build a single alert from Keycloak's field errors / global message.
    const fieldErrorExists = messagesPerField.existsError("username", "password");
    const alert: { type: "success" | "error"; html: string } | null = fieldErrorExists
        ? { type: "error", html: kcSanitize(messagesPerField.getFirstError("username", "password")) }
        : message !== undefined
          ? { type: message.type === "error" ? "error" : "success", html: kcSanitize(message.summary) }
          : null;

    const inputBase =
        "w-full h-12 pl-11 pr-4 bg-[#F7F7F5] border border-black/10 text-[15px] text-[#1A1A1A] placeholder-black/30 " +
        "focus:outline-none focus:border-[#1A1A1A] focus:bg-white focus:ring-2 focus:ring-[#1A1A1A]/10 transition-colors";

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="min-h-screen w-full flex flex-col md:flex-row font-sans selection:bg-[#FFE600] selection:text-black">
                {/* ── Brand panel — the thesis: EY's beam, at real scale ── */}
                <div className="relative shrink-0 h-[34vh] min-h-[220px] md:h-auto md:min-h-screen md:w-[46%] lg:w-[42%] bg-[#1A1A1A] overflow-hidden flex flex-col">
                    <BeamMark />
                    <div className="grain" />

                    <div className="relative z-10 flex flex-col h-full px-8 py-8 md:px-14 md:py-12">
                        <img src={EyLogoLight} alt="EY" className="h-7 md:h-8 w-auto object-contain select-none pointer-events-none fade-in" />

                        {/* Centered in the space between the logo and the footer
                            line, not bottom-anchored against it — gives the
                            headline the same "resting in the middle" weight as
                            the form card has on the other panel. */}
                        <div className="flex-1 flex flex-col justify-center">
                            <div className="max-w-md fade-in-delayed">
                                <h1 className="text-[26px] leading-[1.15] md:text-[40px] md:leading-[1.12] font-bold text-white tracking-tight text-balance">
                                    Évaluer. Comparer.
                                    <br className="hidden md:block" /> Simuler. <span className="text-[#FFE600]">Accélérer.</span>
                                </h1>
                                <p className="hidden md:block mt-5 text-[15px] leading-relaxed text-white/55 max-w-[38ch]">
                                    DataPilot est la plateforme EY d&apos;évaluation de la maturité data et d&apos;accélération de la transformation
                                    digitale pour les banques tunisiennes.
                                </p>
                            </div>
                        </div>

                        <div className="hidden md:flex items-center justify-between pt-6 border-t border-white/10 text-[11px] text-white/35 tracking-wide">
                            <span>EY Consulting Tunisie</span>
                            <span>DataPilot © 1996–{new Date().getFullYear()} EY</span>
                        </div>
                    </div>
                </div>

                {/* ── Form panel — clean and bright: the part used every day ── */}
                <div className="flex-1 flex flex-col bg-[#FAFAF9] px-6 md:px-10 py-8 md:py-12">
                    {/* Top zone: a small, quiet brand mark at the same inset as the
                        beam panel's logo, so the two line up across the seam. */}
                    <img src={EyLogoDark} alt="EY" className="h-6 md:h-7 w-auto object-contain select-none pointer-events-none fade-in" />

                    {/* Middle zone: the form, on its own white card lifted off the
                        panel's off-white ground -- gives the eye a surface to land
                        on instead of text sitting directly on flat white. */}
                    <div className="flex-1 flex items-center justify-center py-8">
                        <div className="w-full max-w-[400px] fade-in-delayed bg-white rounded-xl border border-black/[0.06] shadow-[0_1px_2px_rgba(16,16,16,0.03),0_20px_44px_-22px_rgba(16,16,16,0.14)] p-7 md:p-9">
                            <div className="mb-7">
                                <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Se connecter</h2>
                                <p className="mt-1.5 text-[13.5px] text-[#6B6B6B]">Utilisez l&apos;identifiant fourni par EY Consulting Tunisie.</p>
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

                            {/* Login form — posts straight to Keycloak */}
                            {realm.password && (
                                <form
                                    id="kc-form-login"
                                    action={url.loginAction}
                                    method="post"
                                    onSubmit={() => {
                                        setLoading(true);
                                        return true;
                                    }}
                                    className="space-y-4"
                                >
                                    {/* EMAIL / USERNAME */}
                                    {!usernameHidden && (
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
                                                    defaultValue={login.username ?? ""}
                                                    autoFocus
                                                    autoComplete="username"
                                                    tabIndex={2}
                                                    aria-invalid={fieldErrorExists}
                                                    placeholder="prenom.nom@ey.tn"
                                                    className={inputBase}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* PASSWORD */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <label htmlFor="password" className="text-[#1A1A1A] text-[13px] font-semibold block">
                                                Mot de passe
                                            </label>
                                            {realm.resetPasswordAllowed && (
                                                <a
                                                    href={url.loginResetCredentialsUrl}
                                                    tabIndex={6}
                                                    className="text-[#6B6B6B] text-[12.5px] font-medium hover:text-[#1A1A1A] hover:underline underline-offset-2 transition-colors cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
                                                >
                                                    Mot de passe oublié ?
                                                </a>
                                            )}
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-black/30 group-focus-within:text-[#1A1A1A] transition-colors">
                                                <Lock className="w-[18px] h-[18px]" />
                                            </div>
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="current-password"
                                                tabIndex={3}
                                                aria-invalid={fieldErrorExists}
                                                placeholder="••••••••••••"
                                                className={`${inputBase} pr-11`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-black/30 hover:text-[#1A1A1A] transition-colors cursor-pointer bg-transparent border-none outline-none rounded-r-md focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/25 focus-visible:ring-inset"
                                                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                                            >
                                                {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* REMEMBER ME */}
                                    {realm.rememberMe && !usernameHidden && (
                                        <div className="flex items-center pt-0.5">
                                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    id="rememberMe"
                                                    name="rememberMe"
                                                    tabIndex={5}
                                                    defaultChecked={!!login.rememberMe}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-[18px] h-[18px] rounded border border-black/20 bg-white flex items-center justify-center transition-all peer-checked:bg-[#FFE600] peer-checked:border-[#FFE600] peer-focus-visible:ring-2 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-[#1A1A1A]/40">
                                                    <Check className="w-3 h-3 text-[#1A1A1A] stroke-[3.5] opacity-0 peer-checked:opacity-100" />
                                                </div>
                                                <span className="text-[13px] text-[#4A4A4A] font-medium">Rester connecté</span>
                                            </label>
                                        </div>
                                    )}

                                    {/* SUBMIT */}
                                    <input type="hidden" id="id-hidden-input" name="credentialId" value={auth.selectedCredential} />
                                    <button
                                        type="submit"
                                        name="login"
                                        tabIndex={7}
                                        disabled={loading}
                                        className={`w-full h-12 bg-[#FFE600] text-[#1A1A1A] hover:bg-[#F5DA00] hover:shadow-[0_6px_16px_-4px_rgba(255,230,0,0.55)] hover:-translate-y-px active:scale-[0.99] active:translate-y-0 text-[14px] font-bold flex items-center justify-center gap-2.5 rounded-md transition-all duration-150 mt-2 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A] focus-visible:ring-offset-2 ${
                                            loading ? "opacity-70 cursor-not-allowed" : ""
                                        }`}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin text-current" />
                                                Connexion en cours…
                                            </>
                                        ) : (
                                            <>
                                                <span>Se connecter</span>
                                                <ArrowRight className="w-4 h-4 text-current" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            )}

                            {/* Social providers (rendered only if the realm has any) */}
                            {realm.password && social?.providers !== undefined && social.providers.length !== 0 && (
                                <div className="mt-5 pt-5 border-t border-black/10 space-y-2">
                                    {social.providers.map(p => (
                                        <a
                                            key={p.alias}
                                            href={p.loginUrl}
                                            className="w-full h-11 flex items-center justify-center gap-2 rounded-md border border-black/15 text-[13px] font-medium text-[#4A4A4A] hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
                                        >
                                            <span dangerouslySetInnerHTML={{ __html: kcSanitize(p.displayName) }} />
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Register link (only if registration is allowed) */}
                            {realm.password && realm.registrationAllowed && !registrationDisabled && (
                                <div className="mt-4 text-center text-[13px] text-[#6B6B6B]">
                                    <a
                                        href={url.registrationUrl}
                                        className="font-semibold text-[#1A1A1A] hover:underline underline-offset-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-[#1A1A1A]/30 focus-visible:ring-offset-2"
                                    >
                                        Créer un compte
                                    </a>
                                </div>
                            )}

                            {/* Support */}
                            <div className="mt-8 pt-5 border-t border-black/10 flex items-center justify-between text-[12px] text-[#9B9B9B]">
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
                    <div className="text-center text-[11px] text-[#9B9B9B] tracking-wide">DataPilot © 1996–{new Date().getFullYear()} EY</div>
                </div>
            </div>
        </Template>
    );
}
