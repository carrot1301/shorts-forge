import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, ".."),
  files = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean),
  issues = [];
const forbidden =
  /(^|\/)(node_modules|cache|projects|\.git|\.vscode|\.idea)(\/|$)|(^|\/)\.env(?:\.|$)/;
const known = [
  process.env.PIXABAY_API_KEY,
  process.env.PEXELS_API_KEY,
  process.env.GH_TOKEN,
  process.env.GITHUB_TOKEN,
].filter((s) => s && s.length >= 12);
const patterns = [
  /gh[pousr]_[A-Za-z0-9]{24,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /sk-[A-Za-z0-9_-]{24,}/,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /[A-Za-z]:[\\/][^\n]{0,100}(?:AI VIDEO|Users[\\/]nguye)/i,
];
for (const f of files) {
  if (f !== ".env.example" && forbidden.test(f))
    issues.push({ file: f, reason: "Generated/private file tracked" });
  const full = path.join(root, f),
    stat = fs.lstatSync(full);
  if (stat.isSymbolicLink())
    issues.push({ file: f, reason: "Symlink or junction tracked" });
  if (stat.size > 10e6)
    issues.push({ file: f, reason: "Oversized repository file" });
  const data = fs.readFileSync(full);
  for (const secret of known)
    if (data.includes(Buffer.from(secret)))
      issues.push({ file: f, reason: "Known environment credential present" });
  if (/\.(?:mjs|cjs|js|jsx|json|md|ya?ml|txt|svg)$/.test(f)) {
    const s = data.toString("utf8");
    if (patterns.some((p) => p.test(s)))
      issues.push({
        file: f,
        reason: "Credential pattern or workstation path",
      });
  }
}
if (issues.length) {
  console.error(JSON.stringify({ status: "FAIL", issues }, null, 2));
  process.exitCode = 1;
} else
  console.log(
    JSON.stringify({
      status: "PASS",
      tracked_files: files.length,
      known_environment_values_checked: known.length,
      credentials: "No matches",
      workstation_paths: "No matches",
      junctions: "NONE",
    }),
  );
