import { test } from "node:test";
import assert from "node:assert/strict";
import { prHost, prUrl, conversationTexts, findPrRefs, latestPrs, mergePrs, prLabel } from "../prs.ts";

const labels = (text: string) => findPrRefs(text).map(prLabel);

test("finds BYOR, GitHub, Delta URLs and owner/repo#n", () => {
  assert.deepEqual(labels("rebase: https://byor.quick.shopify.io/repos/shop/world/pulls/2309326/timeline"), ["shop/world#2309326"]);
  assert.deepEqual(labels("see https://github.com/steveafrost/bb-plugin-radar/pull/24."), ["steveafrost/bb-plugin-radar#24"]);
  assert.deepEqual(labels("https://delta.shopify.io/shop/world/pull/2261375 and https://delta.shopify.io/repos/shop/world/pulls/7"), ["shop/world#2261375", "shop/world#7"]);
  assert.deepEqual(labels("bb-marketplace#93 no, get-bb/marketplace#587 yes"), ["get-bb/marketplace#587"]);
});

test("ignores issues, non-PR paths and URL fragments", () => {
  assert.deepEqual(labels("https://github.com/shop/world/issues/12"), []);
  assert.deepEqual(labels("https://github.com/shop/world/blob/main/a.md#L12"), []);
  assert.deepEqual(labels("https://example.com/a/b#3"), []);
  assert.deepEqual(labels("~/src/a/b#3"), []);
});

test("ignores placeholder repos like owner/repo#123", () => {
  assert.deepEqual(labels("e.g. owner/repo#123, org/my-app#4, foo/bar#5, https://github.com/your-org/repo/pull/6"), []);
  assert.deepEqual(labels("owner/repo#1 and shop/world#2"), ["shop/world#2"]);
  assert.deepEqual(labels("x/y#1 or a/b#2, but go/x#3"), ["go/x#3"]);
});

test("latestPrs orders by most recent mention and dedupes case-insensitively", () => {
  const prs = latestPrs(["shop/world#1 then shop/world#2", "Shop/World#1 again"]);
  assert.deepEqual(prs.map(prLabel), ["Shop/World#1", "shop/world#2"]);
});

test("mergePrs keeps earlier PRs after fresh ones", () => {
  const merged = mergePrs(findPrRefs("acme/app#2"), findPrRefs("acme/app#1 acme/app#2"));
  assert.deepEqual(merged.map(prLabel), ["acme/app#2", "acme/app#1"]);
});

test("prUrl links each PR to its host", () => {
  assert.equal(prUrl({ owner: "shop", repo: "world", number: 2309326 }), "https://delta.shopify.io/shop/world/pull/2309326");
  assert.equal(prUrl({ owner: "Shop", repo: "World", number: 2151771 }), "https://delta.shopify.io/Shop/World/pull/2151771");
  assert.equal(prUrl({ owner: "shop", repo: "world", number: 512 }), "https://github.com/shop/world/pull/512");
  assert.equal(prUrl({ owner: "steveafrost", repo: "bb-plugin-radar", number: 24 }), "https://github.com/steveafrost/bb-plugin-radar/pull/24");
});

test("prHost: mention source vs repo", () => {
  const [github, byor, delta] = findPrRefs(
    "https://github.com/shop/world/pull/2261375 https://byor.quick.shopify.io/repos/shopify-playground/tributary/pulls/22 https://delta.shopify.io/acme/app/pull/3",
  );
  assert.equal(prHost(github!), "delta", "shop/world >= 2,000,000 is on Delta even when linked via GitHub");
  assert.equal(prHost(byor!), "github");
  assert.equal(prHost(delta!), "delta", "a Delta URL proves the repo is on Delta");
  const [later] = latestPrs(["https://delta.shopify.io/acme/app/pull/3", "then acme/app#3"]);
  assert.equal(prHost(later!), "delta", "a later bare mention keeps the Delta host");
});

test("GitHub-only repos open on GitHub however they're mentioned", () => {
  // Mentions from thr_bje2c6f69y, which used to link to BYOR/Delta and fail to load.
  const prs = latestPrs([
    "opened [bb-marketplace#132](https://github.com/shopify-playground/bb-marketplace/pull/132)",
    "BYOR: `https://byor.quick.shopify.io/repos/shopify-playground/bb-marketplace/pulls/132`",
    "shopify-playground/bb-marketplace#209 is open",
  ]);
  assert.deepEqual(prs.map(prUrl), [
    "https://github.com/shopify-playground/bb-marketplace/pull/209",
    "https://github.com/shopify-playground/bb-marketplace/pull/132",
  ]);
});

test("conversationTexts walks nested rows and skips work rows", () => {
  const rows = [
    { kind: "conversation", role: "user", text: "one" },
    { kind: "turn", children: [{ kind: "work", text: "shop/world#9" }, { kind: "conversation", role: "assistant", text: "two" }] },
  ];
  assert.deepEqual(conversationTexts(rows), ["one", "two"]);
});
