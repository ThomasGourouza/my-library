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
import type { BookWithAuthor } from "@/db/schema";
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
import { capitalize, worldviewShortLabel } from "./books-helpers";

// ---------------------------------------------------------------------------
// Tri texte "fr", valeurs nulles en dernier
// ---------------------------------------------------------------------------

const textSort: SortingFn<BookWithAuthor> = (rowA, rowB, columnId) => {
  const a = rowA.getValue<string | null>(columnId);
  const b = rowB.getValue<string | null>(columnId);
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a.localeCompare(b, "fr");
};

// ---------------------------------------------------------------------------
// Colonnes
// ---------------------------------------------------------------------------

const columns: ColumnDef<BookWithAuthor>[] = [
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
    id: "period",
    accessorFn: (row) => row.period,
    header: "Période",
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
    id: "worldview",
    accessorFn: (row) => row.worldview,
    header: "Vision du monde",
    sortingFn: textSort,
    cell: ({ getValue }) => {
      const v = getValue() as string | null;
      return v ? <Badge variant="outline">{worldviewShortLabel(v)}</Badge> : "—";
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
}: {
  books: BookWithAuthor[];
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
    enableMultiSort: true,
    isMultiSortEvent: (e) => (e as { shiftKey?: boolean })?.shiftKey === true,
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
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
                Aucun livre ne correspond aux critères
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
    </div>
  );
}
