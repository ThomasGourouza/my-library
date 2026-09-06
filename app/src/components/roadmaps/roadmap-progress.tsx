import { cn } from "@/lib/utils";

/**
 * Progression de lecture d'un parcours.
 *
 * La case « Lu » existait, était filtrable et triable, mais aucun écran ne
 * l'agrégeait : un parcours de trente livres n'indiquait nulle part combien en
 * étaient lus. C'est pourtant la seule chose qu'on veut savoir en ouvrant la
 * liste des parcours.
 */
export function RoadmapProgress({
  read,
  total,
  className,
  showLabel = true,
}: {
  read: number;
  total: number;
  className?: string;
  /** Sur les cartes, le libellé est déjà dans la ligne de badges. */
  showLabel?: boolean;
}) {
  const percent = total > 0 ? Math.round((read / total) * 100) : 0;
  const done = total > 0 && read === total;

  return (
    <div className={cn("space-y-1", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={read}
        aria-label={`Progression : ${read} livre${read > 1 ? "s" : ""} lu${
          read > 1 ? "s" : ""
        } sur ${total}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width]",
            done ? "bg-emerald-600 dark:bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <p className="text-xs text-muted-foreground">
          {read} lu{read > 1 ? "s" : ""} sur {total} · {percent} %
        </p>
      )}
    </div>
  );
}
