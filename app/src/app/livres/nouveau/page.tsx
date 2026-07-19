import { listAuthors } from "@/lib/queries";
import { BookForm } from "@/components/books/book-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nouveau livre" };

export default function NouveauLivrePage() {
  const authors = listAuthors().map((a) => ({ id: a.id, name: a.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Nouveau livre</h1>
      <BookForm authors={authors} />
    </div>
  );
}
