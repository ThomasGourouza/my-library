"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import { formatYear } from "@/lib/normalize";
import { PriorityBadge } from "./priority-badge";
import { ReadCheckbox } from "./read-checkbox";
import { sortBooks, type SortableColumn } from "./books-helpers";

/**
 * La liste des livres sur mobile, à la place de la table.
 *
 * Treize colonnes ne tiennent pas sur 390 px, et les réduire donnerait une
 * table de bureau rétrécie. Ici chaque livre est une ligne tapable qui mène à
 * sa fiche — laquelle porte déjà tous les champs. Ne restent que le titre,
 * l'auteur et de quoi se repérer : priorité et période.
 *
 * Virtualisée comme la table : 2 038 lignes montées d'un coup saccadent le
 * défilement sur un téléphone bien plus vite que sur un portable.
 */

/** Hauteur estimée d'une ligne : deux lignes de texte, une de badges, plus le
 *  rembourrage. Mesurée ensuite par le virtualiseur, cette valeur ne sert qu'à
 *  dimensionner la barre de défilement avant mesure. */
const ROW_ESTIMATE = 76;

export function BooksList({
  books,
  sort,
  desc,
}: {
  books: BookWithRoadmaps[];
  sort: SortableColumn;
  desc: boolean;
}) {
  const rows = React.useMemo(
    () => sortBooks(books, sort, desc),
    [books, sort, desc]
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  // Même exception que dans books-table.tsx : useVirtualizer() renvoie des
  // fonctions que le compilateur React ne peut pas mémoriser sans risque
  // d'affichage périmé. C'est le comportement voulu de la bibliothèque, et le
  // compilateur n'est pas activé ici de toute façon.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 8,
  });

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto overscroll-contain rounded-md border"
    >
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          Aucun livre ne correspond aux critères.
        </p>
      ) : (
        <ul
          className="relative w-full"
          style={{ height: virtualizer.getTotalSize() }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const b = rows[virtualRow.index];
            return (
              <li
                key={b.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute inset-x-0 top-0 border-b last:border-b-0"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="flex items-start gap-1">
                  {/* Cible de 44 px : la case doit être atteignable au pouce
                      sans ouvrir la fiche par erreur. Hors du lien, donc pas
                      de propagation à intercepter. */}
                  <span className="flex size-11 shrink-0 items-center justify-center">
                    <ReadCheckbox
                      bookId={b.id}
                      read={b.read}
                      title={b.title}
                    />
                  </span>
                  <Link
                    href={`/livres/${b.id}`}
                    className="flex min-w-0 flex-1 items-center gap-2 py-2.5 pr-2 active:bg-secondary/60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{b.title}</span>
                        {b.analysis != null && (
                          <Sparkles
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Analyse Claude disponible"
                          />
                        )}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {b.author.name}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        {b.priority && (
                          <PriorityBadge priority={b.priority} />
                        )}
                        {b.period && <span>{b.period}</span>}
                        {b.publicationYear != null && (
                          <span className="tabular-nums">
                            {formatYear(b.publicationYear)}
                          </span>
                        )}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
