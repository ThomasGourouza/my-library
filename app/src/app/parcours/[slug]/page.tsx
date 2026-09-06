import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowRight, BookOpen } from "lucide-react";
import { formatYear } from "@/lib/normalize";
import { cn } from "@/lib/utils";
import { getRoadmapBySlug } from "@/lib/roadmaps/queries";
import { FAMILY_LABELS } from "@/lib/roadmaps/types";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/books/priority-badge";
import { ReadCheckbox } from "@/components/books/read-checkbox";
import { RoadmapProgress } from "@/components/roadmaps/roadmap-progress";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const roadmap = getRoadmapBySlug((await params).slug);
  return { title: roadmap ? roadmap.title : "Parcours introuvable" };
}

export default async function ParcoursDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const roadmap = getRoadmapBySlug(slug);
  if (!roadmap) notFound();

  const readCount = roadmap.items.filter((i) => i.book.read).length;
  // Le prochain livre est le premier non lu dans l'ordre de lecture : c'est
  // l'ordre qui fait le parcours, pas la liste des livres qu'il contient.
  const next = roadmap.items.find((i) => !i.book.read);

  return (
    <div className="space-y-6">
      <Link
        href="/parcours"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Parcours
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{roadmap.title}</h1>
        <p className="text-sm text-muted-foreground">{roadmap.goal}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{roadmap.ageLabel}</Badge>
          <Badge variant="outline">{FAMILY_LABELS[roadmap.family]}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <BookOpen className="size-3.5" aria-hidden />
            {roadmap.items.length} livres
          </span>
        </div>
      </div>

      {roadmap.items.length > 0 && (
        <div className="max-w-md space-y-2">
          <RoadmapProgress read={readCount} total={roadmap.items.length} />
          {next ? (
            <p className="text-sm">
              <span className="text-muted-foreground">Prochain à lire : </span>
              <Link
                href={`/livres/${next.book.id}`}
                className="font-medium hover:underline"
              >
                {next.position}. {next.book.title}
              </Link>
              <ArrowRight
                className="ml-1 inline size-3.5 text-muted-foreground"
                aria-hidden
              />
            </p>
          ) : (
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Parcours terminé.
            </p>
          )}
        </div>
      )}

      <p className="max-w-3xl text-sm leading-relaxed">{roadmap.description}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Ordre de lecture</h2>
        {roadmap.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun livre de la bibliothèque ne correspond encore à ce parcours.
          </p>
        ) : (
          <ol className="divide-y rounded-md border">
            {roadmap.items.map(({ position, book, note, priority }) => {
              const year = formatYear(book.publicationYear);
              return (
                <li
                  key={book.id}
                  className={cn(
                    "flex gap-3 px-3 py-3",
                    book.read && "bg-muted/40"
                  )}
                >
                  <span
                    className="mt-0.5 w-6 shrink-0 text-sm font-medium tabular-nums text-muted-foreground"
                    aria-hidden
                  >
                    {position}.
                  </span>
                  <span className="mt-0.5 shrink-0">
                    <ReadCheckbox
                      bookId={book.id}
                      read={book.read}
                      title={book.title}
                    />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <Link
                        href={`/livres/${book.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {book.title}
                      </Link>
                      <span className="text-sm text-muted-foreground">·</span>
                      <Link
                        href={`/auteurs/${book.author.id}`}
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                      >
                        {book.author.name}
                      </Link>
                      {year && (
                        <span className="text-xs text-muted-foreground">
                          ({year})
                        </span>
                      )}
                      {priority && <PriorityBadge priority={priority} />}
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {note}
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      <Badge variant="secondary">{book.category}</Badge>
                      {book.genre && (
                        <Badge variant="outline">{book.genre}</Badge>
                      )}
                      {book.period && (
                        <Badge variant="outline">{book.period}</Badge>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
