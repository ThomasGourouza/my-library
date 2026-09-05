import * as React from "react";
import { getFilterOptions } from "@/lib/queries";
import { listBooksWithRoadmaps } from "@/lib/roadmaps/queries";
import { BooksView } from "@/components/books/books-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Livres" };

export default function LivresPage() {
  const books = listBooksWithRoadmaps();
  const options = getFilterOptions();

  return (
    <React.Suspense fallback={null}>
      <BooksView books={books} options={options} />
    </React.Suspense>
  );
}
