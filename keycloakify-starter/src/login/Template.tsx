/**
 * Minimal pass-through Template.
 *
 * The default Keycloakify Template renders Keycloak's own page chrome (header,
 * message bar, info/social slots, default CSS). For the fully custom EY design
 * we render the entire page inside the page component instead, so this Template
 * only keeps Keycloak's required initialization (script loading / i18n readiness)
 * and renders the children as-is.
 */
import { useEffect } from "react";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import type { KcContext } from "./KcContext";
import type { I18n } from "./i18n";
import "./main.css";

export default function Template(props: TemplateProps<KcContext, I18n>) {
    const { kcContext, doUseDefaultCss, children, bodyClassName } = props;

    useEffect(() => {
        document.body.classList.add(...(bodyClassName ?? "").split(" ").filter(Boolean));
    }, [bodyClassName]);

    const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });

    if (!isReadyToRender) {
        return null;
    }

    return <>{children}</>;
}
