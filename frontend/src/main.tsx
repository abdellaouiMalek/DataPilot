import "./index.css";
import ReactDOM from "react-dom/client";
import App from "./App";
import keycloak from "./keycloak";

keycloak
  .init({
    onLoad: "login-required",
    pkceMethod: "S256",
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  })
  .then(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(
      <App />
    );
  });