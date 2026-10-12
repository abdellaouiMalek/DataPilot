/**
 * EY-branded "compléter votre profil" (login-update-profile.ftl).
 *
 * Fires on the UPDATE_PROFILE required action -- an admin can set it on an
 * account (see AdminUsers) and it then blocks login until the person fills
 * in whatever the realm's user profile marks required.
 *
 * Unlike the other pages in this theme the fields are NOT hardcoded: which
 * attributes appear, which are required and how they validate all come
 * from the realm's user-profile configuration, so the form body is
 * delegated to Keycloakify's UserProfileFormFields exactly as the default
 * page does. Hardcoding first-name/last-name/email would silently drop any
 * custom attribute added in the admin console later.
 *
 * Because those fields are rendered by Keycloakify rather than by this
 * file, the EY look is applied through the kcClsx class map below -- the
 * theme runs with doUseDefaultCss={false}, so without it the generated
 * inputs would come out completely unstyled.
 *
 * `isFormSubmittable` is driven by that component's own client-side
 * validation; the submit button stays disabled until the values pass, the
 * same contract the default page relies on.
 */
import { useState } from "react";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx, type ClassKey } from "keycloakify/login/lib/kcClsx";
import { ArrowRight, AlertCircle, UserCog } from "lucide-react";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import type { PageProps } from "keycloakify/login/pages/PageProps";
import type { KcContext } from "../KcContext";
import type { I18n } from "../i18n";
import { AuthShell, primaryActionClass, secondaryActionClass, SupportFooter } from "../components/AuthShell";

/** EY styling for the field markup Keycloakify generates. Mirrors the
 *  hand-written inputs on Login/LoginResetPassword (same height, ground
 *  and focus ring) minus the leading icon, which those pages position
 *  around an input they control and this one does not. */
const userProfileClasses = {
    kcFormGroupClass: "space-y-1.5 mb-4",
    kcLabelWrapperClass: "",
    kcLabelClass: "text-[#1A1A1A] text-[13px] font-semibold block",
    kcInputWrapperClass: "",
    kcInputGroup: "relative flex items-stretch",
    kcInputClass:
        "w-full h-12 px-4 bg-[#F7F7F5] border border-black/10 text-[15px] text-[#1A1A1A] placeholder-black/30 " +
        "focus:outline-none focus:border-[#1A1A1A] focus:bg-white focus:ring-2 focus:ring-[#1A1A1A]/10 transition-colors",
    kcInputErrorMessageClass: "block mt-1 text-[12px] font-medium text-[#8A1F1F]",
    kcInputHelperTextBeforeClass: "block mb-1 text-[12px] text-[#6B6B6B]",
    kcInputHelperTextAfterClass: "block mt-1 text-[12px] text-[#6B6B6B]",
    kcFormPasswordVisibilityButtonClass:
        "absolute inset-y-0 right-0 px-4 flex items-center text-black/40 hover:text-[#1A1A1A] transition-colors cursor-pointer bg-transparent border-0",
    kcInputClassCheckbox: "flex items-center gap-2",
    kcInputClassCheckboxInput: "w-4 h-4 accent-[#FFE600] cursor-pointer",
    kcInputClassCheckboxLabel: "text-[13px] text-[#4A4A4A] cursor-pointer",
    kcInputClassRadio: "flex items-center gap-2",
    kcInputClassRadioInput: "w-4 h-4 accent-[#FFE600] cursor-pointer",
    kcInputClassRadioLabel: "text-[13px] text-[#4A4A4A] cursor-pointer",
    kcInputClassRadioCheckboxLabelDisabled: "opacity-50 cursor-not-allowed"
} satisfies { [key in ClassKey]?: string };

type LoginUpdateProfileProps = PageProps<Extract<KcContext, { pageId: "login-update-profile.ftl" }>, I18n> & {
    UserProfileFormFields: LazyOrNot<(props: UserProfileFormFieldsProps) => React.ReactElement>;
    doMakeUserConfirmPassword: boolean;
};

export default function LoginUpdateProfile(props: LoginUpdateProfileProps) {
    const { kcContext, i18n, Template, doUseDefaultCss, classes, UserProfileFormFields, doMakeUserConfirmPassword } = props;

    const { url, messagesPerField, isAppInitiatedAction, message } = kcContext;

    const [isFormSubmittable, setIsFormSubmittable] = useState(false);

    // Merged rather than replaced: `classes` stays the theme-wide override
    // point, so a class set there still wins over the defaults above.
    const { kcClsx } = getKcClsx({
        doUseDefaultCss: false,
        classes: { ...userProfileClasses, ...classes }
    });

    // Field-level errors are rendered next to their own field by
    // UserProfileFormFields; only the global ones need showing here.
    const globalError = messagesPerField.exists("global")
        ? messagesPerField.get("global")
        : message !== undefined && message.type === "error"
          ? message.summary
          : undefined;

    return (
        <Template kcContext={kcContext} i18n={i18n} doUseDefaultCss={doUseDefaultCss} classes={classes} headerNode={null}>
            <AuthShell
                headline={
                    <>
                        Votre profil. <span className="text-[#FFE600]">Presque complet.</span>
                    </>
                }
                intro="Quelques informations sont encore nécessaires avant d'accéder à DataPilot."
            >
                <div className="mb-5 flex items-start gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-full bg-[#F7F7F5] border border-black/10 flex items-center justify-center">
                        <UserCog className="w-[18px] h-[18px] text-[#4A4A4A]" />
                    </div>
                    <div>
                        <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight">Compléter votre profil</h2>
                        <p className="mt-1 text-[13.5px] text-[#6B6B6B]">Vérifiez et complétez les informations ci-dessous.</p>
                    </div>
                </div>

                {globalError !== undefined && (
                    <div
                        role="alert"
                        className="mb-5 px-4 py-3 rounded-md border text-[13px] flex items-start gap-2.5 bg-[#FDEDED] border-[#F3C6C6] text-[#8A1F1F]"
                    >
                        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                        <span className="leading-normal font-medium" dangerouslySetInnerHTML={{ __html: kcSanitize(globalError) }} />
                    </div>
                )}

                <form id="kc-update-profile-form" action={url.loginAction} method="post">
                    <UserProfileFormFields
                        kcContext={kcContext}
                        i18n={i18n}
                        kcClsx={kcClsx}
                        onIsFormSubmittableValueChange={setIsFormSubmittable}
                        doMakeUserConfirmPassword={doMakeUserConfirmPassword}
                    />

                    <div className="mt-5 space-y-2.5">
                        <button
                            type="submit"
                            disabled={!isFormSubmittable}
                            className={`${primaryActionClass} ${!isFormSubmittable ? "opacity-60 cursor-not-allowed hover:translate-y-0 hover:shadow-none hover:bg-[#FFE600]" : ""}`}
                        >
                            <span>Enregistrer et continuer</span>
                            <ArrowRight className="w-4 h-4 text-current" />
                        </button>

                        {/* Only an app-initiated action can be backed out of; on a
                            required action there is nowhere to cancel to. */}
                        {isAppInitiatedAction && (
                            <button type="submit" name="cancel-aia" value="true" formNoValidate className={secondaryActionClass}>
                                Annuler
                            </button>
                        )}
                    </div>
                </form>

                <SupportFooter />
            </AuthShell>
        </Template>
    );
}
