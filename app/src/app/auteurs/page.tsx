import { AuthorsView } from "@/components/authors/authors-view";
import { getFilterOptions, listAuthors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auteurs" };

export default function AuteursPage() {
  const authors = listAuthors();
  const options = getFilterOptions();

  return (
    <AuthorsView
      authors={authors}
      options={{
        mainFields: options.mainFields,
        mainGenres: options.mainGenres,
        nationalities: options.nationalities,
        languages: options.languages,
      }}
    />
  );
}
