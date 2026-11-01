import fs from "node:fs";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import platform from "./platform.cjs";
const { repo, browserPath, read } = platform,
  root = path.resolve(process.argv[2]),
  episode = read(path.join(root, "release/episode.json"));
const serveUrl = await bundle({
  entryPoint: path.join(repo, "src/remotion/index.jsx"),
  publicDir: path.join(repo, "public"),
});
for (const [index, part] of episode.parts.entries()) {
  const inputProps = { episode, part, index };
  const composition = await selectComposition({
    serveUrl,
    id: "ShortsForge-Plate",
    inputProps,
    browserExecutable: browserPath(),
  });
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    browserExecutable: browserPath(),
    frame: 0,
    output: path.join(root, "qc", part.id + "-plate.png"),
  });
  console.log("Plate", part.id);
}
