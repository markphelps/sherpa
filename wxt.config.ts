import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  runner: {
    openBrowser: false,
  },
  manifest: {
    name: "Sherpa",
    description: "Your guide through pull requests",
    icons: {
      16: "icon-16.png",
      32: "icon-32.png",
      48: "icon-48.png",
      128: "icon-128.png",
    },
    permissions: ["sidePanel", "storage", "activeTab", "tabs", "identity"],
    host_permissions: [
      "https://github.com/*",
      "https://api.github.com/*",
      "https://api.anthropic.com/*",
      "https://api.openai.com/*",
      "https://generativelanguage.googleapis.com/*",
    ],
    content_scripts: [
      {
        matches: [
          "https://github.com/*/*/pull/*/files*",
          "https://github.com/*/*/pull/*/changes*",
        ],
        js: ["content-scripts/content.js"],
      },
    ],
    side_panel: {
      default_path: "sidepanel/index.html",
    },
  },
  vite: ({ mode }) => ({
    plugins: [tailwindcss()],
    esbuild:
      mode === "production" ? { drop: ["console", "debugger"] } : undefined,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        react: "preact/compat",
        "react-dom": "preact/compat",
      },
    },
  }),
});
