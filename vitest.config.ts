import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["server/**/*.test.ts"],
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    }
  },
});
