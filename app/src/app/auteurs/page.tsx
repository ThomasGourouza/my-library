import { listAuthors } from "@/lib/queries";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auteurs" };

export default function AuteursPage() {
  const rows = listAuthors();
  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Auteurs</h1>
      <p className="text-muted-foreground">
        {rows.length} auteur{rows.length > 1 ? "s" : ""} — interface en cours de
        construction.
      </p>
    </div>
  );
}
