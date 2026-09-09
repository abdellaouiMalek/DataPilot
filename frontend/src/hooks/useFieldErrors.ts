import { useState } from "react";
import { runValidators, type ValidatorSchema } from "../lib/validation";

/**
 * État + logique de validation d'un formulaire, partagé par toutes les
 * pages d'admin (voir docs/superpowers/specs/2026-09-08-form-field-validation-design.md).
 *
 * `validate` pose l'état des erreurs ET renvoie un booléen, pour que
 * `handleSubmit` puisse écrire `if (!validate(values, schema)) return;`
 * avant même d'appeler l'API.
 */
export function useFieldErrors<T extends Record<string, unknown>>() {
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});

  function validate(values: T, schema: ValidatorSchema<T>): boolean {
    const next = runValidators(values, schema);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof T): void {
    setErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function setError(field: keyof T, message: string): void {
    setErrors((prev) => ({ ...prev, [field]: message }));
  }

  function reset(): void {
    setErrors({});
  }

  return { errors, validate, clearError, setError, reset };
}
