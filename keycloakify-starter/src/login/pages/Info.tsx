/**
 * EY-branded generic confirmation page (info.ftl).
 *
 * Keycloak lands here for every "we did the thing, here's what happens
 * next" moment. In this realm the one that actually fires today is the
 * end of the password-reset flow ("un e-mail vous a été envoyé"), which
 * means the branded Login -> branded LoginResetPassword sequence used to
 * finish on Keycloakify's unstyled default page -- the same jarring seam
 * LoginResetPassword.tsx was written to close, one step further along.
 *
 * The message itself is whatever Keycloak decided to render, so it is
 * passed through kcSanitize and injected as HTML rather than restated
 * here: hardcoding "check your email" would be wrong on every other
 * confirmation that routes through this page.
 *
 * The link precedence (pageRedirectUri, then actionUri, then
 * client.baseUrl, and nothing at all when skipLink is set) mirrors
 * Keycloakify's own Info page exactly -- it decides where "continue"
 * goes, and getting it wrong would strand people mid-flow.
 */
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { CheckCircle2, ArrowRight } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import { AuthShell, primaryActionClass, SupportFooter } from "../components/AuthShell";

export default function Info(props: PageProps<Extract<KcContext, { pageId: "info.ftl" }>, I18n>) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { advancedMsgStr } = i18n;
    const { messageHeader, message, requiredActions, skipLink, pageRedirectUri, actionUri, client } = kcContext;

    const heading = messageHeader ? advancedMsgStr(messageHeader) : message.summary;

    // Same composition as the default page: the summary, followed by the
    // outstanding required actions in bold when Keycloak lists any.
    const body = (() => {
        let html = message.summary?.trim() ?? "";
        if (requiredActions) {
            html += " <b>";
            html += requiredActions.map(requiredAction => advancedMsgStr(`requiredAction.${requiredAction}`)).join(", ");
            html += "</b>";
        }
        return html;
    })();

    const link = skipLink ? undefined : (pageRedirectUri ?? actionUri ?? client.baseUrl);
    // "Poursuivre" for an action still to be carried out, "back to the app"
    // otherwise -- actionUri is the only one of the three that continues a
    // flow rather than leaving it.
    const linkLabel = !skipLink && !pageRedirectUri && actionUri ? "Poursuivre" : "Retour à l'application";

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <AuthShell
                headline={
                    <>
                        C&apos;est noté. <span className="text-[#FFE600]">La suite arrive.</span>
                    </>
                }
                intro="Suivez l'indication ci-contre pour poursuivre en toute sécurité."
            >
                <div className="flex flex-col items-center text-center">
                    <div className="w-11 h-11 rounded-full bg-[#FFFBE0] border border-[#F5DE5C] flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-[#5C4E00]" />
                    </div>

                    <h2
                        className="mt-4 text-[22px] font-bold text-[#1A1A1A] tracking-tight text-balance"
                        dangerouslySetInnerHTML={{ __html: kcSanitize(heading) }}
                    />

                    <p
                        className="mt-2 text-[13.5px] leading-relaxed text-[#6B6B6B]"
                        dangerouslySetInnerHTML={{ __html: kcSanitize(body) }}
                    />
                </div>

                {link !== undefined && (
                    <a href={link} className={`${primaryActionClass} mt-6`}>
                        <span>{linkLabel}</span>
                        <ArrowRight className="w-4 h-4 text-current" />
                    </a>
                )}

                <SupportFooter />
            </AuthShell>
        </Template>
    );
}
