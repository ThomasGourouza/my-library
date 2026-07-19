"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, Plus, X } from "lucide-react";
import type { SortingState } from "@tanstack/react-table";
import type { BookWithAuthor } from "@/db/schema";
import type { getFilterOptions } from "@/lib/queries";
import { normalizeKey } from "@/lib/normalize";
import {
  AUDIENCES,
  CATEGORIES,
  PERIODS,
  WORLDVIEWS,
} from "@/lib/validation";
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
  worldviewFullLabel,
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
    worldview: get("worldview"),
    courant: get("courant"),
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
  books: BookWithAuthor[];
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
    return books.filter(
      (b) =>
        (searchKey === "" ||
          b.titleNormalized.includes(searchKey) ||
          b.author.nameNormalized.includes(searchKey)) &&
        matches(filters.category, b.category) &&
        matches(filters.genre, b.genre) &&
        matches(filters.period, b.period) &&
        matches(filters.audience, b.audience) &&
        matches(filters.worldview, b.worldview) &&
        matches(filters.courant, b.courant)
    );
  }, [books, search, filters]);

  const filterConfigs: {
    key: FilterKey;
    options: string[];
    getLabel?: (v: string) => string;
  }[] = [
    { key: "category", options: [...CATEGORIES] },
    { key: "genre", options: options.genres },
    { key: "period", options: [...PERIODS] },
    { key: "audience", options: [...AUDIENCES], getLabel: capitalize },
    {
      key: "worldview",
      options: [...WORLDVIEWS],
      getLabel: worldviewFullLabel,
    },
    { key: "courant", options: options.courants },
  ];

  const chipLabel = (key: FilterKey, value: string) => {
    const cfg = filterConfigs.find((c) => c.key === key);
    return cfg?.getLabel ? cfg.getLabel(value) : value;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
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

      <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-center gap-1.5">
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

      <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
        <TabsList>
          <TabsTrigger value="table">Tableau</TabsTrigger>
          <TabsTrigger value="grouped">Groupé</TabsTrigger>
        </TabsList>
        <TabsContent value="table" className="mt-3">
          <BooksTable
            books={filtered}
            sorting={sorting}
            onSortingChange={setSorting}
          />
        </TabsContent>
        <TabsContent value="grouped" className="mt-3">
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
