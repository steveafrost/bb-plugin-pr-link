/**
 * A pull request named in chat: owner/repo and number. `onDelta` is set when it
 * was mentioned by a delta.shopify.io URL, which proves Delta hosts it.
 */
export type PrRef = { owner: string; repo: string; number: number; onDelta?: boolean };

const SEGMENT = "[A-Za-z0-9_.-]+";
/** Index of the Delta URL alternative in PATTERN (each alternative has 3 groups). */
const DELTA_ALTERNATIVE = 2;
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
    const ref: PrRef = { owner, repo: repo.replace(/\.git$/i, ""), number };
    if (start / 3 === DELTA_ALTERNATIVE) ref.onDelta = true;
    refs.push(ref);
  }
  return refs;
}

/** Distinct PRs across `texts` (oldest message first), most recently mentioned first. */
export function latestPrs(texts: readonly string[]): PrRef[] {
  const byKey = new Map<string, PrRef>();
  for (const text of texts) {
    for (const ref of findPrRefs(text)) {
      const key = keyOf(ref);
      const earlier = byKey.get(key);
      byKey.delete(key);
      byKey.set(key, earlier?.onDelta && !ref.onDelta ? { ...ref, onDelta: true } : ref);
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

export type PrHost = "delta" | "github";

/** shop/world PRs numbered from here up were created on Gitstream or Delta; Delta hosts them all. Below it, GitHub. */
const FIRST_SHOP_WORLD_DELTA_PR = 2_000_000;

/**
 * Where the PR lives. Delta hosts shop/world (from PR 2,000,000) and anything
 * mentioned by a Delta URL; every other repo is on GitHub.
 */
export function prHost(ref: PrRef): PrHost {
  if (ref.onDelta) return "delta";
  const isShopWorld = ref.owner.toLowerCase() === "shop" && ref.repo.toLowerCase() === "world";
  return isShopWorld && ref.number >= FIRST_SHOP_WORLD_DELTA_PR ? "delta" : "github";
}

export const hostName = (host: PrHost) => (host === "delta" ? "Delta" : "GitHub");

/**
 * The PR's canonical link on its host. Delta's link goes through its PR router,
 * which sends each person to the review site they prefer.
 */
export function prUrl(ref: PrRef): string {
  const path = `${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/pull/${ref.number}`;
  return prHost(ref) === "delta" ? `https://delta.shopify.io/${path}` : `https://github.com/${path}`;
}

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
