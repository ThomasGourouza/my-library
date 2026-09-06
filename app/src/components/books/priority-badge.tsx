import { Badge } from "@/components/ui/badge";
import {
  PRIORITY_DESCRIPTIONS,
  PRIORITY_LABELS,
  type Priority,
} from "@/lib/priorities/types";
import { cn } from "@/lib/utils";

/** Variante et intensité décroissantes avec le rang : le regard doit trouver
 *  les « Essentiel » sans lire les libellés. */
const STYLES: Record<Priority, { variant: "default" | "secondary" | "outline"; className?: string }> = {
  essentiel: { variant: "default" },
  important: { variant: "secondary" },
  complementaire: { variant: "outline" },
  // Pas d'opacité supplémentaire : text-muted-foreground sur outline donne
  // déjà le rang le plus discret, et opacity-70 faisait tomber le contraste à
  // 2,7:1 en thème clair — sous le minimum de 4,5:1, pour le rang qui porte
  // 614 livres.
  specialise: { variant: "outline", className: "text-muted-foreground" },
};

export function PriorityBadge({
  priority,
  className,
}: {
  priority: Priority | null;
  className?: string;
}) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  const { variant, className: tone } = STYLES[priority];
  return (
    <Badge
      variant={variant}
      className={cn(tone, className)}
      title={PRIORITY_DESCRIPTIONS[priority]}
    >
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
