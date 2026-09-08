import * as React from "react";
import { AuthorsView } from "@/components/authors/authors-view";
import { getAuthorFilterOptions, listAuthors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auteurs" };

export default async function AuteursPage() {
  const authors = await listAuthors();
  const options = await getAuthorFilterOptions();

  // useSearchParams doit être sous une frontière Suspense, comme sur /livres.
  return (
    <React.Suspense fallback={null}>
      <AuthorsView authors={authors} options={options} />
    </React.Suspense>
  );
}
