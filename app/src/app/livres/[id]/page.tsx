import Link from "next/link";
import { notFound } from "next/navigation";
import { getBook } from "@/lib/queries";
import { formatLifespan, formatYear } from "@/lib/normalize";
import { WORLDVIEW_LABELS, type Worldview } from "@/lib/validation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookActions } from "@/components/books/book-actions";
import { AnalysisPanel } from "@/components/books/analysis-panel";

export const dynamic = "force-dynamic";

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export default async function LivreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const book = getBook(id);
  if (!book) notFound();

  const lifespan = formatLifespan(book.author.birthYear, book.author.deathYear);
  const year = formatYear(book.publicationYear);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/livres"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Livres
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{book.title}</h1>
          <p className="text-sm text-muted-foreground">
            par{" "}
            <Link
              href={`/auteurs/${book.author.id}`}
              className="font-medium text-foreground hover:underline"
            >
              {book.author.name}
            </Link>
            {lifespan && <> ({lifespan})</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link href={`/livres/${book.id}/modifier`}>Modifier</Link>
          </Button>
          <BookActions bookId={book.id} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary">{book.category}</Badge>
        {book.genre && <Badge variant="secondary">{book.genre}</Badge>}
        {book.courant && <Badge variant="secondary">{book.courant}</Badge>}
        {book.period && <Badge variant="secondary">{book.period}</Badge>}
        <Badge variant="secondary">{capitalize(book.audience)}</Badge>
        {book.worldview && (
          <Badge variant="secondary">
            {WORLDVIEW_LABELS[book.worldview as Worldview] ?? book.worldview}
          </Badge>
        )}
        {year && <Badge variant="secondary">{year}</Badge>}
        {book.enriched && <Badge variant="outline">Ajout Claude</Badge>}
      </div>

      {book.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
            {book.notes}
          </CardContent>
        </Card>
      )}

      <AnalysisPanel book={book} />
    </div>
  );
}
