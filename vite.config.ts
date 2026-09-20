import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    // .tsx as well as .ts: a component test states its own environment in a
    // `@vitest-environment jsdom` docblock, so the node default above stays
    // the default and only the files that need a DOM pay for one.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "supabase/**/*.test.ts"],
    // The default glob would also walk .claude/worktrees, which holds a full
    // duplicate checkout of this repo and would run every test twice.
    exclude: ["node_modules/**", "dist/**", ".claude/**", ".venv/**"],
  },
}));
