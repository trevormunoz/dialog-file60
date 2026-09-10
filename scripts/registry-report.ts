import raw from "../registry/evidence.json" with { type: "json" };

const ORDER = ["documented", "inferred", "chosen"];

/** docs/evidence.md's registry listing, grouped by status. Pure; the test imports it in-process. */
export function registryReport(): string {
  const groups: Record<string, string[]> = {};
  for (const [k, e] of Object.entries(raw as Record<string, { status: string }>)) (groups[e.status] ??= []).push(k);
  const out: string[] = [];
  for (const s of ORDER) { out.push(`\n## ${s}\n`); for (const k of (groups[s] ?? []).sort()) out.push(`- ${k}`); }
  return out.join("\n") + "\n";
}

if (process.argv[1]?.endsWith("registry-report.ts")) process.stdout.write(registryReport());
