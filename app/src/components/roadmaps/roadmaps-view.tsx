"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BookOpen, X } from "lucide-react";
import { normalizeKey } from "@/lib/normalize";
import type { RoadmapSummary } from "@/lib/roadmaps/queries";
import {
  FAMILY_LABELS,
  ROADMAP_FAMILIES,
  type RoadmapFamily,
} from "@/lib/roadmaps/types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

function isFamily(v: string | null): v is RoadmapFamily {
  return !!v && (ROADMAP_FAMILIES as readonly string[]).includes(v);
}

export function RoadmapsView({ roadmaps }: { roadmaps: RoadmapSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [search, setSearch] = React.useState(() => searchParams.get("q") ?? "");
  const [family, setFamily] = React.useState<RoadmapFamily | null>(() => {
    const v = searchParams.get("famille");
    return isFamily(v) ? v : null;
  });

  // URL synchronisée avec l'état : un parcours filtré reste partageable.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (family) params.set("famille", family);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [search, family, pathname, router]);

  const filtered = React.useMemo(() => {
    const key = normalizeKey(search);
    return roadmaps.filter(
      (r) =>
        (family === null || r.family === family) &&
        (key === "" ||
          normalizeKey(r.title).includes(key) ||
          normalizeKey(r.goal).includes(key) ||
          normalizeKey(r.description).includes(key))
    );
  }, [roadmaps, search, family]);

  // Familles présentes, dans l'ordre canonique, avec leur effectif.
  const families = React.useMemo(() => {
    const counts = new Map<RoadmapFamily, number>();
    for (const r of roadmaps) counts.set(r.family, (counts.get(r.family) ?? 0) + 1);
    return ROADMAP_FAMILIES.filter((f) => counts.has(f)).map((f) => ({
      family: f,
      count: counts.get(f)!,
    }));
  }, [roadmaps]);

  const totalBooks = filtered.reduce((n, r) => n + r.bookCount, 0);
  const hasFilters = search !== "" || family !== null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Parcours de lecture</h1>
        <p className="text-sm text-muted-foreground">
          {filtered.length} parcours
          {hasFilters ? ` sur ${roadmaps.length}` : ""} · {totalBooks} livres
          référencés
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un parcours…"
          className="h-8 w-64"
          aria-label="Rechercher un parcours"
        />
        {families.map(({ family: f, count }) => {
          const active = family === f;
          return (
            <Button
              key={f}
              variant={active ? "secondary" : "outline"}
              size="sm"
              className={cn("h-8 border-dashed", active && "border-solid")}
              aria-pressed={active}
              onClick={() => setFamily(active ? null : f)}
            >
              {FAMILY_LABELS[f]}
              <Badge variant="secondary" className="ml-1 px-1.5">
                {count}
              </Badge>
            </Button>
          );
        })}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => {
              setSearch("");
              setFamily(null);
            }}
          >
            Réinitialiser
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun parcours ne correspond à cette recherche.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((roadmap) => (
            <li key={roadmap.slug} className="h-full">
              <Card
                size="sm"
                // relative : requis par le lien étendu du titre ci-dessous
                className="relative h-full transition-colors hover:bg-muted/40"
              >
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={`/parcours/${roadmap.slug}`}
                      // La carte entière est cliquable via ce lien étendu.
                      className="after:absolute after:inset-0 hover:underline"
                    >
                      {roadmap.title}
                    </Link>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">{roadmap.goal}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">{roadmap.ageLabel}</Badge>
                    <Badge variant="outline">
                      {FAMILY_LABELS[roadmap.family]}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <BookOpen className="size-3.5" aria-hidden />
                      {roadmap.bookCount} livres
                    </span>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
