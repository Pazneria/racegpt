import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/chrome-drift/" : "/",
  server: {
    port: 5178,
    strictPort: false
  },
  preview: {
    port: 4178,
    strictPort: false
  }
}));

