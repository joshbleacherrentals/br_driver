/**
 * Compare two major.minor.patch versions.
 * Returns negative if a < b, 0 if equal, positive if a > b.
 * Non-numeric / missing segments are treated as 0.
 */
export function compareSemver(a: string, b: string): number {
  const parse = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .slice(0, 3)
      .map((part) => {
        const n = parseInt(part.replace(/[^0-9].*$/, ""), 10);
        return Number.isFinite(n) ? n : 0;
      });

  const pa = parse(a);
  const pb = parse(b);
  while (pa.length < 3) pa.push(0);
  while (pb.length < 3) pb.push(0);

  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function isVersionLessThan(current: string, target: string): boolean {
  return compareSemver(current, target) < 0;
}
