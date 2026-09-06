import Link from "next/link";
import { cn } from "@/lib/utils";

export interface BreakdownRow {
  /** Libellé lisible de la ligne. */
  label: string;
  total: number;
  read: number;
  /** Lien vers la liste filtrée correspondante. */
  href: string;
  /** Infobulle : à quoi correspond cette ligne. */
  title?: string;
}

/**
 * Répartition d'un corpus en quelques classes, avec la part lue.
 *
 * Forme choisie : des barres horizontales, une par classe, plutôt qu'un
 * camembert ou un jeu de couleurs. Les classes sont peu nombreuses et portent
 * des libellés longs (« Philosophie & psychologie ») ; l'horizontale les laisse
 * lisibles, et la longueur suffit à comparer des grandeurs.
 *
 * Une seule teinte : ces barres comparent des grandeurs, elles ne distinguent
 * pas des identités. Une couleur par classe dépenserait le seul canal libre
 * pour redire ce que la longueur dit déjà. La part lue est un pas plus foncé de
 * la même rampe, à l'intérieur de la barre — la barre entière reste l'effectif
 * de la classe.
 */
export function BreakdownBars({
  rows,
  className,
}: {
  rows: BreakdownRow[];
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((row) => {
        const widthPercent = (row.total / max) * 100;
        const readPercent = row.total > 0 ? (row.read / row.total) * 100 : 0;
        return (
          <li key={row.label} className="grid grid-cols-[1fr_auto] gap-x-3">
            <Link
              href={row.href}
              title={row.title}
              className="truncate text-sm hover:underline"
            >
              {row.label}
            </Link>
            <span className="text-sm tabular-nums text-muted-foreground">
              {row.read > 0 && (
                <span className="text-foreground">{row.read} / </span>
              )}
              {row.total}
            </span>
            <span
              className="col-span-2 mt-1 block h-1.5 rounded-full bg-secondary"
              aria-hidden
            >
              <span
                className="block h-full rounded-full bg-muted-foreground/50"
                style={{ width: `${widthPercent}%` }}
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${readPercent}%` }}
                />
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
