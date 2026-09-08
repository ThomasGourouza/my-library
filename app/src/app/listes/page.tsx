import { listLists } from "@/lib/lists";
import { ListsView } from "@/components/lists/lists-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mes listes" };

export default async function ListesPage() {
  // Sorti du JSX : un appel de données en ligne n'est pas `await`-able là où il
  // était.
  const lists = await listLists();
  return <ListsView lists={lists} />;
}
