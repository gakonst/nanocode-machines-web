import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
  optimizeDeps: { exclude: ["@sqlite.org/sqlite-wasm"] },
  plugins: [react()],
});
