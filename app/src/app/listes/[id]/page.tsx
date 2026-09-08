import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getList } from "@/lib/lists";
import { priorityIndex, priorityOf } from "@/lib/priorities/resolve";
import type { Priority } from "@/lib/priorities/types";
import { ListDetail } from "@/components/lists/list-detail";

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
  const list = id != null ? await getList(id) : undefined;
  return { title: list ? list.name : "Liste introuvable" };
}

export default async function ListeDetailPage({ params }: PageProps) {
  const id = parseId((await params).id);
  if (id == null) notFound();

  const list = await getList(id);
  if (!list) notFound();

  // Les priorités viennent de fichiers versionnés, pas de la base : elles se
  // résolvent côté serveur, comme sur la page d'un parcours.
  const index = priorityIndex();
  const priorities: Record<number, Priority | null> = {};
  for (const item of list.items) {
    priorities[item.book.id] = priorityOf(item.book, index);
  }

  return <ListDetail list={list} priorities={priorities} />;
}
