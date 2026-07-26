/**
 * EY-branded login page (login.ftl).
 *
 * A deliberately different visual mode from the rest of DataPilot's light,
 * functional in-app pages: full-bleed EY black, a single glass panel with a
 * yellow edge, restrained "vault door" framing -- this is the one moment
 * that should feel like stepping into something restricted, not another
 * screen of the app. An earlier draft leaned on fabricated security theater
 * (fake protocol readouts, a simulated connection delay, a background grid)
 * -- removed, since none of it was real and a banking audience reads
 * fabricated technical detail as a credibility problem, not a trust signal.
 * This is a screen bank staff open every day, so it still renders instantly.
 *
 * All form behaviour is wired to Keycloak: the form posts to `url.loginAction`,
 * inputs use the `username` / `password` / `rememberMe` field names Keycloak
 * expects, and validation/error messages come from `kcContext` (no client-side
 * fake auth).
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Mail, Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoLight from "../assets/ey-logo.png";

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

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="relative h-screen overflow-y-auto bg-[#1A1A1A] text-white font-sans flex flex-col items-center justify-center px-4 py-5 selection:bg-[#FFE600] selection:text-black">
                <div className="grain" />
                {/* A second, fainter glow top-right keeps the field from
                    reading as one flat gradient without adding a second
                    focal point. */}
                <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] bg-[#FFE600]/[0.04] rounded-full blur-[140px]" />

                <div className="relative w-full max-w-[420px] fade-in">
                    {/* Brand mark — horizontal, to keep the whole page
                        inside one viewport with no scroll on normal screens. */}
                    <div className="flex items-center justify-center gap-3 mb-5">
                        <img src={EyLogoLight} alt="EY" className="h-6 w-auto object-contain select-none pointer-events-none" />
                        <div className="h-6 w-px bg-white/15" />
                        <div className="text-left">
                            <div className="text-[10px] font-bold tracking-[0.3em] text-white/90 uppercase leading-none">DataPilot</div>
                            <div className="text-[8px] tracking-[0.2em] text-white/35 uppercase mt-1">
                                Évaluation de maturité data
                            </div>
                        </div>
                    </div>

                    {/* Vault panel — the glow is anchored to the yellow edge,
                        not centered on the viewport, so the light reads as
                        coming from the accent itself. */}
                    <div className="relative">
                        <div className="pointer-events-none absolute -left-16 top-1/3 w-64 h-64 bg-[#FFE600]/[0.12] rounded-full blur-[100px]" />
                        <div className="relative bg-white/[0.045] backdrop-blur-sm border-y border-r border-white/10 border-l-4 border-l-[#FFE600] shadow-[0_25px_70px_-25px_rgba(0,0,0,0.6),0_0_60px_-30px_rgba(255,230,0,0.15)]">
                            <div className="p-6 sm:p-8">
                                {/* Heading */}
                                <div className="space-y-1.5 mb-5">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.25em] text-[#FFE600] uppercase">
                                        <ShieldCheck className="w-3 h-3" />
                                        Accès professionnel EY
                                    </span>
                                    <h1 className="text-xl sm:text-2xl font-light text-white tracking-tight leading-[1.15]">
                                        Se connecter à <span className="font-semibold">l&apos;Espace Analytique</span>
                                    </h1>
                                    <p className="text-xs text-white/45 leading-snug">
                                        Utilisez l&apos;identifiant fourni par EY Consulting Tunisie.
                                    </p>
                                </div>

                            {/* Alert (from Keycloak) */}
                            {alert && (
                                <div
                                    className={`p-3 border-l-4 mb-4 text-xs flex items-start gap-2.5 ${
                                        alert.type === "success" ? "bg-[#FFE600]/10 border-[#FFE600] text-white" : "bg-red-500/10 border-red-500 text-red-200"
                                    }`}
                                >
                                    {alert.type === "success" ? (
                                        <Check className="w-4 h-4 flex-shrink-0 text-[#FFE600] mt-0.5" />
                                    ) : (
                                        <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" />
                                    )}
                                    <span className="leading-normal font-semibold" dangerouslySetInnerHTML={{ __html: alert.html }} />
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
                                    className="space-y-3.5"
                                >
                                    {/* EMAIL / USERNAME */}
                                    {!usernameHidden && (
                                        <div className="space-y-1.5">
                                            <label htmlFor="username" className="text-white/60 text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                Adresse e-mail professionnelle
                                            </label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-[#FFE600] transition-colors">
                                                    <Mail className="w-4 h-4" />
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
                                                    className="w-full h-11 pl-11 pr-5 bg-white/5 border border-white/15 text-sm font-medium tracking-wide placeholder-white/25 text-white focus:outline-none focus:border-[#FFE600] focus:bg-white/[0.07] focus:ring-2 focus:ring-[#FFE600]/25 transition-colors"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* PASSWORD */}
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between items-center">
                                            <label htmlFor="password" className="text-white/60 text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                Mot de passe
                                            </label>
                                            {realm.resetPasswordAllowed && (
                                                <a
                                                    href={url.loginResetCredentialsUrl}
                                                    tabIndex={6}
                                                    className="text-white/50 text-[10px] font-bold uppercase tracking-widest hover:text-[#FFE600] transition-colors cursor-pointer font-mono"
                                                >
                                                    Oublié ?
                                                </a>
                                            )}
                                        </div>
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-[#FFE600] transition-colors">
                                                <Lock className="w-4 h-4" />
                                            </div>
                                            <input
                                                id="password"
                                                name="password"
                                                type={showPassword ? "text" : "password"}
                                                autoComplete="current-password"
                                                tabIndex={3}
                                                aria-invalid={fieldErrorExists}
                                                placeholder="••••••••••••"
                                                className="w-full h-11 pl-11 pr-11 bg-white/5 border border-white/15 text-sm font-medium tracking-wide placeholder-white/25 text-white focus:outline-none focus:border-[#FFE600] focus:bg-white/[0.07] focus:ring-2 focus:ring-[#FFE600]/25 transition-colors"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/30 hover:text-[#FFE600] transition-colors cursor-pointer bg-transparent border-none outline-none"
                                                aria-label="Afficher le mot de passe"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>

                                    {/* REMEMBER ME */}
                                    {realm.rememberMe && !usernameHidden && (
                                        <div className="flex items-center justify-between pt-1">
                                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    id="rememberMe"
                                                    name="rememberMe"
                                                    tabIndex={5}
                                                    defaultChecked={!!login.rememberMe}
                                                    className="sr-only peer"
                                                />
                                                <div className="w-4 h-4 border border-white/25 bg-white/5 flex items-center justify-center transition-all peer-checked:bg-[#FFE600] peer-checked:border-[#FFE600]">
                                                    <Check className="w-3 h-3 text-black font-extrabold stroke-[3] opacity-0 peer-checked:opacity-100" />
                                                </div>
                                                <span className="text-[10px] text-white/45 font-bold tracking-wider font-mono uppercase">Rester connecté</span>
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
                                        className={`w-full h-11 bg-[#FFE600] text-black hover:bg-white hover:shadow-[0_0_30px_-6px_rgba(255,230,0,0.5)] active:scale-[0.99] tracking-widest text-xs uppercase font-extrabold flex items-center justify-center gap-2.5 transition-all duration-200 mt-4 cursor-pointer ${
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
                                <div className="mt-4 pt-4 border-t border-white/10 space-y-2">
                                    {social.providers.map(p => (
                                        <a
                                            key={p.alias}
                                            href={p.loginUrl}
                                            className="w-full h-10 flex items-center justify-center gap-2 border border-white/15 text-[11px] font-bold uppercase tracking-widest font-mono text-white/70 hover:border-[#FFE600] hover:text-white transition-colors"
                                        >
                                            <span dangerouslySetInnerHTML={{ __html: kcSanitize(p.displayName) }} />
                                        </a>
                                    ))}
                                </div>
                            )}

                            {/* Register link (only if registration is allowed) */}
                            {realm.password && realm.registrationAllowed && !registrationDisabled && (
                                <div className="mt-3 text-center text-[10px] text-white/40 font-mono uppercase tracking-wider">
                                    <a href={url.registrationUrl} className="font-bold text-[#FFE600] hover:underline">
                                        Créer un compte
                                    </a>
                                </div>
                            )}

                            {/* Helpline */}
                            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-[10px] text-white/30 font-mono uppercase">
                                <span className="font-medium">Assistance EY Tunisie</span>
                                <span className="font-bold tracking-wider text-white/70">support@ey-digital.tn</span>
                            </div>
                            </div>
                        </div>
                    </div>

                    <p className="mt-3 text-center text-[9px] uppercase tracking-widest text-white/25 font-mono flex items-center justify-center gap-1.5 font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> Accès réservé aux établissements bancaires de la place.
                    </p>
                </div>

                {/* Footer — plain, real, anchored to the bottom of the vault */}
                <div className="relative mt-4 text-center text-[9px] text-white/20 font-mono tracking-widest uppercase">
                    DataPilot — EY Consulting Tunisie · © 1996 - {new Date().getFullYear()} EY
                </div>
            </div>
        </Template>
    );
}
