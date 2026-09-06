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
import { capitalize, periodRank } from "./books-helpers";

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
      <span className="inline-flex items-center gap-2">
        <Link
          href={`/livres/${row.original.id}`}
          className="font-medium hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {row.original.title}
        </Link>
        {row.original.enriched && (
          <Badge variant="secondary">Ajout Claude</Badge>
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
        className="hover:underline"
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
    header: "Année de publication",
    sortingFn: yearSort,
    cell: ({ getValue }) => formatYear(getValue() as number | null) || "—",
  },
  {
    id: "originalLanguage",
    accessorFn: (row) => row.originalLanguage,
    header: "Langue originale",
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
    cell: ({ row }) =>
      row.original.roadmaps.length === 0 ? (
        "—"
      ) : (
        <span className="inline-flex flex-wrap items-center gap-1">
          {row.original.roadmaps.map((r) => (
            <Badge key={r.slug} variant="outline" asChild>
              {/* stopPropagation : la ligne entière ouvre la fiche livre */}
              <Link
                href={`/parcours/${r.slug}`}
                onClick={(e) => e.stopPropagation()}
                title={`Parcours « ${r.title} » — ce livre y est le n°${r.position}`}
              >
                {r.title}
              </Link>
            </Badge>
          ))}
        </span>
      ),
  },
];

// ---------------------------------------------------------------------------
// Vue tableau
// ---------------------------------------------------------------------------

export function BooksTable({
  books,
  sorting,
  onSortingChange,
}: {
  books: BookWithRoadmaps[];
  sorting: SortingState;
  onSortingChange: React.Dispatch<React.SetStateAction<SortingState>>;
}) {
  const router = useRouter();

  const table = useReactTable({
    data: books,
    columns,
    state: { sorting },
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

  return (
    // Le conteneur remplit la hauteur disponible : les deux barres de défilement
    // (verticale et horizontale) restent à l'intérieur du cadre du tableau.
    <Table containerClassName="h-full overflow-y-auto rounded-md border">
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
                <TableHead key={header.id}>
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
              colSpan={columns.length}
              className="h-24 text-center text-muted-foreground"
            >
              Aucun livre ne correspond aux critères.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              className="cursor-pointer"
              onClick={() => router.push(`/livres/${row.original.id}`)}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
