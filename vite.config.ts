import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { zyzz } from "zyzz/vite";

export default defineConfig({
  base: "./",
  build: { rolldownOptions: { input: { chatgpt: "chatgpt.html", claude: "claude.html", index: "index.html" } }, target: "es2022" },
  plugins: [zyzz(), react()],
});
