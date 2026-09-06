"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingFn,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatYear } from "@/lib/normalize";
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import { priorityRank } from "@/lib/priorities/types";
import { PriorityBadge } from "./priority-badge";
import { ReadCheckbox } from "./read-checkbox";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { COLUMN_IDS, capitalize, periodRank, type ColumnId } from "./books-helpers";

// ---------------------------------------------------------------------------
// Tri texte "fr", valeurs nulles en dernier
// ---------------------------------------------------------------------------

const textSort: SortingFn<BookWithRoadmaps> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<string | null>(columnId);
  const b = rowB.getValue<string | null>(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b, "fr");
};

/** Tri chronologique des périodes (chiffres romains → index de l'enum). */
const periodSort: SortingFn<BookWithRoadmaps> = (rowA, rowB) =>
  periodRank(rowA.original.period) - periodRank(rowB.original.period);

/** Tri par rang de priorité (Essentiel d'abord), livres non jugés en dernier. */
const prioritySort: SortingFn<BookWithRoadmaps> = (rowA, rowB) =>
  priorityRank(rowA.original.priority) - priorityRank(rowB.original.priority);

/** Tri numérique des années (négatives = av. J.-C.), valeurs nulles en dernier. */
const yearSort: SortingFn<BookWithRoadmaps> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<number | null>(columnId);
  const b = rowB.getValue<number | null>(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
};

// ---------------------------------------------------------------------------
// Colonnes
// ---------------------------------------------------------------------------

/** Parcours affichés en toutes lettres dans la cellule ; au-delà, un « +N ». */
const MAX_ROADMAP_BADGES = 2;

const columns: ColumnDef<BookWithRoadmaps>[] = [
  {
    id: "read",
    accessorFn: (row) => row.read,
    header: "Lu",
    // Tri booléen : premier clic (croissant) = les non lus d'abord, qui sont
    // ce qu'on cherche quand on trie sur cette colonne.
    sortingFn: (rowA, rowB) =>
      Number(rowA.original.read) - Number(rowB.original.read),
    cell: ({ row }) => (
      // La ligne entière ouvre la fiche : la case ne doit pas la déclencher.
      <span
        className="inline-flex"
        onClick={(e) => e.stopPropagation()}
        role="presentation"
      >
        <ReadCheckbox
          bookId={row.original.id}
          read={row.original.read}
          title={row.original.title}
        />
      </span>
    ),
  },
  {
    id: "title",
    accessorFn: (row) => row.titleNormalized,
    header: "Titre",
    sortingFn: textSort,
    cell: ({ row }) => (
      // Largeur bornée : sans cela un seul titre à rallonge (« 1001 Classical
      // Recordings You Must Hear Before You Die ») élargit toute la colonne et
      // pousse les dernières colonnes hors de l'écran. Le titre entier reste
      // lisible en infobulle et sur la fiche.
      <span className="flex max-w-[22rem] items-center gap-2">
        <Link
          href={`/livres/${row.original.id}`}
          className="truncate font-medium hover:underline"
          title={row.original.title}
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.title}
        </Link>
        {row.original.enriched && (
          <Badge variant="secondary" className="shrink-0">
            Ajout Claude
          </Badge>
        )}
      </span>
    ),
  },
  {
    id: "author",
    accessorFn: (row) => row.author.nameNormalized,
    header: "Auteur",
    sortingFn: textSort,
    cell: ({ row }) => (
      <Link
        href={`/auteurs/${row.original.author.id}`}
        className="block max-w-[13rem] truncate hover:underline"
        title={row.original.author.name}
        onClick={(e) => e.stopPropagation()}
      >
        {row.original.author.name}
      </Link>
    ),
  },
  {
    id: "priority",
    accessorFn: (row) => row.priority,
    header: "Priorité",
    sortingFn: prioritySort,
    cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
  },
  {
    id: "category",
    accessorFn: (row) => row.category,
    header: "Catégorie",
    sortingFn: textSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "genre",
    accessorFn: (row) => row.genre,
    header: "Genre",
    sortingFn: textSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "courant",
    accessorFn: (row) => row.courant,
    header: "Courant",
    sortingFn: textSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "theme",
    accessorFn: (row) => row.theme,
    header: "Thème",
    sortingFn: textSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "period",
    accessorFn: (row) => row.period,
    header: "Période",
    sortingFn: periodSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "publicationYear",
    accessorFn: (row) => row.publicationYear,
    // « Année de publication » prenait 154 px d'en-tête pour afficher 4 chiffres.
    header: "Année",
    sortingFn: yearSort,
    cell: ({ getValue }) => formatYear(getValue() as number | null) || "—",
  },
  {
    id: "originalLanguage",
    accessorFn: (row) => row.originalLanguage,
    header: "Langue",
    sortingFn: textSort,
    cell: ({ getValue }) => (getValue() as string | null) ?? "—",
  },
  {
    id: "audience",
    accessorFn: (row) => row.audience,
    header: "Public",
    sortingFn: textSort,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? capitalize(v) : "—";
    },
  },
  {
    id: "roadmaps",
    // Tri sur les titres concaténés : les livres sans parcours finissent en bas
    // (textSort place les valeurs nulles en dernier).
    accessorFn: (row) =>
      row.roadmaps.length ? row.roadmaps.map((r) => r.title).join(" · ") : null,
    header: "Parcours",
    sortingFn: textSort,
    cell: ({ row }) => {
      const all = row.original.roadmaps;
      if (all.length === 0) return "—";
      // Un livre appartient jusqu'à 6 parcours : les afficher tous étalait la
      // colonne sur 300 px et faisait déborder le tableau. Les deux premiers
      // suffisent à situer le livre ; le reste est dans l'infobulle du compteur
      // et en entier sur la fiche.
      const shown = all.slice(0, MAX_ROADMAP_BADGES);
      const rest = all.slice(MAX_ROADMAP_BADGES);
      return (
        <span className="flex max-w-[16rem] items-center gap-1">
          {shown.map((r) => (
            <Badge
              key={r.slug}
              variant="outline"
              className="min-w-0 shrink"
              asChild
            >
              {/* stopPropagation : la ligne entière ouvre la fiche livre */}
              <Link
                href={`/parcours/${r.slug}`}
                onClick={(e) => e.stopPropagation()}
                title={`Parcours « ${r.title} » — ce livre y est le n°${r.position}`}
              >
                <span className="truncate">{r.title}</span>
              </Link>
            </Badge>
          ))}
          {rest.length > 0 && (
            <Badge
              variant="secondary"
              className="shrink-0"
              title={rest.map((r) => r.title).join(" · ")}
            >
              +{rest.length}
            </Badge>
          )}
        </span>
      );
    },
  },
];

// ---------------------------------------------------------------------------
// Vue tableau
// ---------------------------------------------------------------------------

export function BooksTable({
  books,
  sorting,
  onSortingChange,
  hiddenColumns,
}: {
  books: BookWithRoadmaps[];
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
  hiddenColumns: readonly ColumnId[];
}) {
  const router = useRouter();

  // TanStack attend un dictionnaire « visible ? » ; l'état côté vue est la
  // liste des colonnes masquées, qui est ce qui s'écrit dans l'URL.
  const columnVisibility = React.useMemo(
    () =>
      Object.fromEntries(
        COLUMN_IDS.map((id) => [id, !hiddenColumns.includes(id)])
      ),
    [hiddenColumns]
  );

  // Le compilateur React saute ce composant : useReactTable() renvoie des
  // fonctions qu'il ne peut pas mémoriser sans risque d'affichage périmé. Ce
  // n'est pas un défaut à corriger — c'est le comportement voulu de la
  // bibliothèque — et le compilateur n'est de toute façon pas activé ici
  // (pas de `reactCompiler` dans next.config.ts).
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: books,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // Premier clic toujours croissant (valeurs nulles en dernier). Par défaut,
    // TanStack déduit le sens de la 1re ligne : une valeur nulle ou numérique
    // partait en décroissant, d'une colonne à l'autre de façon imprévisible.
    sortDescFirst: false,
    enableMultiSort: true,
    isMultiSortEvent: (e) => (e as { shiftKey?: boolean })?.shiftKey === true,
  });

  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleFlatColumns().length;

  // Virtualisation : seules les lignes visibles (plus une marge) existent dans
  // le DOM. Rendre les 2 038 d'un bloc coûtait environ deux secondes à chaque
  // frappe dans la barre de recherche, puisque le filtrage reconstruit la
  // liste. Deux lignes-tampons portent la hauteur du reste, pour que la barre
  // de défilement garde sa taille réelle.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // Hauteur d'une ligne : py-2 + une ligne de texte. Mesurée ensuite pour de
    // vrai, l'estimation ne sert qu'au premier rendu.
    estimateSize: () => 41,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  // Revenir en haut quand la liste change d'ordre ou de contenu : rester à la
  // ligne 800 après avoir filtré ou retrié montre une portion arbitraire.
  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [books, sorting]);

  return (
    // Le conteneur remplit la hauteur disponible : les deux barres de défilement
    // (verticale et horizontale) restent à l'intérieur du cadre du tableau.
    <Table
      containerRef={scrollRef}
      containerClassName="h-full overflow-y-auto rounded-md border"
    >
      {/* En-tête collant : le trait de séparation est une ombre interne, la
          bordure du <tr> disparaîtrait au défilement (border-collapse). */}
      <TableHeader className="sticky top-0 z-10 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              const sortState = header.column.getIsSorted();
              const sortIndex = header.column.getSortIndex();
              const Icon =
                sortState === "asc"
                  ? ArrowUp
                  : sortState === "desc"
                    ? ArrowDown
                    : ArrowUpDown;
              return (
                <TableHead
                  key={header.id}
                  // Annonce l'état de tri aux lecteurs d'écran : l'icône seule
                  // ne dit rien, et elle est en aria-hidden.
                  aria-sort={
                    sortState === "asc"
                      ? "ascending"
                      : sortState === "desc"
                        ? "descending"
                        : "none"
                  }
                >
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        sortState && "text-foreground"
                      )}
                      title="Astuce : Maj+clic pour trier sur plusieurs colonnes"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      <Icon className="size-3.5" aria-hidden />
                      {sortState && sorting.length > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          {sortIndex + 1}
                        </span>
                      )}
                    </button>
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columnCount}
              className="h-24 text-center text-muted-foreground"
            >
              Aucun livre ne correspond aux critères.
            </TableCell>
          </TableRow>
        ) : (
          <>
            {paddingTop > 0 && (
              <tr aria-hidden>
                <td colSpan={columnCount} style={{ height: paddingTop }} />
              </tr>
            )}
            {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              return (
                <TableRow
                  key={row.id}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  className="cursor-pointer"
                  onClick={() => router.push(`/livres/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {paddingBottom > 0 && (
              <tr aria-hidden>
                <td colSpan={columnCount} style={{ height: paddingBottom }} />
              </tr>
            )}
          </>
        )}
      </TableBody>
    </Table>
  );
}
