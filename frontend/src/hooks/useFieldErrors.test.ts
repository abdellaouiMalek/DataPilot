import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { required } from "../lib/validation";
import { useFieldErrors } from "./useFieldErrors";

describe("useFieldErrors", () => {
  it("commence sans erreur", () => {
    const { result } = renderHook(() => useFieldErrors<{ name: string }>());
    expect(result.current.errors).toEqual({});
  });

  it("validate pose les erreurs et renvoie false si le schéma échoue", () => {
    const { result } = renderHook(() => useFieldErrors<{ name: string }>());

    let ok!: boolean;
    act(() => {
      ok = result.current.validate({ name: "" }, { name: required });
    });

    expect(ok).toBe(false);
    expect(result.current.errors).toEqual({ name: "Ce champ est obligatoire." });
  });

  it("validate renvoie true et vide les erreurs quand tout passe", () => {
    const { result } = renderHook(() => useFieldErrors<{ name: string }>());

    act(() => {
      result.current.validate({ name: "" }, { name: required });
    });
    expect(result.current.errors).not.toEqual({});

    let ok!: boolean;
    act(() => {
      ok = result.current.validate({ name: "BIAT" }, { name: required });
    });
    expect(ok).toBe(true);
    expect(result.current.errors).toEqual({});
  });

  it("clearError retire uniquement le champ demandé", () => {
    const { result } = renderHook(() => useFieldErrors<{ name: string; contact: string }>());

    act(() => {
      result.current.setError("name", "Erreur nom");
      result.current.setError("contact", "Erreur contact");
    });
    expect(result.current.errors).toEqual({ name: "Erreur nom", contact: "Erreur contact" });

    act(() => {
      result.current.clearError("name");
    });
    expect(result.current.errors).toEqual({ contact: "Erreur contact" });
  });

  it("reset vide toutes les erreurs", () => {
    const { result } = renderHook(() => useFieldErrors<{ name: string }>());

    act(() => {
      result.current.setError("name", "Erreur");
    });
    expect(result.current.errors).not.toEqual({});

    act(() => {
      result.current.reset();
    });
    expect(result.current.errors).toEqual({});
  });
});
