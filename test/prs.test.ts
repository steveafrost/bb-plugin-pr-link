import { test } from "node:test";
import assert from "node:assert/strict";
import { byorUrl, conversationTexts, findPrRefs, latestPrs, mergePrs, prLabel } from "../prs.ts";

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

test("latestPrs orders by most recent mention and dedupes case-insensitively", () => {
  const prs = latestPrs(["shop/world#1 then shop/world#2", "Shop/World#1 again"]);
  assert.deepEqual(prs.map(prLabel), ["Shop/World#1", "shop/world#2"]);
});

test("mergePrs keeps earlier PRs after fresh ones", () => {
  const merged = mergePrs(findPrRefs("a/b#2"), findPrRefs("a/b#1 a/b#2"));
  assert.deepEqual(merged.map(prLabel), ["a/b#2", "a/b#1"]);
});

test("byorUrl", () => {
  assert.equal(byorUrl({ owner: "shop", repo: "world", number: 5 }), "https://byor.quick.shopify.io/repos/shop/world/pulls/5");
});

test("conversationTexts walks nested rows and skips work rows", () => {
  const rows = [
    { kind: "conversation", role: "user", text: "one" },
    { kind: "turn", children: [{ kind: "work", text: "shop/world#9" }, { kind: "conversation", role: "assistant", text: "two" }] },
  ];
  assert.deepEqual(conversationTexts(rows), ["one", "two"]);
});
