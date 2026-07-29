import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Appends an alpha suffix to a 6-digit hex color, e.g. tint('#e05c5c', '22'). */
export function tint(hex: string, alpha: string) {
  return `${hex}${alpha}`;
}

/** Formats an ISO date as a capitalized "Month Year" in French, e.g. "Juin 2026". */
export function formatMonthYear(iso: string) {
  const label = new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
