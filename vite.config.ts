import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so the built site works from any path (e.g. GitHub Pages).
  base: "./",
  server: {
    // public/fonts is a symlink into /nix/store.
    fs: { strict: false },
  },
});
