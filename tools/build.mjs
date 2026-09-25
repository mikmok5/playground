// Bundles src/ into two self-contained pages, with no dependencies:
//   dist/index.html        a normal web page (open it, or host it anywhere)
//   dist/pocket-worm.html  the same app as a claude.ai Artifact body
import fs from "node:fs";
import path from "node:path";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const src = (f) => fs.readFileSync(path.join(root, "src", f), "utf8");

const MODULES = ["brain.js", "worm.js", "graph.js", "neurons.js", "app.js"];
const data = src("connectome.json").trim();

const code = MODULES.map((f) => {
  const body = src(f)
    .replace(/^import DATA from "\.\/connectome\.json";$/m, `const DATA = ${data};`)
    .replace(/^import .*;$/gm, "")
    .replace(/^export (const|let|class|function) /gm, "$1 ");
  return `// ---- ${f}\n${body}`;
}).join("\n");

const script = `(() => {\n"use strict";\n${code}\n})();`;
const page = src("index.html")
  .replace("/*STYLE*/", () => src("style.css"))
  .replace("/*SCRIPT*/", () => script);

const standalone = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a1014">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>html,body{margin:0}:root{padding-top:env(safe-area-inset-top,0px)}</style>
${page.replace(/\n<div id="app"/, "\n</head>\n<body>\n<div id=\"app\"")}
</body>
</html>
`;

fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist", "index.html"), standalone);
fs.writeFileSync(path.join(root, "dist", "pocket-worm.html"), page);
console.log(`built dist/index.html (${(standalone.length / 1024).toFixed(0)} KB)`);
