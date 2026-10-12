/**
 * EY-branded logout confirmation (logout-confirm.ftl).
 *
 * Shown when a logout arrives without a verifiable session reference
 * (typically a back-channel or bookmarked logout URL): Keycloak asks the
 * person to confirm before actually ending the session.
 *
 * This one is a POST, not a link: the confirmation carries
 * logoutConfirm.code back to url.logoutConfirmAction, which is precisely
 * what stops a third-party page from logging someone out by linking at
 * them. Rendering it as an <a> would silently break that -- hence a real
 * form with the session_code hidden field, the same shape Keycloakify's
 * default page posts.
 *
 * "Rester connecté" is only offered when Keycloak told us where to go back
 * to (client.baseUrl); it omits that on a bare logout URL, and a dead
 * cancel button is worse than none.
 */
import { LogOut, ArrowLeft } from "lucide-react";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import { AuthShell, primaryActionClass, secondaryActionClass, SupportFooter } from "../components/AuthShell";

export default function LogoutConfirm(
    props: PageProps<Extract<KcContext, { pageId: "logout-confirm.ftl" }>, I18n>
) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes } = props;

    const { url, client, logoutConfirm } = kcContext;

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <AuthShell
                headline={
                    <>
                        Déconnexion. <span className="text-[#FFE600]">Confirmez-vous&nbsp;?</span>
                    </>
                }
                intro="Votre session DataPilot sera fermée sur cet appareil."
            >
                <div className="flex flex-col items-center text-center">
                    <div className="w-11 h-11 rounded-full bg-[#F7F7F5] border border-black/10 flex items-center justify-center">
                        <LogOut className="w-5 h-5 text-[#4A4A4A]" />
                    </div>

                    <h2 className="mt-4 text-[22px] font-bold text-[#1A1A1A] tracking-tight">Se déconnecter&nbsp;?</h2>
                    <p className="mt-2 text-[13.5px] leading-relaxed text-[#6B6B6B]">
                        Vous devrez saisir à nouveau vos identifiants pour accéder à DataPilot.
                    </p>
                </div>

                <form id="kc-logout-confirm-form" action={url.logoutConfirmAction} method="post" className="mt-6 space-y-2.5">
                    <input type="hidden" name="session_code" value={logoutConfirm.code} />

                    <button type="submit" id="kc-logout" name="confirmLogout" className={primaryActionClass}>
                        <LogOut className="w-4 h-4 text-current" />
                        <span>Confirmer la déconnexion</span>
                    </button>

                    {!logoutConfirm.skipLink && client.baseUrl && (
                        <a href={client.baseUrl} className={secondaryActionClass}>
                            <ArrowLeft className="w-3.5 h-3.5 text-current" />
                            <span>Rester connecté</span>
                        </a>
                    )}
                </form>

                <SupportFooter />
            </AuthShell>
        </Template>
    );
}
