import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      {/* En-tête : titre + compte */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Barre d'outils : recherche + familles */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-48" />
      </div>

      {/* Grille de cartes */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl p-3 ring-1 ring-foreground/10">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
