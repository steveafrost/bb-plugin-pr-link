/** A pull request named in chat: owner/repo and number. */
export type PrRef = { owner: string; repo: string; number: number };

const SEGMENT = "[A-Za-z0-9_.-]+";
// Each alternative captures owner, repo, number. Issues are deliberately not matched.
const PATTERN = new RegExp(
  [
    // https://byor.quick.shopify.io/repos/shop/world/pulls/123[/timeline]
    `https?://byor\\.quick\\.shopify\\.io/repos/(${SEGMENT})/(${SEGMENT})/pulls?/(\\d+)`,
    // https://github.com/shop/world/pull/123
    `https?://(?:www\\.)?github\\.com/(${SEGMENT})/(${SEGMENT})/pull/(\\d+)`,
    // https://delta.shopify.io/[repos/]shop/world/pull[s]/123
    `https?://delta\\.shopify\\.io/(?:repos/)?(${SEGMENT})/(${SEGMENT})/pulls?/(\\d+)`,
    // shop/world#123 (not part of a path or URL)
    `(?<![\\w/.:-])(${SEGMENT})/(${SEGMENT})#(\\d+)\\b`,
  ].join("|"),
  "g",
);

const keyOf = (ref: PrRef) => `${ref.owner}/${ref.repo}#${ref.number}`.toLowerCase();

/** Every PR named in `text`, in order of appearance (duplicates kept). */
export function findPrRefs(text: string): PrRef[] {
  const refs: PrRef[] = [];
  for (const match of text.matchAll(PATTERN)) {
    const groups = match.slice(1);
    const start = groups.findIndex((value) => value !== undefined);
    if (start < 0) continue;
    const [owner, repo, digits] = groups.slice(start, start + 3) as [string, string, string];
    const number = Number(digits);
    if (owner.includes("..") || repo.includes("..") || !Number.isSafeInteger(number) || number <= 0) continue;
    refs.push({ owner, repo: repo.replace(/\.git$/i, ""), number });
  }
  return refs;
}

/** Distinct PRs across `texts` (oldest message first), most recently mentioned first. */
export function latestPrs(texts: readonly string[]): PrRef[] {
  const byKey = new Map<string, PrRef>();
  for (const text of texts) {
    for (const ref of findPrRefs(text)) {
      const key = keyOf(ref);
      byKey.delete(key);
      byKey.set(key, ref);
    }
  }
  return [...byKey.values()].reverse();
}

/** Merge fresh results over earlier ones so a PR scrolled out of the fetched window stays listed. */
export function mergePrs(fresh: readonly PrRef[], earlier: readonly PrRef[]): PrRef[] {
  const seen = new Set(fresh.map(keyOf));
  return [...fresh, ...earlier.filter((ref) => !seen.has(keyOf(ref)))];
}

export const prLabel = (ref: PrRef) => `${ref.owner}/${ref.repo}#${ref.number}`;

/** Delta's canonical PR link; Delta's PR router sends people to the review UI they prefer. */
export const prUrl = (ref: PrRef) =>
  `https://delta.shopify.io/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pull/${ref.number}`;

/**
 * Text of every chat message in a timeline response, oldest first. Walks nested
 * rows (a turn's intermediate assistant messages live under `children`).
 */
export function conversationTexts(rows: unknown): string[] {
  const texts: string[] = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (row.kind === "conversation" && typeof row.text === "string") texts.push(row.text);
    if (Array.isArray(row.children)) walk(row.children);
  };
  walk(rows);
  return texts;
}
