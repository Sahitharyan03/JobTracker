import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const extDir = path.resolve(rootDir, "browser-extension");
const srcDir = path.resolve(extDir, "src");
const distDir = path.resolve(extDir, "dist");
const iconsSrc = path.resolve(extDir, "icons");

for (const dir of [distDir, extDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Build background service worker (ESM)
await esbuild.build({
  entryPoints: [path.join(srcDir, "background.ts")],
  outfile: path.join(distDir, "background.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: false,
});

// 2. Build content script (IIFE for Chrome content_scripts)
await esbuild.build({
  entryPoints: [path.join(srcDir, "content.ts")],
  outfile: path.join(distDir, "content.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: false,
});

// 3. Build popup script (IIFE)
await esbuild.build({
  entryPoints: [path.join(srcDir, "popup.ts")],
  outfile: path.join(distDir, "popup.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: false,
});

// 4. Copy static assets to dist/
fs.copyFileSync(path.join(srcDir, "manifest.json"), path.join(distDir, "manifest.json"));
fs.copyFileSync(path.join(srcDir, "popup.html"), path.join(distDir, "popup.html"));
fs.copyFileSync(path.join(srcDir, "popup.css"), path.join(distDir, "popup.css"));

// Copy icons to dist/icons
const iconsOut = path.join(distDir, "icons");
if (!fs.existsSync(iconsOut)) {
  fs.mkdirSync(iconsOut, { recursive: true });
}
if (fs.existsSync(iconsSrc)) {
  const icons = fs.readdirSync(iconsSrc);
  for (const file of icons) {
    fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsOut, file));
  }
}

// 5. Also copy all runtime assets to the root browser-extension/ folder
// so loading either `browser-extension` or `browser-extension/dist` in Chrome works immediately!
const filesToMirror = [
  "manifest.json",
  "background.js",
  "content.js",
  "popup.js",
  "popup.html",
  "popup.css",
];

for (const file of filesToMirror) {
  const src = path.join(distDir, file);
  const dest = path.join(extDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

console.log("Successfully built Chrome extension to both browser-extension/ and browser-extension/dist/");

