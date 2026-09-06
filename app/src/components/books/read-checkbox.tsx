"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * Case « Lu » d'un livre. Le seul champ que l'interface modifie en dehors du
 * formulaire d'édition : elle écrit via PUT /api/books/[id], qui accepte une
 * mise à jour partielle.
 *
 * L'affichage suit un état local plutôt que la donnée serveur : cocher doit
 * répondre instantanément, sans attendre le rechargement des 2044 lignes du
 * tableau. Le `router.refresh()` qui suit resynchronise les filtres et les
 * compteurs ; en cas d'échec, la case revient à sa valeur précédente.
 */
export function ReadCheckbox({
  bookId,
  read,
  title,
  label,
  className,
}: {
  bookId: number;
  read: boolean;
  /** Sert à l'étiquette accessible : « Lu — <titre> ». */
  title: string;
  /** Affiche un libellé « Lu » à côté de la case (fiche livre, parcours). */
  label?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [checked, setChecked] = React.useState(read);
  const [pending, setPending] = React.useState(false);

  async function toggle(next: boolean) {
    const previous = checked;
    setChecked(next);
    setPending(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ read: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setChecked(previous);
      toast.error("Impossible d’enregistrer « Lu »");
    } finally {
      setPending(false);
    }
  }

  const box = (
    <Checkbox
      checked={checked}
      disabled={pending}
      onCheckedChange={(v) => toggle(v === true)}
      aria-label={`Lu — ${title}`}
      className={cn(pending && "opacity-50", className)}
    />
  );

  if (!label) return box;
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm select-none">
      {box}
      <span className={cn(!checked && "text-muted-foreground")}>Lu</span>
    </label>
  );
}
