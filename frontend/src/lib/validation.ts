/**
 * Validateurs de champ purs -- chacun renvoie un message d'erreur en
 * français, ou `undefined` si la valeur est valide.
 *
 * Volontairement minimal (YAGNI) : seuls `required` et `email` existent
 * pour l'instant, parce que ce sont les deux seuls dont `AdminBanks.tsx`
 * a besoin (voir docs/superpowers/specs/2026-09-08-form-field-validation-design.md).
 * Une page suivante qui a besoin d'une règle plus étroite (longueur
 * minimale, format d'URL...) l'ajoute ici comme une fonction de plus,
 * pas en anticipant maintenant des règles que rien n'utilise encore.
 */

export function required(value: string): string | undefined {
  return value.trim() ? undefined : "Ce champ est obligatoire.";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Contrôle de format uniquement -- ignore volontairement une valeur vide
 * (renvoie `undefined`), pour composer proprement avec un champ
 * *optionnel* : `required` impose la présence, `email` ne juge que ce qui
 * est réellement saisi.
 */
export function email(value: string): string | undefined {
  if (!value.trim()) return undefined;
  return EMAIL_RE.test(value.trim()) ? undefined : "Adresse e-mail invalide.";
}

export type ValidatorSchema<T> = {
  [K in keyof T]?: (value: T[K]) => string | undefined;
};

/** Applique chaque règle de `schema` à la valeur correspondante de `values`,
 * ne renvoie que les champs qui échouent. */
export function runValidators<T extends Record<string, unknown>>(
  values: T,
  schema: ValidatorSchema<T>
): Partial<Record<keyof T, string>> {
  const errors: Partial<Record<keyof T, string>> = {};
  for (const key in schema) {
    const validator = schema[key];
    if (!validator) continue;
    const message = validator(values[key]);
    if (message) errors[key] = message;
  }
  return errors;
}
