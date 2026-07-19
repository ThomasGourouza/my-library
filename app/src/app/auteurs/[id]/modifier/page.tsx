import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAuthor } from "@/lib/queries";
import { AuthorForm } from "@/components/authors/author-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const id = parseId((await params).id);
  const author = id != null ? getAuthor(id) : undefined;
  return { title: author ? `Modifier ${author.name}` : "Auteur introuvable" };
}

export default async function ModifierAuteurPage({ params }: PageProps) {
  const id = parseId((await params).id);
  if (id == null) notFound();

  const author = getAuthor(id);
  if (!author) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Modifier {author.name}</h1>
      <AuthorForm author={author} />
    </div>
  );
}
