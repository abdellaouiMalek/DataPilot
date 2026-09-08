import "./index.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import keycloak from "./lib/keycloak";

function renderApp() {
  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
}

keycloak
  .init({
    // check-sso: detect an existing session without forcing a login (the landing
    // page is public). Protected routes trigger login on demand via RequireAuth.
    onLoad: "check-sso",
    silentCheckSsoRedirectUri:
      window.location.origin + import.meta.env.BASE_URL + "silent-check-sso.html",
    pkceMethod: "S256",
    checkLoginIframe: false,
    // Cap how long we wait on the silent-SSO / 3rd-party-cookie iframe. Modern
    // browsers block 3rd-party cookies, so this check often times out, keep it
    // short so first paint isn't delayed.
    messageReceiveTimeout: 3000,
  })
  .then((authenticated) => {
    if (authenticated) {
      keycloak.onTokenExpired = () => {
        keycloak.updateToken(30).catch(() => keycloak.login());
      };
    }
  })
  .catch((err) => {
    // SSO check failed (Keycloak down, or the 3rd-party-cookie iframe timed out).
    // The app must still load, the landing page is public and protected routes
    // redirect to login on demand.
    console.warn("Keycloak init failed; continuing unauthenticated:", err);
  })
  .finally(() => {
    // Render whether or not the SSO check succeeded, so a Keycloak hiccup never
    // leaves a blank screen.
    renderApp();
  });
