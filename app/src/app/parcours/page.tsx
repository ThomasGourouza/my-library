import * as React from "react";
import { listRoadmaps } from "@/lib/roadmaps/queries";
import { RoadmapsView } from "@/components/roadmaps/roadmaps-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Parcours" };

export default async function ParcoursPage() {
  const roadmaps = await listRoadmaps();

  return (
    <React.Suspense fallback={null}>
      <RoadmapsView roadmaps={roadmaps} />
    </React.Suspense>
  );
}
