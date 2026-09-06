import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { Pencil, Plus } from "lucide-react";
import type { Metadata } from "next";
import { getAuthor } from "@/lib/queries";
import { formatLifespan } from "@/lib/normalize";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthorActions } from "@/components/authors/author-actions";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const id = parseId((await params).id);
  const author = id != null ? getAuthor(id) : undefined;
  return { title: author ? author.name : "Auteur introuvable" };
}

export default async function AuthorPage({ params }: PageProps) {
  const id = parseId((await params).id);
  if (id == null) notFound();

  const author = getAuthor(id);
  if (!author) notFound();

  const lifespan = formatLifespan(author.birthYear, author.deathYear);

  const identityRows = (
    [
      { label: "Nationalité", value: author.nationality },
      { label: "Langue", value: author.language },
      { label: "Genre principal", value: author.mainGenre },
      { label: "Domaine", value: author.mainField },
      { label: "Période", value: author.period },
      { label: "Notes", value: author.notes },
    ] satisfies { label: string; value: string | null }[]
  ).filter(
    (row): row is { label: string; value: string } => row.value != null && row.value !== ""
  );

  return (
    <div className="space-y-6">
      <Link
        href="/auteurs"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Auteurs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{author.name}</h1>
          {lifespan && (
            <p className="text-sm text-muted-foreground">{lifespan}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/auteurs/${author.id}/modifier`}>
              <Pencil className="size-4" aria-hidden />
              Modifier
            </Link>
          </Button>
          <AuthorActions authorId={author.id} authorName={author.name} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardContent>
          {identityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune information complémentaire.
            </p>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
              {identityRows.map((row) => (
                <div
                  key={row.label}
                  className={row.label === "Notes" ? "sm:col-span-2" : undefined}
                >
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="text-sm whitespace-pre-wrap">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </CardContent>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Biographie</h2>
        {author.bio ? (
          <div className="space-y-1.5">
            <div className="max-w-none text-sm leading-relaxed [&_h1]:mt-4 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown>{author.bio}</Markdown>
            </div>
            {author.bioGeneratedAt && (
              <p className="text-xs text-muted-foreground">
                Générée par Claude le {formatDateFr(author.bioGeneratedAt)}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune biographie.{" "}
            {author.books.length > 0 ? (
              <>
                Lancez « Analyse Claude » depuis{" "}
                {/* Lien direct plutôt qu'une consigne : la phrase demandait de
                    retrouver soi-même un livre de l'auteur. */}
                <Link
                  href={`/livres/${author.books[0].id}`}
                  className="font-medium text-foreground hover:underline"
                >
                  « {author.books[0].title} »
                </Link>{" "}
                pour la générer — elle est produite une fois par auteur, avec la
                première analyse d&apos;un de ses livres.
              </>
            ) : (
              <>
                Elle se génère avec l&apos;« Analyse Claude » d&apos;un livre de
                cet auteur, et il n&apos;en a encore aucun.
              </>
            )}
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Livres de cet auteur ({author.books.length})
        </h2>
        {author.books.length === 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Aucun livre.</p>
            <Button asChild size="sm">
              <Link href="/livres/nouveau">
                <Plus className="size-4" aria-hidden />
                Ajouter un livre
              </Link>
            </Button>
          </div>
        ) : (
          <ul className="divide-y rounded-md border">
            {author.books.map((book) => (
              <li
                key={book.id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <Link
                  href={`/livres/${book.id}`}
                  className="text-sm font-medium hover:underline"
                >
                  {book.title}
                </Link>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{book.category}</Badge>
                  {book.period && <Badge variant="outline">{book.period}</Badge>}
                  {book.enriched && (
                    <Badge variant="outline">Ajout Claude</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
