import { createElement, useCallback, useEffect, useState } from "react";
import { ConfirmDialogView } from "../components/ConfirmDialog";
import type { ConfirmOptions, PendingConfirm } from "../components/ConfirmDialog";

export type { ConfirmOptions, ConfirmVariant } from "../components/ConfirmDialog";

/**
 * Promise-based, styled replacement for window.confirm() -- see
 * components/ConfirmDialog for why the native dialog doesn't fit here.
 *
 * Usage:
 *   const { confirm, dialog } = useConfirm();
 *   ...
 *   async function handleDelete() {
 *     if (!(await confirm({ title: "Supprimer ?", variant: "danger" }))) return;
 *     await doTheThing();
 *   }
 *   return <>{dialog}{/* rest of the page *\/}</>;
 */
export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({
        title: options.title,
        description: options.description ?? "",
        variant: options.variant ?? "warning",
        confirmLabel: options.confirmLabel ?? "Confirmer",
        cancelLabel: options.cancelLabel ?? "Annuler",
        icon: options.icon,
        resolve,
      });
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    setPending(current => {
      current?.resolve(value);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pending, settle]);

  const dialog = pending
    ? createElement(ConfirmDialogView, { pending, onCancel: () => settle(false), onConfirm: () => settle(true) })
    : null;

  return { confirm, dialog };
}
