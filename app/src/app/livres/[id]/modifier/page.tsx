import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBook, listAuthors } from "@/lib/queries";
import { BookForm } from "@/components/books/book-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const book = await getBook(Number(id));
  return { title: book ? `Modifier « ${book.title} »` : "Modifier" };
}

export default async function ModifierLivrePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const book = await getBook(id);
  if (!book) notFound();

  const authors = (await listAuthors()).map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Modifier « {book.title} »</h1>
      <BookForm authors={authors} book={book} />
    </div>
  );
}
