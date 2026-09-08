"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Plus, X } from "lucide-react";
import type { AuthorWithCount } from "@/lib/types";
import type { AuthorFilterOptions } from "@/lib/queries";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatLifespan, formatYear, normalizeKey } from "@/lib/normalize";
import { PERIODS } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { ExportColumn } from "@/lib/export";
import { ExportMenu } from "@/components/export-menu";
import { FilterOptionList, FiltersSheet } from "@/components/filters-sheet";
import { AuthorsList } from "./authors-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const FILTER_KEYS: FilterKey[] = [
  "mainField",
  "mainGenre",
  "period",
  "nationality",
  "language",
];

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

const SORT_KEYS: SortKey[] = [
  "name",
  "dates",
  "nationality",
  "language",
  "mainGenre",
  "mainField",
  "bookCount",
];

const DEFAULT_SORT: SortState = { key: "name", dir: "asc" };

/** Colonnes du fichier exporté. */
const EXPORT_COLUMNS: ExportColumn<AuthorWithCount>[] = [
  { header: "Nom", value: (a) => a.name },
  { header: "Naissance", value: (a) => formatYear(a.birthYear) },
  { header: "Décès", value: (a) => formatYear(a.deathYear) },
  { header: "Nationalité", value: (a) => a.nationality },
  { header: "Langue", value: (a) => a.language },
  { header: "Genre principal", value: (a) => a.mainGenre },
  { header: "Domaine", value: (a) => a.mainField },
  { header: "Période", value: (a) => a.period },
  { header: "Nombre de livres", value: (a) => a.bookCount },
  { header: "Notes", value: (a) => a.notes },
];

// ---------------------------------------------------------------------------
// Sérialisation URL — même contrat que la page Livres : ce qu'on voit à
// l'écran est ce que l'URL décrit, et un rechargement ou un partage retrouve
// exactement la même liste.
// ---------------------------------------------------------------------------

function parseFilters(sp: URLSearchParams): Filters {
  const get = (key: FilterKey): string[] => {
    const v = sp.get(key);
    return v ? v.split(",").filter(Boolean) : [];
  };
  return {
    mainField: get("mainField"),
    mainGenre: get("mainGenre"),
    period: get("period"),
    nationality: get("nationality"),
    language: get("language"),
  };
}

function parseSort(sp: URLSearchParams): SortState {
  const raw = sp.get("sort");
  if (!raw) return DEFAULT_SORT;
  const [key, dir] = raw.split(".");
  if (!(SORT_KEYS as string[]).includes(key)) return DEFAULT_SORT;
  return { key: key as SortKey, dir: dir === "desc" ? "desc" : "asc" };
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
        {/* Liste partagée avec la page Livres et le panneau mobile. */}
        <FilterOptionList
          options={options}
          selected={selected}
          onToggle={onToggle}
        />
      </PopoverContent>
    </Popover>
  );
}

/** Libellés des clés de tri, pour le sélecteur mobile. */
const SORT_LABELS: Record<SortKey, string> = {
  name: "Nom",
  dates: "Dates",
  nationality: "Nationalité",
  language: "Langue",
  mainGenre: "Genre principal",
  mainField: "Domaine",
  bookCount: "Nombre de livres",
};

/** Le tri sur mobile : sans en-têtes de colonnes, il faut un contrôle à part.
 *  Même rôle que MobileSort sur la page Livres. */
function MobileSort({
  sort,
  onChange,
}: {
  sort: SortState;
  onChange: (next: SortState) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Select
        value={sort.key}
        onValueChange={(v) => onChange({ key: v as SortKey, dir: sort.dir })}
      >
        <SelectTrigger className="h-10" aria-label="Trier par">
          <ArrowDownUp className="size-4 shrink-0" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_KEYS.map((key) => (
            <SelectItem key={key} value={key}>
              {SORT_LABELS[key]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        size="icon"
        className="size-10 shrink-0"
        aria-label={
          sort.dir === "desc"
            ? "Tri décroissant, inverser"
            : "Tri croissant, inverser"
        }
        onClick={() =>
          onChange({ key: sort.key, dir: sort.dir === "desc" ? "asc" : "desc" })
        }
      >
        {sort.dir === "desc" ? (
          <ArrowDown className="size-4" aria-hidden />
        ) : (
          <ArrowUp className="size-4" aria-hidden />
        )}
      </Button>
    </div>
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
    <TableHead
      className={className}
      // L'icône de tri est en aria-hidden : sans aria-sort, l'état de tri
      // n'existe pas pour un lecteur d'écran.
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
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
  options: AuthorFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = React.useState<Filters>(() =>
    parseFilters(searchParams)
  );
  const [sort, setSort] = React.useState<SortState>(() =>
    parseSort(searchParams)
  );

  // history.replaceState et non router.replace : la page est en force-dynamic,
  // une navigation relancerait la requête et resérialiserait 1 069 auteurs à
  // chaque frappe. Next intègre l'API native au routeur, l'URL reste juste.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    for (const key of FILTER_KEYS) {
      if (filters[key].length) params.set(key, filters[key].join(","));
    }
    if (sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) {
      params.set("sort", `${sort.key}.${sort.dir}`);
    }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [search, filters, sort, pathname]);

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

  // Virtualisation : 1 069 lignes rendues d'un bloc, refaites à chaque frappe.
  // Même traitement que le tableau des livres.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Comme useReactTable dans books-table.tsx : useVirtualizer renvoie par
  // conception des fonctions non mémorisables, le compilateur React saute donc
  // ce composant. Ce n'est pas un défaut à corriger.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: sorted.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 41,
    overscan: 10,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [sorted]);

  return (
    // Même mise en page que la page Livres : la barre d'outils garde sa taille,
    // le tableau occupe le reste de l'écran et défile en interne, en-tête collant.
    <div
      data-wide
      className="flex h-[var(--app-content-h)] min-h-0 flex-col gap-4"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
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

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un auteur…"
          className="h-10 w-full md:h-8 md:w-56"
          aria-label="Rechercher un auteur"
        />

        {/* Bureau : un popover par filtre. */}
        <div className="hidden flex-wrap items-center gap-2 md:flex">
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

        {/* Mobile : panneau de filtres et sélecteur de tri. */}
        <div className="flex w-full items-center gap-2 md:hidden">
          <FiltersSheet
            groups={filterConfigs.map(({ key, options: opts }) => ({
              key,
              label: FILTER_LABELS[key],
              options: opts,
            }))}
            selected={filters}
            onToggle={toggleFilter}
            onReset={resetFilters}
            className="flex-1"
          />
          <MobileSort sort={sort} onChange={setSort} />
        </div>

        <div className="ml-auto">
          <ExportMenu
            rows={sorted}
            columns={EXPORT_COLUMNS}
            basename="ma-bibliotheque-auteurs"
            label="auteur"
            order="dans l’ordre affiché"
          />
        </div>
      </div>

      {Object.values(filters).some((v) => v.length > 0) && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
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

      {/* Deux rendus pour la même donnée triée : la table de dix colonnes
          au-delà de 768 px, une liste tapable en dessous. `sorted` est calculé
          une fois et sert aux deux, donc l'ordre ne dépend pas de la largeur. */}
      <div className="min-h-0 flex-1 md:hidden">
        <AuthorsList authors={sorted} />
      </div>
      <div className="hidden min-h-0 flex-1 md:block">
        <Table
          containerRef={scrollRef}
          containerClassName="h-full overflow-y-auto rounded-md border"
        >
          {/* En-tête collant : le trait de séparation est une ombre interne,
              la bordure du <tr> disparaîtrait au défilement. */}
          <TableHeader className="sticky top-0 z-10 [&_th]:bg-background [&_th]:shadow-[inset_0_-1px_0_var(--border)] [&_tr]:border-b-0">
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
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden>
                    <td colSpan={7} style={{ height: paddingTop }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => {
                  const author = sorted[virtualRow.index];
                  return (
                    <TableRow
                      key={author.id}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
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
                        {formatLifespan(author.birthYear, author.deathYear) ||
                          "—"}
                      </TableCell>
                      <TableCell>{author.nationality ?? "—"}</TableCell>
                      <TableCell>{author.language ?? "—"}</TableCell>
                      <TableCell>{author.mainGenre ?? "—"}</TableCell>
                      <TableCell>{author.mainField ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {author.bookCount}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr aria-hidden>
                    <td colSpan={7} style={{ height: paddingBottom }} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
