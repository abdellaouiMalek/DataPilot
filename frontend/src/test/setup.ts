// Chargé avant chaque fichier de test (voir vite.config.ts -- test.setupFiles).
// Ajoute les matchers jest-dom (toBeInTheDocument, toHaveTextContent...) à
// `expect`, utilisés par les tests de composants.
import "@testing-library/jest-dom/vitest";

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// L'auto-cleanup intégré de Testing Library s'accroche à un `afterEach`
// GLOBAL -- absent ici puisque vite.config.ts a `test.globals: false`
// (imports explicites partout, comme le reste de ce projet). Sans cet
// appel manuel, le DOM d'un test reste monté pour le suivant : deux
// rendus de BankModal coexistent, et `getByPlaceholderText(...)` échoue
// avec "plusieurs éléments trouvés" au lieu d'un seul.
afterEach(() => {
  cleanup();
});
