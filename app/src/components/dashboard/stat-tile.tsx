import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Une tuile de statistique : une valeur, ce qu'elle mesure, et de quoi la
 * remettre en contexte. Pas de graphique — un chiffre unique n'en demande pas.
 *
 * Les valeurs sont en chasse proportionnelle : `tabular-nums` donnerait à chaque
 * chiffre la largeur d'un zéro, ce qui rend « 2038 » lâche à cette taille. Le
 * tabulaire est réservé aux colonnes de nombres qui doivent s'aligner.
 */
export function StatTile({
  label,
  value,
  hint,
  href,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Rend la tuile entière cliquable, via un lien étendu. */
  href?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-lg border p-4",
        href && "transition-colors hover:bg-muted/40",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">
        {href ? (
          <Link href={href} className="after:absolute after:inset-0">
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
