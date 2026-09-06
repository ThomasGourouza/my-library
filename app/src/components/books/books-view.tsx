"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";
import type { getFilterOptions } from "@/lib/queries";
import type { BookWithRoadmaps } from "@/lib/roadmaps/queries";
import { normalizeKey } from "@/lib/normalize";
import {
  PRIORITIES,
  PRIORITY_LABELS,
  type Priority,
} from "@/lib/priorities/types";
import { AUDIENCES, CATEGORIES, PERIODS } from "@/lib/validation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BooksTable } from "./books-table";
import { BooksGrouped } from "./books-grouped";
import {
  EMPTY_FILTERS,
  FILTER_KEYS,
  FILTER_LABELS,
  capitalize,
  isGroupByKey,
  isSortableColumn,
  isViewMode,
  type Filters,
  type FilterKey,
  type GroupByKey,
  type ViewMode,
} from "./books-helpers";

export type BookFilterOptions = ReturnType<typeof getFilterOptions>;

// ---------------------------------------------------------------------------
// Sérialisation URL
// ---------------------------------------------------------------------------

function parseFilters(sp: URLSearchParams): Filters {
  const get = (key: string): string[] => {
    const v = sp.get(key);
    return v ? v.split(",").filter(Boolean) : [];
  };
  return {
    category: get("category"),
    genre: get("genre"),
    period: get("period"),
    audience: get("audience"),
    courant: get("courant"),
    roadmap: get("roadmap"),
    priority: get("priority"),
    read: get("read"),
  };
}

function parseSorting(sp: URLSearchParams): SortingState {
  const raw = sp.get("sort");
  if (!raw) return [{ id: "title", desc: false }];
  const parsed = raw
    .split(",")
    .map((part) => {
      const [id, dir] = part.split(".");
      return { id, desc: dir === "desc" };
    })
    .filter((s) => isSortableColumn(s.id));
  return parsed.length ? parsed : [{ id: "title", desc: false }];
}

// ---------------------------------------------------------------------------
// Filter popover (multi-select), avec libellé d'affichage optionnel
// ---------------------------------------------------------------------------

function FilterPopover({
  label,
  options,
  selected,
  onToggle,
  getLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  getLabel?: (value: string) => string;
}) {
  const display = getLabel ?? ((v: string) => v);
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
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher…" />
          <CommandList>
            <CommandEmpty>Aucun résultat.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = selected.includes(option);
                return (
                  <CommandItem key={option} onSelect={() => onToggle(option)}>
                    <span
                      className={cn(
                        "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input [&_svg]:invisible"
                      )}
                    >
                      <Check className="size-3" />
                    </span>
                    {display(option)}
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
// Vue principale
// ---------------------------------------------------------------------------

export function BooksView({
  books,
  options,
}: {
  books: BookWithRoadmaps[];
  options: BookFilterOptions;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = React.useState<Filters>(() =>
    parseFilters(searchParams)
  );
  const [view, setView] = React.useState<ViewMode>(() => {
    const v = searchParams.get("view");
    return isViewMode(v) ? v : "table";
  });
  const [groupBy, setGroupBy] = React.useState<GroupByKey>(() => {
    const v = searchParams.get("groupBy");
    return isGroupByKey(v) ? v : "author";
  });
  const [sorting, setSorting] = React.useState<SortingState>(() =>
    parseSorting(searchParams)
  );

  // Garde l'URL synchronisée avec l'état (partageable, navigation retour/avant).
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    for (const key of FILTER_KEYS) {
      if (filters[key].length) params.set(key, filters[key].join(","));
    }
    if (view !== "table") params.set("view", view);
    if (view === "grouped" && groupBy !== "author") {
      params.set("groupBy", groupBy);
    }
    if (
      sorting.length &&
      !(sorting.length === 1 && sorting[0].id === "title" && !sorting[0].desc)
    ) {
      params.set(
        "sort",
        sorting.map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`).join(",")
      );
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [search, filters, view, groupBy, sorting, pathname, router]);

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

  const filtered = React.useMemo(() => {
    const searchKey = normalizeKey(search);
    const matches = (values: string[], value: string | null) =>
      values.length === 0 || (value != null && values.includes(value));
    // Un livre appartient à plusieurs parcours : le filtre teste l'intersection.
    const matchesAny = (values: string[], candidates: string[]) =>
      values.length === 0 || candidates.some((c) => values.includes(c));
    return books.filter(
      (b) =>
        (searchKey === "" ||
          b.titleNormalized.includes(searchKey) ||
          b.author.nameNormalized.includes(searchKey)) &&
        matches(filters.category, b.category) &&
        matches(filters.genre, b.genre) &&
        matches(filters.period, b.period) &&
        matches(filters.audience, b.audience) &&
        matches(filters.courant, b.courant) &&
        matches(filters.priority, b.priority) &&
        matches(filters.read, b.read ? "lu" : "non-lu") &&
        matchesAny(
          filters.roadmap,
          b.roadmaps.map((r) => r.slug)
        )
    );
  }, [books, search, filters]);

  // Parcours présents dans le corpus affiché : évite de passer une prop de plus
  // et n'expose au filtre que des parcours réellement peuplés.
  const roadmapOptions = React.useMemo(() => {
    const bySlug = new Map<string, string>();
    for (const book of books) {
      for (const r of book.roadmaps) bySlug.set(r.slug, r.title);
    }
    return [...bySlug]
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => a.title.localeCompare(b.title, "fr"));
  }, [books]);
  const roadmapTitles = React.useMemo(
    () => new Map(roadmapOptions.map((r) => [r.slug, r.title])),
    [roadmapOptions]
  );

  const filterConfigs: {
    key: FilterKey;
    options: string[];
    getLabel?: (v: string) => string;
  }[] = [
    {
      key: "read",
      options: ["lu", "non-lu"],
      getLabel: (v) => (v === "lu" ? "Lu" : "Non lu"),
    },
    {
      key: "priority",
      options: [...PRIORITIES],
      getLabel: (p) => PRIORITY_LABELS[p as Priority] ?? p,
    },
    { key: "category", options: [...CATEGORIES] },
    { key: "genre", options: options.genres },
    { key: "period", options: [...PERIODS] },
    { key: "audience", options: [...AUDIENCES], getLabel: capitalize },
    { key: "courant", options: options.courants },
    {
      key: "roadmap",
      options: roadmapOptions.map((r) => r.slug),
      getLabel: (slug) => roadmapTitles.get(slug) ?? slug,
    },
  ];

  const chipLabel = (key: FilterKey, value: string) => {
    const cfg = filterConfigs.find((c) => c.key === key);
    return cfg?.getLabel ? cfg.getLabel(value) : value;
  };

  return (
    // Colonne de hauteur définie (jusqu'au bas de l'écran) : la barre d'outils
    // garde sa taille, la vue (tableau ou groupes) occupe le reste et défile
    // en interne — la fenêtre elle-même ne défile pas.
    <div className="flex h-[var(--app-content-h)] min-h-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Livres</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} livre{filtered.length > 1 ? "s" : ""}
            {hasActiveFilters ? ` sur ${books.length}` : ""}
          </p>
        </div>
        <Button asChild>
          <Link href="/livres/nouveau">
            <Plus className="size-4" aria-hidden />
            Ajouter un livre
          </Link>
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un titre ou un auteur…"
          className="h-8 w-64"
          aria-label="Rechercher un titre ou un auteur"
        />
        {filterConfigs.map(({ key, options: opts, getLabel }) => (
          <FilterPopover
            key={key}
            label={FILTER_LABELS[key]}
            options={opts}
            selected={filters[key]}
            onToggle={(v) => toggleFilter(key, v)}
            getLabel={getLabel}
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
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {FILTER_KEYS.flatMap((key) =>
            filters[key].map((value) => (
              <Badge key={`${key}-${value}`} variant="secondary" asChild>
                <button
                  type="button"
                  onClick={() => toggleFilter(key, value)}
                  title={`Retirer le filtre ${FILTER_LABELS[key]} : ${chipLabel(key, value)}`}
                >
                  {FILTER_LABELS[key]} : {chipLabel(key, value)}
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            ))
          )}
        </div>
      )}

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as ViewMode)}
        className="min-h-0 flex-1"
      >
        <TabsList className="shrink-0">
          <TabsTrigger value="table">Tableau</TabsTrigger>
          <TabsTrigger value="grouped">Groupé</TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="mt-1 min-h-[12rem] min-w-0">
          <BooksTable
            books={filtered}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </TabsContent>
        <TabsContent value="grouped" className="mt-1 min-h-[12rem] min-w-0">
          <BooksGrouped
            books={filtered}
            groupBy={groupBy}
            onGroupByChange={setGroupBy}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
