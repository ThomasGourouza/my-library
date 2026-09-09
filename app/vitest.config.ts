import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  // Même alias que tsconfig.json : les tests importent « @/… » comme l'app.
  resolve: {
    alias: { "@": path.join(root, "src") },
  },
  test: {
    // Les tests lisent le fichier de données (accès synchrone), mais sur une
    // copie jetable : cf. vitest.global-setup.ts.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Deux fichiers écrivent désormais dans la copie jetable (`lists.test.ts`
    // et `store.test.ts`), et un JSON partagé n'a pas le verrou de fichier que
    // SQLite offrait pour sérialiser les workers. Les fichiers de test passent
    // donc un par un.
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
