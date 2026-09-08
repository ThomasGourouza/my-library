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
    // ponytail: un seul fichier de test écrit (lists.test.ts), et ses
    // écritures ne touchent pas ce que les autres vérifient. Si un second
    // apparaît, passer à `fileParallelism: false` — le verrou de fichier de
    // SQLite sérialisait les workers, un JSON partagé n'a rien pour ça.
    include: ["src/**/*.test.ts"],
    globalSetup: ["./vitest.global-setup.ts"],
  },
});
