import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the built site works from any path (e.g. GitHub Pages).
  base: "./",
  server: {
    // public/fonts is a symlink into /nix/store.
    fs: { strict: false }
  },
  fmt: {
    printWidth: 120,
    semi: false,
    trailingComma: "none",
    sortPackageJson: false,
    ignorePatterns: [
      "dist",
      "node_modules",
      "public",
      "pnpm-lock.yaml",
      "flake.lock",
      ".cache",
      ".claude/worktrees",
      "src/data/*.json"
    ]
  }
})
