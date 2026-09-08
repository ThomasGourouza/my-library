"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { AuthorWithCount } from "@/lib/types";
import { formatLifespan } from "@/lib/normalize";

/**
 * La liste des auteurs sur mobile, à la place de la table de dix colonnes.
 *
 * Même parti que pour les livres : une ligne tapable qui mène à la fiche, où
 * tous les champs sont déjà présents. Le tri vient de la vue, qui le calcule
 * de toute façon pour la table — rien à recalculer ici.
 */

/** Deux lignes de texte et du rembourrage ; mesurée ensuite par le
 *  virtualiseur. */
const ROW_ESTIMATE = 64;

export function AuthorsList({ authors }: { authors: AuthorWithCount[] }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  // Même exception que dans authors-view.tsx : useVirtualizer() renvoie des
  // fonctions que le compilateur React ne peut pas mémoriser sans risque
  // d'affichage périmé.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: authors.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
  });

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain rounded-md border"
    >
      {authors.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Aucun auteur ne correspond aux critères.
        </p>
      ) : (
        <ul
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const a = authors[virtualRow.index];
            const lifespan = formatLifespan(a.birthYear, a.deathYear);
            // Ce qui situe un auteur d'un coup d'œil, sans surcharger la ligne.
            const meta = [lifespan, a.nationality].filter(Boolean).join(" · ");
            return (
              <li
                key={a.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0 border-b last:border-b-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <Link
                  href={`/auteurs/${a.id}`}
                  // min-h-11 : la ligne reste une cible de 44 px même quand
                  // l'auteur n'a ni dates ni nationalité.
                  className="flex min-h-11 items-center gap-2 px-3 py-2.5 active:bg-secondary/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    {meta && (
                      <span className="block truncate text-sm text-muted-foreground">
                        {meta}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {a.bookCount}
                    <span className="sr-only">
                      {" "}
                      livre{a.bookCount > 1 ? "s" : ""}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
