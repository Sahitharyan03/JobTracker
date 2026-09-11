import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const rootDir = process.cwd();
const srcDir = path.resolve(rootDir, "browser-extension/src");
const outDir = path.resolve(rootDir, "browser-extension/dist");
const iconsSrc = path.resolve(rootDir, "browser-extension/icons");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 1. Build background service worker (ESM)
await esbuild.build({
  entryPoints: [path.join(srcDir, "background.ts")],
  outfile: path.join(outDir, "background.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
  sourcemap: false,
});

// 2. Build content script (IIFE for Chrome content_scripts)
await esbuild.build({
  entryPoints: [path.join(srcDir, "content.ts")],
  outfile: path.join(outDir, "content.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: false,
});

// 3. Build popup script (IIFE)
await esbuild.build({
  entryPoints: [path.join(srcDir, "popup.ts")],
  outfile: path.join(outDir, "popup.js"),
  bundle: true,
  format: "iife",
  target: "es2022",
  sourcemap: false,
});

// 4. Copy static assets
fs.copyFileSync(path.join(srcDir, "manifest.json"), path.join(outDir, "manifest.json"));
fs.copyFileSync(path.join(srcDir, "popup.html"), path.join(outDir, "popup.html"));
fs.copyFileSync(path.join(srcDir, "popup.css"), path.join(outDir, "popup.css"));

// Copy icons
const iconsOut = path.join(outDir, "icons");
if (!fs.existsSync(iconsOut)) {
  fs.mkdirSync(iconsOut, { recursive: true });
}
if (fs.existsSync(iconsSrc)) {
  const icons = fs.readdirSync(iconsSrc);
  for (const file of icons) {
    fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsOut, file));
  }
}

console.log("Successfully built Chrome extension to browser-extension/dist");
