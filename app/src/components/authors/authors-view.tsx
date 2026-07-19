"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Plus, X } from "lucide-react";
import type { AuthorWithCount } from "@/db/schema";
import { formatLifespan, normalizeKey } from "@/lib/normalize";
import { PERIODS } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FilterOptions {
  mainFields: string[];
  mainGenres: string[];
  nationalities: string[];
  languages: string[];
}

type FilterKey =
  | "mainField"
  | "mainGenre"
  | "period"
  | "nationality"
  | "language";

const FILTER_LABELS: Record<FilterKey, string> = {
  mainField: "Domaine",
  mainGenre: "Genre principal",
  period: "Période",
  nationality: "Nationalité",
  language: "Langue",
};

type Filters = Record<FilterKey, string[]>;

const EMPTY_FILTERS: Filters = {
  mainField: [],
  mainGenre: [],
  period: [],
  nationality: [],
  language: [],
};

type SortKey =
  | "name"
  | "dates"
  | "nationality"
  | "language"
  | "mainGenre"
  | "mainField"
  | "bookCount";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

// ---------------------------------------------------------------------------
// Filter popover (multi-select)
// ---------------------------------------------------------------------------

function FilterPopover({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 border-dashed">
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Rechercher…`} />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <CommandItem key={option} onSelect={() => onToggle(option)}>
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-[4px] border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input [&_svg]:invisible"
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    {option}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Sortable header cell
// ---------------------------------------------------------------------------

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active && "text-foreground"
        )}
      >
        {label}
        <Icon className="size-3.5" aria-hidden />
      </button>
    </TableHead>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------

export function AuthorsView({
  authors,
  options,
}: {
  authors: AuthorWithCount[];
  options: FilterOptions;
}) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [filters, setFilters] = React.useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = React.useState<SortState>({
    key: "name",
    dir: "asc",
  });

  const toggleFilter = (key: FilterKey, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));
  };

  const hasActiveFilters =
    search !== "" || Object.values(filters).some((v) => v.length > 0);

  const resetFilters = () => {
    setSearch("");
    setFilters(EMPTY_FILTERS);
  };

  const onSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  };

  const filtered = React.useMemo(() => {
    const searchKey = normalizeKey(search);
    const matches = (values: string[], value: string | null) =>
      values.length === 0 || (value != null && values.includes(value));
    return authors.filter(
      (a) =>
        (searchKey === "" || a.nameNormalized.includes(searchKey)) &&
        matches(filters.mainField, a.mainField) &&
        matches(filters.mainGenre, a.mainGenre) &&
        matches(filters.period, a.period) &&
        matches(filters.nationality, a.nationality) &&
        matches(filters.language, a.language)
    );
  }, [authors, search, filters]);

  const sorted = React.useMemo(() => {
    const cmpText = (x: string | null, y: string | null) => {
      if (x == null && y == null) return 0;
      if (x == null) return 1; // valeurs vides en dernier
      if (y == null) return -1;
      return x.localeCompare(y, "fr");
    };
    const cmpNum = (x: number | null, y: number | null) => {
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return x - y;
    };
    const rows = [...filtered];
    rows.sort((a, b) => {
      let c: number;
      switch (sort.key) {
        case "name":
          c = a.nameNormalized.localeCompare(b.nameNormalized, "fr");
          break;
        case "dates":
          c = cmpNum(a.birthYear, b.birthYear);
          break;
        case "nationality":
          c = cmpText(a.nationality, b.nationality);
          break;
        case "language":
          c = cmpText(a.language, b.language);
          break;
        case "mainGenre":
          c = cmpText(a.mainGenre, b.mainGenre);
          break;
        case "mainField":
          c = cmpText(a.mainField, b.mainField);
          break;
        case "bookCount":
          c = a.bookCount - b.bookCount;
          break;
      }
      if (c === 0) c = a.nameNormalized.localeCompare(b.nameNormalized, "fr");
      return sort.dir === "desc" ? -c : c;
    });
    return rows;
  }, [filtered, sort]);

  const filterConfigs: { key: FilterKey; options: string[] }[] = [
    { key: "mainField", options: options.mainFields },
    { key: "mainGenre", options: options.mainGenres },
    { key: "period", options: [...PERIODS] },
    { key: "nationality", options: options.nationalities },
    { key: "language", options: options.languages },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Auteurs</h1>
          <p className="text-sm text-muted-foreground">
            {sorted.length} auteur{sorted.length > 1 ? "s" : ""}
            {hasActiveFilters ? ` sur ${authors.length}` : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/auteurs/nouveau">
            <Plus className="size-4" aria-hidden />
            Ajouter un auteur
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un auteur…"
          className="h-8 w-56"
          aria-label="Rechercher un auteur"
        />
        {filterConfigs.map(({ key, options: opts }) => (
          <FilterPopover
            key={key}
            label={FILTER_LABELS[key]}
            options={opts}
            selected={filters[key]}
            onToggle={(v) => toggleFilter(key, v)}
          />
        ))}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={resetFilters}
          >
            Réinitialiser
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {Object.values(filters).some((v) => v.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filterConfigs.flatMap(({ key }) =>
            filters[key].map((value) => (
              <Badge key={`${key}-${value}`} variant="secondary" asChild>
                <button
                  type="button"
                  onClick={() => toggleFilter(key, value)}
                  title={`Retirer le filtre ${FILTER_LABELS[key]} : ${value}`}
                >
                  {FILTER_LABELS[key]} : {value}
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            ))
          )}
        </div>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead label="Nom" sortKey="name" sort={sort} onSort={onSort} />
              <SortableHead label="Dates" sortKey="dates" sort={sort} onSort={onSort} />
              <SortableHead
                label="Nationalité"
                sortKey="nationality"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label="Langue"
                sortKey="language"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label="Genre principal"
                sortKey="mainGenre"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label="Domaine"
                sortKey="mainField"
                sort={sort}
                onSort={onSort}
              />
              <SortableHead
                label="Nb livres"
                sortKey="bookCount"
                sort={sort}
                onSort={onSort}
                className="text-right"
              />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="h-24 text-center text-muted-foreground"
                >
                  Aucun auteur ne correspond aux critères.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((author) => (
                <TableRow
                  key={author.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/auteurs/${author.id}`)}
                >
                  <TableCell className="font-medium">
                    <Link
                      href={`/auteurs/${author.id}`}
                      className="hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {author.name}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatLifespan(author.birthYear, author.deathYear) || "—"}
                  </TableCell>
                  <TableCell>{author.nationality ?? "—"}</TableCell>
                  <TableCell>{author.language ?? "—"}</TableCell>
                  <TableCell>{author.mainGenre ?? "—"}</TableCell>
                  <TableCell>{author.mainField ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {author.bookCount}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
