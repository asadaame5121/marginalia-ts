import * as esbuild from "esbuild";

async function build() {
  // ESM ビルド
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    outfile: "dist/marginalia.esm.js",
    sourcemap: true,
  });

  // IIFE ビルド（ブラウザ直接読み込み用）
  await esbuild.build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "iife",
    globalName: "Marginalia",
    outfile: "dist/marginalia.iife.js",
    sourcemap: true,
  });

  // CSS のコピー
  const css = await Deno.readTextFile("src/ui/styles.css");
  await Deno.mkdir("dist", { recursive: true });
  await Deno.writeTextFile("dist/marginalia.css", css);

  console.log("Build complete: dist/marginalia.esm.js, dist/marginalia.iife.js & dist/marginalia.css");
  await esbuild.stop();
}

build();

