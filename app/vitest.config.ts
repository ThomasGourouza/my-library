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
    // Les tests lisent la base SQLite réelle via better-sqlite3 (synchrone).
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
