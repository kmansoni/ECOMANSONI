import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

process.env.BROWSERSLIST_IGNORE_OLD_DATA ||= "1";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE || "/",
  server: {
    host: "0.0.0.0",
    port: 8080,
    hmr: {
      overlay: true,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 900,
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      // Серверные зависимости — никогда не должны попадать в клиентский бандл
      external: ["ioredis", "ws"],
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-dom") || id.includes("react-router")) return "react-vendor";
          if (id.includes("/react/") || id.includes("react/index")) return "react-vendor";
          if (id.includes("@supabase")) return "supabase-vendor";
          if (id.includes("@radix-ui")) return "radix-vendor";
          if (id.includes("framer-motion")) return "animation-vendor";
          if (id.includes("@sentry")) return "sentry-vendor";
          if (id.includes("lottie-web") || id.includes("@lottiefiles")) return "lottie-vendor";
          if (id.includes("leaflet")) return "maps-vendor";
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("d3-scale") || id.includes("d3-shape")) return "chart-vendor";
        },
      },
    },
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
}));
