import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/__tests__/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // server-only is a Next.js compile-time guard; in tests we mock it as a no-op
      "server-only": path.resolve(__dirname, "./src/__tests__/__mocks__/server-only.ts"),
    },
  },
})
