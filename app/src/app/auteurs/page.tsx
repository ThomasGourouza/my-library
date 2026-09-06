import * as React from "react";
import { AuthorsView } from "@/components/authors/authors-view";
import { getAuthorFilterOptions, listAuthors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auteurs" };

export default function AuteursPage() {
  const authors = listAuthors();
  const options = getAuthorFilterOptions();

  // useSearchParams doit être sous une frontière Suspense, comme sur /livres.
  return (
    <React.Suspense fallback={null}>
      <AuthorsView authors={authors} options={options} />
    </React.Suspense>
  );
}
