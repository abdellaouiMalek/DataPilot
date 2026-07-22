/**
 * EY-branded "set your password" page (login-update-password.ftl).
 *
 * Keycloak forces this required action whenever a temporary password is used
 * (new accounts, or after an admin reset) — it can't be skipped by styling
 * the login page alone. Same visual language as Login.tsx so the flow reads
 * as one continuous DataPilot experience instead of a jump into "Keycloak".
 *
 * Fields/behaviour are wired to Keycloak: the form posts to `url.loginAction`
 * with the `password-new` / `password-confirm` / `logout-sessions` field
 * names Keycloak expects; the password match check below is a UX hint only —
 * Keycloak still validates the confirm-match and any password policy itself.
 */
import { useState, useEffect } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle, ShieldAlert } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogo from "../assets/EY_logo2.png";
import ClairEyLogo from "../assets/ey-logo.png";

export default function UpdatePassword(
    props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url, messagesPerField, isAppInitiatedAction, message } = kcContext;
    const { msg, msgStr } = i18n;

    const [pageLoading, setPageLoading] = useState(true);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [passwordNew, setPasswordNew] = useState("");
    const [passwordConfirm, setPasswordConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setPageLoading(false), 900);
        return () => clearTimeout(timer);
    }, []);

    const fieldErrorExists = messagesPerField.existsError("password", "password-confirm");
    const alert: { type: "success" | "error"; html: string } | null = fieldErrorExists
        ? { type: "error", html: kcSanitize(messagesPerField.getFirstError("password", "password-confirm")) }
        : message !== undefined
          ? { type: message.type === "error" ? "error" : "success", html: kcSanitize(message.summary) }
          : null;

    const matchState: "empty" | "match" | "mismatch" =
        passwordConfirm.length === 0 ? "empty" : passwordNew === passwordConfirm ? "match" : "mismatch";

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
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
                            <div className="text-black text-xs font-bold font-mono tracking-[0.2em] uppercase">CONFIGURATION DU COMPTE</div>
                            <div className="text-neutral-400 text-[10px] uppercase font-mono tracking-widest flex items-center justify-center gap-1">
                                <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#FFE600] animate-pulse" />
                                Préparation de votre espace...
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative min-h-screen bg-white text-black font-sans flex flex-col justify-between selection:bg-[#FFE600] selection:text-black">
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

                    <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6 md:p-12 w-full max-w-[1400px] mx-auto">
                        <div className="w-full max-w-[450px] mx-auto relative">
                            <div className="absolute -inset-1.5 bg-gradient-to-r from-black via-[#FFE600] to-black opacity-10 blur-sm -z-10 rounded-xl" />
                            <div className="relative bg-white text-black border-2 border-black rounded-lg shadow-2xl overflow-hidden">
                                <div className="w-full h-2 bg-[#FFE600]" />
                                <div className="p-8 sm:p-10">
                                    <div className="space-y-3 mb-8 text-center sm:text-left">
                                        <div className="inline-block bg-black text-[#FFE600] text-[9px] font-bold tracking-[0.3em] font-mono px-3 py-1 uppercase rounded-sm">
                                            DERNIÈRE ÉTAPE
                                        </div>
                                        <h1 className="text-2xl sm:text-3xl font-light text-black tracking-tight pt-1">
                                            Définissez votre <span className="font-extrabold block text-black">mot de passe</span>
                                        </h1>
                                        <p className="text-xs text-neutral-500 font-light leading-relaxed">
                                            Votre compte a été créé par un administrateur EY avec un accès temporaire. Choisissez un mot
                                            de passe personnel pour finaliser votre accès à l&apos;Espace Analytique.
                                        </p>
                                    </div>

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

                                    <form
                                        id="kc-passwd-update-form"
                                        action={url.loginAction}
                                        method="post"
                                        onSubmit={() => {
                                            setLoading(true);
                                            return true;
                                        }}
                                        className="space-y-5"
                                    >
                                        {/* NEW PASSWORD */}
                                        <div className="space-y-1.5">
                                            <label htmlFor="password-new" className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                {msg("passwordNew")}
                                            </label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-black transition-colors">
                                                    <Lock className="w-4 h-4" />
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
                                                    className="w-full h-12 pl-11 pr-11 bg-neutral-50 border border-neutral-300 text-xs sm:text-sm font-semibold tracking-wide placeholder-neutral-400 focus:outline-none focus:border-black focus:bg-white text-black transition-colors rounded-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowNew(!showNew)}
                                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-black transition-colors cursor-pointer bg-transparent border-none outline-none"
                                                    aria-label={msgStr(showNew ? "hidePassword" : "showPassword")}
                                                >
                                                    {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>

                                        {/* CONFIRM PASSWORD */}
                                        <div className="space-y-1.5">
                                            <label htmlFor="password-confirm" className="text-black text-[10px] font-bold uppercase tracking-widest block font-mono">
                                                {msg("passwordConfirm")}
                                            </label>
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400 group-focus-within:text-black transition-colors">
                                                    <Lock className="w-4 h-4" />
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
                                                    className="w-full h-12 pl-11 pr-11 bg-neutral-50 border border-neutral-300 text-xs sm:text-sm font-semibold tracking-wide placeholder-neutral-400 focus:outline-none focus:border-black focus:bg-white text-black transition-colors rounded-sm"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirm(!showConfirm)}
                                                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-400 hover:text-black transition-colors cursor-pointer bg-transparent border-none outline-none"
                                                    aria-label={msgStr(showConfirm ? "hidePassword" : "showPassword")}
                                                >
                                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                            {/* Live hint only — Keycloak is the source of truth on submit */}
                                            {matchState !== "empty" && (
                                                <p
                                                    className={`text-[10px] font-mono font-bold tracking-wide flex items-center gap-1.5 pt-0.5 ${
                                                        matchState === "match" ? "text-emerald-700" : "text-amber-700"
                                                    }`}
                                                >
                                                    {matchState === "match" ? (
                                                        <>
                                                            <Check className="w-3 h-3" /> Les mots de passe correspondent
                                                        </>
                                                    ) : (
                                                        "Les mots de passe ne correspondent pas encore"
                                                    )}
                                                </p>
                                            )}
                                        </div>

                                        {/* LOGOUT OTHER SESSIONS */}
                                        <div className="flex items-center justify-between pt-1">
                                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    id="logout-sessions"
                                                    name="logout-sessions"
                                                    value="on"
                                                    defaultChecked
                                                    className="sr-only peer"
                                                />
                                                <div className="w-4 h-4 border border-neutral-300 bg-neutral-100 flex items-center justify-center transition-all peer-checked:bg-black peer-checked:border-black rounded-sm">
                                                    <Check className="w-3 h-3 text-[#FFE600] font-extrabold stroke-[3]" />
                                                </div>
                                                <span className="text-[10px] text-neutral-600 font-bold tracking-wider font-mono uppercase">
                                                    {msg("logoutOtherSessions")}
                                                </span>
                                            </label>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className={`w-full h-12 bg-black text-white hover:bg-[#FFE600] hover:text-black hover:border-[#FFE600] active:scale-[0.99] tracking-widest text-xs uppercase font-extrabold flex items-center justify-center gap-2.5 transition-all mt-6 cursor-pointer border border-black rounded-sm shadow-md ${
                                                loading ? "opacity-70 cursor-not-allowed" : ""
                                            }`}
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 animate-spin text-current" />
                                                    ENREGISTREMENT...
                                                </>
                                            ) : (
                                                <>
                                                    <span>{msgStr("doSubmit")}</span>
                                                    <ArrowRight className="w-4 h-4 text-current" />
                                                </>
                                            )}
                                        </button>

                                        {isAppInitiatedAction && (
                                            <button
                                                type="submit"
                                                name="cancel-aia"
                                                value="true"
                                                className="w-full h-11 border border-neutral-300 text-[11px] font-bold uppercase tracking-widest font-mono text-neutral-600 hover:border-black hover:text-black transition-colors rounded-sm"
                                            >
                                                {msg("doCancel")}
                                            </button>
                                        )}
                                    </form>

                                    <div className="mt-8 pt-6 border-t border-neutral-200 flex items-center justify-between text-[10px] text-neutral-400 font-mono uppercase">
                                        <span className="flex items-center gap-1 font-medium text-neutral-500">Assistance EY Tunisie</span>
                                        <span className="font-bold tracking-wider text-black hover:underline cursor-pointer transition-colors">support@ey-digital.tn</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 text-center">
                                <p className="text-[9px] uppercase tracking-widest text-neutral-400 font-mono flex items-center justify-center gap-1.5 font-bold">
                                    <ShieldAlert className="w-3.5 h-3.5 text-black" /> Accès réservé aux établissements bancaires de la place.
                                </p>
                            </div>
                        </div>
                    </main>

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
