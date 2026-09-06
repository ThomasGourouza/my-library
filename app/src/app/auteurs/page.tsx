import { AuthorsView } from "@/components/authors/authors-view";
import { getAuthorFilterOptions, listAuthors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auteurs" };

export default function AuteursPage() {
  const authors = listAuthors();
  const options = getAuthorFilterOptions();

  return <AuthorsView authors={authors} options={options} />;
}
