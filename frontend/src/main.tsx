import "./index.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import keycloak from "./lib/keycloak";

keycloak
  .init({
    // check-sso: render the app whether or not the user is logged in (the landing
    // page is public). Protected routes trigger login on demand via RequireAuth.
    onLoad: "check-sso",
    silentCheckSsoRedirectUri:
      window.location.origin + import.meta.env.BASE_URL + "silent-check-sso.html",
    pkceMethod: "S256",
    checkLoginIframe: false,
  })
  .then(() => {
    keycloak.onTokenExpired = () => {
      keycloak.updateToken(30).catch(() => keycloak.login());
    };

    ReactDOM.createRoot(document.getElementById("root")!).render(
      <App />
    );
  });