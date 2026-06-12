import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
});


export const logout = () =>
  keycloak.logout({
    redirectUri: window.location.origin + import.meta.env.BASE_URL,
  });

export default keycloak;
