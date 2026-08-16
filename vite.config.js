import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { viteStaticCopy } from "vite-plugin-static-copy";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// Pass-and-play (pass-and-play/index.html + src/js/app.js + src/js/game.js)
// is deliberately kept outside the Svelte build — see SVELTE_SPEC.md §2 and
// §9. It's copied verbatim to the same relative paths it already uses today
// so its existing relative <script>/<link> references keep working
// unmodified, both loose in the repo and inside dist/.
export default defineConfig({
  plugins: [
    svelte(),
    viteStaticCopy({
      // Directory structure is preserved relative to the project root, so
      // dest is always "." here — these targets land at the same relative
      // paths in dist/ that they already have in the repo (pass-and-play's
      // existing relative <script>/<link> references depend on that).
      targets: [
        { src: "pass-and-play/*", dest: "." },
        { src: "src/js/app.js", dest: "." },
        { src: "src/js/game.js", dest: "." },
        { src: "src/data/cards.js", dest: "." },
        { src: "src/css/styles.css", dest: "." },
      ],
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    outDir: "dist",
  },
});
