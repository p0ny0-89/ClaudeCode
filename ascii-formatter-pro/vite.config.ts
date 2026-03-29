import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      framer: path.resolve(__dirname, "src/framer-mock.ts"),
    },
  },
  server: {
    port: 5174,
    host: true,
  },
})
