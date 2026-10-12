/**
 * EY-branded "page expirée" (login-page-expired.ftl).
 *
 * Keycloak serves this whenever an authentication session has timed out or
 * the browser replayed a stale login page -- routine on a form left open
 * over a lunch break, and until now the one moment where a user was
 * bounced from the branded login straight onto an unstyled Keycloak page.
 *
 * Keycloak offers two distinct ways out and the distinction matters, so
 * both are kept rather than collapsed into one button: restarting the flow
 * from scratch (url.loginRestartFlowUrl) and continuing the flow that
 * expired (url.loginAction). Restarting is the safe default and gets the
 * primary button; continuing is offered underneath for the case where the
 * session is in fact still usable.
 */
import { RotateCcw, ArrowRight, Clock } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import { AuthShell, primaryActionClass, secondaryActionClass, SupportFooter } from "../components/AuthShell";

export default function LoginPageExpired(
    props: PageProps<Extract<KcContext, { pageId: "login-page-expired.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url } = kcContext;

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <AuthShell
                headline={
                    <>
                        Session expirée. <span className="text-[#FFE600]">Reprenons.</span>
                    </>
                }
                intro="Par sécurité, une page de connexion laissée ouverte trop longtemps cesse d'être valable."
            >
                <div className="flex flex-col items-center text-center">
                    <div className="w-11 h-11 rounded-full bg-[#F7F7F5] border border-black/10 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-[#4A4A4A]" />
                    </div>

                    <h2 className="mt-4 text-[22px] font-bold text-[#1A1A1A] tracking-tight">Cette page a expiré</h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B6B6B]">
                        Votre session d&apos;authentification n&apos;est plus valide. Recommencez la connexion pour continuer.
                    </p>
                </div>

                <div className="mt-6 space-y-2.5">
                    <a id="loginRestartLink" href={url.loginRestartFlowUrl} className={primaryActionClass}>
                        <RotateCcw className="w-4 h-4 text-current" />
                        <span>Recommencer la connexion</span>
                    </a>

                    <a id="loginContinueLink" href={url.loginAction} className={secondaryActionClass}>
                        <span>Poursuivre la session en cours</span>
                        <ArrowRight className="w-4 h-4 text-current" />
                    </a>
                </div>

                <SupportFooter />
            </AuthShell>
        </Template>
    );
}
