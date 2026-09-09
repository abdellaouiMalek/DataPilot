import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { BankModal } from "./AdminBanks";

// Mock du module réseau : bankLogoSrc reste réel (pure, sans effet), le
// reste est stubé -- createBank/updateBank sont contrôlés par test.
vi.mock("@/lib/adminBanks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/adminBanks")>("@/lib/adminBanks");
  return {
    ...actual,
    createBank: vi.fn(),
    updateBank: vi.fn(),
    uploadBankLogo: vi.fn(),
    deleteBankLogo: vi.fn(),
  };
});

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { createBank } from "@/lib/adminBanks";
import { toast } from "sonner";

const mockedCreateBank = vi.mocked(createBank);
const mockedToastError = vi.mocked(toast.error);
const mockedToastSuccess = vi.mocked(toast.success);

function renderAddModal() {
  const onSaved = vi.fn();
  const onClose = vi.fn();
  const onLogoChanged = vi.fn();
  render(<BankModal bank={null} onClose={onClose} onSaved={onSaved} onLogoChanged={onLogoChanged} />);
  return { onSaved, onClose, onLogoChanged };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BankModal -- validation à la soumission", () => {
  it("bloque la soumission d'un formulaire vide et affiche l'erreur sous le champ Nom", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderAddModal();

    await user.click(screen.getByRole("button", { name: /ajouter la banque/i }));

    expect(await screen.findByText("Ce champ est obligatoire.")).toBeInTheDocument();
    expect(mockedCreateBank).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledWith("Corrigez les champs en rouge.");
  });

  it("bloque un contact au format invalide sans toucher au champ Nom", async () => {
    const user = userEvent.setup();
    renderAddModal();

    await user.type(screen.getByPlaceholderText("ex. BIAT"), "BIAT");
    await user.type(screen.getByPlaceholderText("prenom.nom@banque.tn"), "pas-un-email");
    await user.click(screen.getByRole("button", { name: /ajouter la banque/i }));

    expect(await screen.findByText("Adresse e-mail invalide.")).toBeInTheDocument();
    expect(screen.queryByText("Ce champ est obligatoire.")).not.toBeInTheDocument();
    expect(mockedCreateBank).not.toHaveBeenCalled();
  });

  it("laisse passer un contact vide (optionnel) tant que le nom est renseigné", async () => {
    const user = userEvent.setup();
    mockedCreateBank.mockResolvedValueOnce({
      id: 1, name: "BIAT", country: "Tunisie", sector: "", contact: null,
      description: "", is_active: true, archived: false, logo_url: null,
      status: "Actif", created_at: null, score: null, assessments_count: 0,
      last_assessment_at: null,
    });
    const { onSaved } = renderAddModal();

    await user.type(screen.getByPlaceholderText("ex. BIAT"), "BIAT");
    await user.click(screen.getByRole("button", { name: /ajouter la banque/i }));

    await waitFor(() => expect(mockedCreateBank).toHaveBeenCalledTimes(1));
    expect(mockedCreateBank).toHaveBeenCalledWith(
      expect.objectContaining({ name: "BIAT", contact: null })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mockedToastSuccess).toHaveBeenCalled();
  });

  it("efface l'erreur du champ Nom dès que l'utilisateur retape dedans", async () => {
    const user = userEvent.setup();
    renderAddModal();

    await user.click(screen.getByRole("button", { name: /ajouter la banque/i }));
    expect(await screen.findByText("Ce champ est obligatoire.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("ex. BIAT"), "B");
    expect(screen.queryByText("Ce champ est obligatoire.")).not.toBeInTheDocument();
  });
});

describe("BankModal -- rejet serveur (409 nom en doublon)", () => {
  it("affiche le message serveur sous le champ Nom en plus du toast", async () => {
    const user = userEvent.setup();
    mockedCreateBank.mockRejectedValueOnce(
      new ApiError(409, "Une banque porte déjà ce nom.", { detail: "Une banque porte déjà ce nom." })
    );
    renderAddModal();

    await user.type(screen.getByPlaceholderText("ex. BIAT"), "BIAT");
    await user.click(screen.getByRole("button", { name: /ajouter la banque/i }));

    expect(await screen.findByText("Une banque porte déjà ce nom.")).toBeInTheDocument();
    expect(mockedToastError).toHaveBeenCalledWith(
      "Échec de l'ajout",
      expect.objectContaining({ description: "Une banque porte déjà ce nom." })
    );
  });
});
