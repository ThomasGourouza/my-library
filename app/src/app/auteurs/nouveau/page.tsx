import { AuthorForm } from "@/components/authors/author-form";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nouvel auteur" };

export default function NouvelAuteurPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Nouvel auteur</h1>
      <AuthorForm />
    </div>
  );
}
