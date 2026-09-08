import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { getDashboard } from "@/lib/dashboard";
import { PRIORITY_DESCRIPTIONS, PRIORITY_LABELS } from "@/lib/priorities/types";
import { FAMILY_LABELS } from "@/lib/roadmaps/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BreakdownBars } from "@/components/dashboard/breakdown-bars";
import { StatTile } from "@/components/dashboard/stat-tile";
import { RoadmapProgress } from "@/components/roadmaps/roadmap-progress";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vue d'ensemble" };

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

export default async function AccueilPage() {
  const d = await getDashboard();
  const readPercent = percent(d.totals.read, d.totals.books);
  const suggestions = d.inProgress.length > 0 ? d.inProgress : d.toStart;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Vue d’ensemble</h1>
        <p className="text-sm text-muted-foreground">
          Où en est la bibliothèque, et par quoi continuer.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Livres"
          value={d.totals.books}
          hint={`${d.totals.authors} auteurs`}
          href="/livres"
        />
        <StatTile
          label="Lus"
          value={d.totals.read}
          // Le pourcentage n'est affiché qu'au-dessus de 1 % : « 0 % » pour
          // six livres lus est plus trompeur qu'informatif.
          hint={
            d.totals.read === 0
              ? "Cochez « Lu » sur une fiche pour commencer"
              : `sur ${d.totals.books} livres${
                  readPercent >= 1 ? ` · ${readPercent} %` : ""
                }`
          }
          href="/livres?read=lu"
        />
        <StatTile
          label="Parcours"
          value={d.totals.roadmaps}
          hint={`${d.totals.roadmapEntries} entrées de lecture`}
          href="/parcours"
        />
        <StatTile
          label="Hors parcours"
          value={d.totals.withoutRoadmap}
          hint="Livres qu’aucun parcours ne cite"
          href="/livres?roadmap=__aucun__"
        />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Par priorité de lecture</h2>
            <p className="text-sm text-muted-foreground">
              L’échelle est celle de la culture générale, pas celle des
              disciplines.
            </p>
          </div>
          <ul className="space-y-3">
            {d.byPriority.map((row) => (
              <li key={row.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Link
                    href={`/livres?priority=${row.key}`}
                    title={PRIORITY_DESCRIPTIONS[row.key]}
                    className="text-sm font-medium hover:underline"
                  >
                    {PRIORITY_LABELS[row.key]}
                  </Link>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {row.read} lu{row.read > 1 ? "s" : ""} sur {row.total}
                  </span>
                </div>
                <RoadmapProgress
                  read={row.read}
                  total={row.total}
                  showLabel={false}
                />
              </li>
            ))}
          </ul>
          {d.withoutPriority > 0 && (
            <p className="text-xs text-muted-foreground">
              {d.withoutPriority} livre(s) sans priorité — le test de couverture
              devrait les signaler.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Par catégorie</h2>
            <p className="text-sm text-muted-foreground">
              Longueur de barre = effectif ; la portion foncée est ce qui est lu.
            </p>
          </div>
          <BreakdownBars
            rows={d.byCategory.map((row) => ({
              label: row.key,
              total: row.total,
              read: row.read,
              href: `/livres?category=${encodeURIComponent(row.key)}`,
            }))}
          />
        </section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">
              {d.inProgress.length > 0
                ? "Parcours en cours"
                : "Par où commencer"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {d.inProgress.length > 0
                ? "Les parcours entamés, le plus avancé d’abord."
                : "Les parcours les plus courts : un chemin qu’on peut finir."}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/parcours">
              Tous les parcours
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {suggestions.map((r) => (
            <li key={r.slug} className="h-full">
              <div className="relative flex h-full flex-col gap-2 rounded-lg border p-4 transition-colors hover:bg-muted/40">
                <Link
                  href={`/parcours/${r.slug}`}
                  className="font-medium after:absolute after:inset-0 hover:underline"
                >
                  {r.title}
                </Link>
                <p className="text-sm text-muted-foreground">{r.goal}</p>
                <div className="mt-auto space-y-2 pt-1">
                  <Badge variant="outline">{FAMILY_LABELS[r.family]}</Badge>
                  <RoadmapProgress read={r.readCount} total={r.bookCount} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Essentiels à lire</h2>
            <p className="text-sm text-muted-foreground">
              Les livres du premier rang qui restent à lire, les plus cités par
              les parcours d’abord.
            </p>
          </div>
          {d.nextEssentials.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Tous les essentiels sont lus.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {d.nextEssentials.map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <span className="min-w-0">
                    <Link
                      href={`/livres/${b.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {b.title}
                    </Link>
                    <span className="text-sm text-muted-foreground"> · </span>
                    <Link
                      href={`/auteurs/${b.authorId}`}
                      className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {b.authorName}
                    </Link>
                  </span>
                  {b.roadmapCount > 0 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {b.roadmapCount} parcours
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Analyses Claude</h2>
            <p className="text-sm text-muted-foreground">
              {d.totals.analysed} livre{d.totals.analysed > 1 ? "s" : ""} sur{" "}
              {d.totals.books} en portent une. Elle se lance depuis la fiche
              d’un livre.
            </p>
          </div>
          {d.analysed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune analyse pour l’instant.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {d.analysed.slice(0, 8).map((b) => (
                <li
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  <Link
                    href={`/livres/${b.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {b.title}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Sparkles className="size-3.5" aria-hidden />
                    {b.authorName}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
