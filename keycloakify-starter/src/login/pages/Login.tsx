/**
 * EY-branded login page (login.ftl).
 *
 * The visual design is ported from the app's LoginPage.tsx, but all form
 * behaviour is wired to Keycloak: the form posts to `url.loginAction`, inputs
 * use the `username` / `password` / `rememberMe` field names Keycloak expects,
 * and validation/error messages come from `kcContext` (no client-side fake auth).
 */
import { useState, useEffect } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Mail, Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogo from "../assets/EY_logo2.png";
import ClairEyLogo from "../assets/ey-logo.png";

export default function Login(props: PageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { social, realm, url, usernameHidden, login, auth, registrationDisabled, messagesPerField, message } = kcContext;

    const [pageLoading, setPageLoading] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Simulated professional initializing of secured channel
    useEffect(() => {
        const timer = setTimeout(() => setPageLoading(false), 1200);
        return () => clearTimeout(timer);
    }, []);

    // Build a single alert from Keycloak's field errors / global message.
    const fieldErrorExists = messagesPerField.existsError("username", "password");
    const alert: { type: "success" | "error"; html: string } | null = fieldErrorExists
        ? { type: "error", html: kcSanitize(messagesPerField.getFirstError("username", "password")) }
        : message !== undefined
          ? { type: message.type === "error" ? "error" : "success", html: kcSanitize(message.summary) }
          : null;

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            {/* 1. BRAND LOADING SYSTEM (SMALL CIRCLE IN THE MIDDLE WITH THE EY LOGO) */}
            {pageLoading ? (
                <div className="min-h-screen bg-white flex flex-col items-center justify-center font-sans select-none">
                    <div className="relative flex flex-col items-center">
                        <div className="relative w-24 h-24 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-4 border-neutral-100 border-t-[#FFE600] animate-spin" />
                            <div className="z-10 bg-black text-[#FFE600] font-sans font-black text-2xl w-14 h-14 flex items-center justify-center shadow-lg border border-black transition-all">
                                <img src={ClairEyLogo} alt="EY Logo" className="h-7 w-auto object-contain select-none pointer-events-none" />
                            </div>
                        </div>
                        <div className="mt-6 text-center space-y-1">
                            <div className="text-black text-xs font-bold font-mono tracking-[0.2em] uppercase">INITIALISATION SECURED PORTAL</div>
                            <div className="text-neutral-400 text-[10px] uppercase font-mono tracking-widest flex items-center justify-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FFE600] animate-pulse" />
                                Établissement du canal sécurisé...
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* 2. MAIN WHITE PAGE LOGIN WITH CENTRED FORM & SHARP WHITE-YELLOW-BLACK INTERFACE */
                <div className="relative min-h-screen bg-white text-black font-sans flex flex-col justify-between selection:bg-[#FFE600] selection:text-black">
                    {/* BACKGROUND DECORATIONS */}
                    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000004_1px,transparent_1px),linear-gradient(to_bottom,#00000004_1px,transparent_1px)] bg-[size:4rem_4rem] z-0" />
                        <div className="absolute left-[20%] inset-y-0 w-[1px] bg-neutral-100 hidden lg:block" />
                        <div className="absolute right-[20%] inset-y-0 w-[1px] bg-neutral-100 hidden lg:block" />
                        <div className="absolute top-[30%] inset-x-0 h-[1px] bg-neutral-100 hidden lg:block" />
                        <div className="absolute bottom-[30%] inset-x-0 h-[1px] bg-neutral-100 hidden lg:block" />
                        <div className="absolute top-0 left-0 w-32 h-32 border-r border-b border-neutral-100 font-mono text-[9px] text-neutral-300 p-4">EY_GRID_A1</div>
                        <div className="absolute bottom-0 right-0 w-32 h-32 border-l border-t border-neutral-100 font-mono text-[9px] text-neutral-300 p-4 flex items-end justify-end">
                            TUN_GRID_Z9
                        </div>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#FFE600]/5 rounded-full filter blur-[140px] z-0" />
                    </div>

                    {/* HEADER */}
                    <header className="relative z-10 w-full px-6 py-5 max-w-[1600px] mx-auto flex items-center justify-between border-b border-neutral-200 bg-white">
                        <div className="flex items-center gap-3">
                            <img src={EyLogo} alt="EY Logo" className="h-7 w-auto object-contain select-none pointer-events-none" />
                            <div className="flex flex-col border-l border-gray-300 pl-4">
                                <span className="text-xs font-bold tracking-[0.2em] text-gray-900 leading-none">DATA MATURITY</span>
                                <span className="text-[10px] text-gray-500 tracking-widest mt-1">ASSESSMENT PLATFORM</span>
                            </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 bg-neutral-50 border border-neutral-200 px-3.5 py-1 text-[10px] tracking-widest text-black font-mono font-bold uppercase">
                            <div className="w-1.5 h-1.5 rounded-full bg-black" />
                            COMMUNICATION SÉCURISÉE TLS 1.3
                        </div>
                    </header>

                    {/* CENTRAL PORTAL CONTENT */}
                    <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 md:p-12 w-full max-w-[1400px] mx-auto">
                        <div className="w-full max-w-[450px] mx-auto relative">
                            <div className="absolute -inset-1.5 bg-gradient-to-r from-black via-[#FFE600] to-black opacity-10 blur-sm -z-10 rounded-xl" />
                            <div className="relative bg-white text-black border-2 border-black rounded-lg shadow-2xl overflow-hidden">
                                <div className="w-full h-2 bg-[#FFE600]" />
                                <div className="p-8 sm:p-10">
                                    {/* Heading */}
                                    <div className="space-y-3 mb-8 text-center sm:text-left">
                                        <div className="inline-block bg-black text-[#FFE600] text-[9px] font-bold tracking-[0.3em] font-mono px-3 py-1 uppercase rounded-sm">
                                            PORTAIL INTERNE ASSISTANCE
                                        </div>
                                        <h1 className="text-2xl sm:text-3xl font-light text-black tracking-tight pt-1">
                                            Connexion à <span className="font-extrabold block text-black">l&apos;Espace Analytique</span>
                                        </h1>
                                        <p className="text-xs text-neutral-500 font-light leading-relaxed">
                                            Saisissez les paramètres de sécurité attribués par EY Consulting Tunisie pour vérifier les indicateurs de
                                            maturité.
                                        </p>
                                    </div>

                                    {/* High visibility alert messages (from Keycloak) */}
                                    {alert && (
                                        <div
                                            className={`p-4 border-l-4 mb-6 text-xs flex items-start gap-2.5 ${
                                                alert.type === "success" ? "bg-neutral-900 border-[#FFE600] text-white" : "bg-red-50 border-red-500 text-red-950"
                                            }`}
                                        >
                                            {alert.type === "success" ? (
                                                <Check className="w-4 h-4 flex-shrink-0 text-[#FFE600] mt-0.5" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-600 mt-0.5" />
                                            )}
                                            <span className="leading-normal font-semibold font-mono" dangerouslySetInnerHTML={{ __html: alert.html }} />
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
                                            className="space-y-5"
                                        >
                                            {/* 1. EMAIL / USERNAME */}
                                            {!usernameHidden && (
                                                <div className="space-y-1.5">
                                                    <label htmlFor="username" className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                        Adresse E-mail Professionnelle
                                                    </label>
                                                    <div className="relative group">
                                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-black transition-colors">
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
                                                            className="w-full h-12 pl-11 pr-5 bg-neutral-50 border border-neutral-300 text-xs sm:text-sm font-semibold tracking-wide placeholder-neutral-400 focus:outline-none focus:border-black focus:bg-white text-black transition-colors rounded-sm"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* 2. PASSWORD */}
                                            <div className="space-y-1.5">
                                                <div className="flex justify-between items-center">
                                                    <label htmlFor="password" className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                        Mot de passe
                                                    </label>
                                                    {realm.resetPasswordAllowed && (
                                                        <a
                                                            href={url.loginResetCredentialsUrl}
                                                            tabIndex={6}
                                                            className="text-black text-[10px] font-bold uppercase tracking-widest hover:underline transition-colors cursor-pointer font-mono"
                                                        >
                                                            Oublié ?
                                                        </a>
                                                    )}
                                                </div>
                                                <div className="relative group">
                                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-black transition-colors">
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
                                                        className="w-full h-12 pl-11 pr-11 bg-neutral-50 border border-neutral-300 text-xs sm:text-sm font-semibold tracking-wide placeholder-neutral-400 focus:outline-none focus:border-black focus:bg-white text-black transition-colors rounded-sm"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-black transition-colors cursor-pointer bg-transparent border-none outline-none"
                                                        aria-label="Dévoiler le mot de passe"
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
                                                        <div className="w-4 h-4 border border-neutral-300 bg-neutral-100 flex items-center justify-center transition-all peer-checked:bg-black peer-checked:border-black rounded-sm">
                                                            <Check className="w-3 h-3 text-[#FFE600] font-extrabold stroke-[3]" />
                                                        </div>
                                                        <span className="text-[10px] text-neutral-600 font-bold tracking-wider font-mono uppercase">Rester connecté</span>
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
                                                className={`w-full h-12 bg-black text-white hover:bg-[#FFE600] hover:text-black hover:border-[#FFE600] active:scale-[0.99] tracking-widest text-xs uppercase font-extrabold flex items-center justify-center gap-2.5 transition-all mt-6 cursor-pointer border border-black rounded-sm shadow-md ${
                                                    loading ? "opacity-70 cursor-not-allowed" : ""
                                                }`}
                                            >
                                                {loading ? (
                                                    <>
                                                        <Loader2 className="w-4 h-4 animate-spin text-current" />
                                                        VÉRIFICATION EN COURS...
                                                    </>
                                                ) : (
                                                    <>
                                                        <span>EXÉCUTER L&apos;ACCÈS</span>
                                                        <ArrowRight className="w-4 h-4 text-current" />
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    )}

                                    {/* Social providers (rendered only if the realm has any) */}
                                    {realm.password && social?.providers !== undefined && social.providers.length !== 0 && (
                                        <div className="mt-6 pt-6 border-t border-neutral-200 space-y-2.5">
                                            {social.providers.map(p => (
                                                <a
                                                    key={p.alias}
                                                    href={p.loginUrl}
                                                    className="w-full h-11 flex items-center justify-center gap-2 border border-neutral-300 text-[11px] font-bold uppercase tracking-widest font-mono text-black hover:border-black hover:bg-neutral-50 transition-colors rounded-sm"
                                                >
                                                    <span dangerouslySetInnerHTML={{ __html: kcSanitize(p.displayName) }} />
                                                </a>
                                            ))}
                                        </div>
                                    )}

                                    {/* Register link (only if registration is allowed) */}
                                    {realm.password && realm.registrationAllowed && !registrationDisabled && (
                                        <div className="mt-4 text-center text-[10px] text-neutral-500 font-mono uppercase tracking-wider">
                                            <a href={url.registrationUrl} className="font-bold text-black hover:underline">
                                                Créer un compte
                                            </a>
                                        </div>
                                    )}

                                    {/* Helpline info links */}
                                    <div className="mt-8 pt-6 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-400 font-mono uppercase">
                                        <span className="flex items-center gap-1 font-medium text-neutral-500">Assistance EY Tunisie</span>
                                        <span className="font-bold tracking-wider text-black hover:underline cursor-pointer transition-colors">support@ey-digital.tn</span>
                                    </div>
                                </div>
                            </div>

                            {/* Secure disclaimer */}
                            <div className="mt-5 text-center">
                                <p className="text-[9px] uppercase tracking-widest text-neutral-400 font-mono flex items-center justify-center gap-1.5 font-bold">
                                    <ShieldAlert className="w-3.5 h-3.5 text-black" /> Accès réservé aux établissements bancaires de la place.
                                </p>
                            </div>
                        </div>
                    </main>

                    {/* FOOTER */}
                    <footer className="relative z-10 w-full px-6 py-6 max-w-[1600px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-4 border-t border-neutral-200 bg-white text-neutral-500 text-[10px] font-mono tracking-widest uppercase">
                        <div className="text-left w-full lg:w-auto font-light">
                            PROT_VER: STABLE_2.1.2
                            <br />
                            AUDIT_LOC: TUN-CORP-HQ
                        </div>
                        <div className="h-[1px] bg-neutral-200 flex-grow hidden lg:block mx-8" />
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-end gap-x-8 gap-y-2 w-full lg:w-auto text-left lg:text-right font-light">
                            <div>
                                ROUTAGE: CRYPTÉ SÉCURISÉ
                                <br />
                                ÉTAT DU COUPLAGE: SYNCHRONISÉ
                            </div>
                            <div className="mt-2 sm:mt-0 font-sans text-xs text-neutral-600 lowercase font-medium">
                                © 1996 - {new Date().getFullYear()} ey. tous droits réservés.
                            </div>
                        </div>
                    </footer>
                </div>
            )}
        </Template>
    );
}
