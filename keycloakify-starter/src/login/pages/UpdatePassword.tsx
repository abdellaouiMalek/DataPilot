/**
 * EY-branded "set your password" page (login-update-password.ftl).
 *
 * Keycloak forces this required action whenever a temporary password is used
 * (new accounts, or after an admin reset) — it can't be skipped by styling
 * the login page alone. Same "vault" visual language as Login.tsx (see its
 * header comment for the design rationale), so the flow reads as one
 * continuous DataPilot experience instead of a jump into "Keycloak".
 *
 * Fields/behaviour are wired to Keycloak: the form posts to `url.loginAction`
 * with the `password-new` / `password-confirm` / `logout-sessions` field
 * names Keycloak expects; the password match check below is a UX hint only —
 * Keycloak still validates the confirm-match and any password policy itself.
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { Lock, ArrowRight, Eye, EyeOff, Check, Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import EyLogoLight from "../assets/ey-logo.png";

export default function UpdatePassword(
    props: PageProps<Extract<KcContext, { pageId: "login-update-password.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url, messagesPerField, isAppInitiatedAction, message } = kcContext;
    const { msg, msgStr } = i18n;

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

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <div className="relative h-screen overflow-y-auto bg-[#1A1A1A] text-white font-sans flex flex-col items-center justify-center px-4 py-5 selection:bg-[#FFE600] selection:text-black">
                <div className="grain" />
                <div className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] bg-[#FFE600]/[0.04] rounded-full blur-[140px]" />

                <div className="relative w-full max-w-[420px] fade-in">
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

                    <div className="relative">
                        <div className="pointer-events-none absolute -left-16 top-1/3 w-64 h-64 bg-[#FFE600]/[0.12] rounded-full blur-[100px]" />
                        <div className="relative bg-white/[0.045] backdrop-blur-sm border-y border-r border-white/10 border-l-4 border-l-[#FFE600] shadow-[0_25px_70px_-25px_rgba(0,0,0,0.6),0_0_60px_-30px_rgba(255,230,0,0.15)]">
                            <div className="p-6 sm:p-8">
                                <div className="space-y-1.5 mb-5">
                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.25em] text-[#FFE600] uppercase">
                                        <ShieldCheck className="w-3 h-3" />
                                        Dernière étape
                                    </span>
                                    <h1 className="text-xl sm:text-2xl font-light text-white tracking-tight leading-[1.15]">
                                        Définissez votre <span className="font-semibold">mot de passe</span>
                                    </h1>
                                    <p className="text-xs text-white/45 leading-snug">
                                        Compte créé par un administrateur EY avec un accès temporaire.
                                    </p>
                                </div>

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

                            <form
                                id="kc-passwd-update-form"
                                action={url.loginAction}
                                method="post"
                                onSubmit={() => {
                                    setLoading(true);
                                    return true;
                                }}
                                className="space-y-3.5"
                            >
                                {/* NEW PASSWORD */}
                                <div className="space-y-1.5">
                                    <label htmlFor="password-new" className="text-white/60 text-[10px] font-bold uppercase tracking-widest block font-mono">
                                        {msg("passwordNew")}
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-[#FFE600] transition-colors">
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
                                            className="w-full h-11 pl-11 pr-11 bg-white/5 border border-white/15 text-sm font-medium tracking-wide placeholder-white/25 text-white focus:outline-none focus:border-[#FFE600] focus:bg-white/[0.07] focus:ring-2 focus:ring-[#FFE600]/25 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNew(!showNew)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/30 hover:text-[#FFE600] transition-colors cursor-pointer bg-transparent border-none outline-none"
                                            aria-label={msgStr(showNew ? "hidePassword" : "showPassword")}
                                        >
                                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* CONFIRM PASSWORD */}
                                <div className="space-y-1.5">
                                    <label htmlFor="password-confirm" className="text-white/60 text-[10px] font-bold uppercase tracking-widest block font-mono">
                                        {msg("passwordConfirm")}
                                    </label>
                                    <div className="relative group">
                                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-white/30 group-focus-within:text-[#FFE600] transition-colors">
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
                                            className="w-full h-11 pl-11 pr-11 bg-white/5 border border-white/15 text-sm font-medium tracking-wide placeholder-white/25 text-white focus:outline-none focus:border-[#FFE600] focus:bg-white/[0.07] focus:ring-2 focus:ring-[#FFE600]/25 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirm(!showConfirm)}
                                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-white/30 hover:text-[#FFE600] transition-colors cursor-pointer bg-transparent border-none outline-none"
                                            aria-label={msgStr(showConfirm ? "hidePassword" : "showPassword")}
                                        >
                                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {/* Live hint only — Keycloak is the source of truth on submit */}
                                    {matchState !== "empty" && (
                                        <p
                                            className={`text-[10px] font-bold tracking-wide flex items-center gap-1.5 pt-0.5 ${
                                                matchState === "match" ? "text-emerald-400" : "text-amber-400"
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
                                        <div className="w-4 h-4 border border-white/25 bg-white/5 flex items-center justify-center transition-all peer-checked:bg-[#FFE600] peer-checked:border-[#FFE600]">
                                            <Check className="w-3 h-3 text-black font-extrabold stroke-[3] opacity-0 peer-checked:opacity-100" />
                                        </div>
                                        <span className="text-[10px] text-white/45 font-bold tracking-wider font-mono uppercase">
                                            {msg("logoutOtherSessions")}
                                        </span>
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className={`w-full h-11 bg-[#FFE600] text-black hover:bg-white hover:shadow-[0_0_30px_-6px_rgba(255,230,0,0.5)] active:scale-[0.99] tracking-widest text-xs uppercase font-extrabold flex items-center justify-center gap-2.5 transition-all duration-200 mt-4 cursor-pointer ${
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
                                        className="w-full h-11 border border-white/15 text-[11px] font-bold uppercase tracking-widest font-mono text-white/50 hover:border-[#FFE600] hover:text-white transition-colors"
                                    >
                                        {msg("doCancel")}
                                    </button>
                                )}
                            </form>

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

                <div className="relative mt-4 text-center text-[9px] text-white/20 font-mono tracking-widest uppercase">
                    DataPilot — EY Consulting Tunisie · © 1996 - {new Date().getFullYear()} EY
                </div>
            </div>
        </Template>
    );
}
