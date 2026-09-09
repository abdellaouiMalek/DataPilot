import { describe, expect, it } from "vitest";
import { email, required, runValidators } from "./validation";

describe("required", () => {
  it("rejette une chaîne vide", () => {
    expect(required("")).toBe("Ce champ est obligatoire.");
  });

  it("rejette une chaîne composée uniquement d'espaces", () => {
    expect(required("   ")).toBe("Ce champ est obligatoire.");
  });

  it("accepte une valeur non vide", () => {
    expect(required("BIAT")).toBeUndefined();
  });
});

describe("email", () => {
  it("ignore une valeur vide (champ optionnel -- required s'en charge)", () => {
    expect(email("")).toBeUndefined();
    expect(email("   ")).toBeUndefined();
  });

  it("accepte une adresse valide", () => {
    expect(email("prenom.nom@banque.tn")).toBeUndefined();
  });

  it("rejette une adresse mal formée", () => {
    expect(email("pas-une-adresse")).toBe("Adresse e-mail invalide.");
  });

  it("rejette une adresse sans domaine", () => {
    expect(email("nom@")).toBe("Adresse e-mail invalide.");
  });
});

describe("runValidators", () => {
  it("ne renvoie que les champs en échec", () => {
    const errors = runValidators(
      { name: "", contact: "invalide" },
      { name: required, contact: email }
    );
    expect(errors).toEqual({
      name: "Ce champ est obligatoire.",
      contact: "Adresse e-mail invalide.",
    });
  });

  it("renvoie un objet vide quand tout est valide", () => {
    const errors = runValidators(
      { name: "BIAT", contact: "contact@biat.tn" },
      { name: required, contact: email }
    );
    expect(errors).toEqual({});
  });

  it("ignore les champs absents du schéma", () => {
    const errors = runValidators(
      { name: "BIAT", country: "Tunisie" },
      { name: required }
    );
    expect(errors).toEqual({});
  });
});
