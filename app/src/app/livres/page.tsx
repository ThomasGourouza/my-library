import * as React from "react";
import { listBooks, getFilterOptions } from "@/lib/queries";
import { BooksView } from "@/components/books/books-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Livres" };

export default function LivresPage() {
  const books = listBooks();
  const options = getFilterOptions();

  return (
    <React.Suspense fallback={null}>
      <BooksView books={books} options={options} />
    </React.Suspense>
  );
}
