import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* Lien retour */}
      <Skeleton className="h-4 w-20" />

      {/* Titre, objectif, badges */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-80" />
        <Skeleton className="h-4 w-96" />
        <div className="flex gap-1.5">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-36" />
        </div>
      </div>

      {/* Description */}
      <div className="max-w-3xl space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* Ordre de lecture */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <div className="rounded-md border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 border-b px-3 py-3 last:border-b-0">
              <Skeleton className="mt-0.5 h-4 w-6 shrink-0" />
              <div className="w-full space-y-1.5">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-5 w-40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
