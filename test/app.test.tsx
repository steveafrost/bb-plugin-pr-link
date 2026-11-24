import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  experimental_useAppPanel,
  useBbNavigate,
  useSdk,
  type PluginBrowserBbSdk,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot, type CapturedPluginApp, type RenderSlotOptions } from "@get-bb/plugin-sdk/testing/app";
import app, { findMenuAnchor, menuPlacement, resetPrLinkMenuForTests } from "../app";

let registered: CapturedPluginApp;
const target: PluginThreadActionTarget = {
  id: "thread-a",
  projectId: "project",
  status: "idle",
  parentThreadId: null,
  parentNotifications: "auto",
  archivedAt: null,
  pinnedAt: null,
  sectionId: null,
  isUnread: false,
  environment: null,
};
const github = "https://github.com/acme/widgets/pull/42";
const delta = "https://delta.shopify.io/shop/world/pull/2500000";
const third = "https://github.com/acme/tools/pull/7";

beforeAll(async () => { registered = await loadPluginApp(app); });
afterEach(() => {
  cleanup();
  resetPrLinkMenuForTests();
  vi.restoreAllMocks();
});

type TimelineInput = Parameters<PluginBrowserBbSdk["threads"]["timeline"]>[0];
type Timeline = Awaited<ReturnType<PluginBrowserBbSdk["threads"]["timeline"]>>;
const timeline = (...texts: string[]) => ({
  rows: texts.map((text) => ({ kind: "conversation", text })),
}) as Timeline;

type HeaderProps = { threadIds: readonly string[] };

function TestHeader({ threadIds }: HeaderProps) {
  const slot = registered.threadActions[0];
  const data = slot.useData?.({ threadIds });
  const sdk = useSdk();
  const navigate = useBbNavigate();
  const experimental_panel = experimental_useAppPanel();
  const action = slot.item({ thread: target, data, sdk, navigate, experimental_panel });
  return (
    <header>
      <span data-thread-header-responsive-action="">
        {action && <button title={action.detail} onClick={() => void action.run({ requestRename: vi.fn() })}>{action.label}</button>}
      </span>
    </header>
  );
}

function mount(readTimeline: (args: TimelineInput) => Promise<Timeline>, options: RenderSlotOptions = {}, threadIds = [target.id]) {
  const { component: Overlay } = registered.appOverlays[0];
  function Host(props: HeaderProps) {
    return <><TestHeader {...props} /><Overlay /><button>Outside</button></>;
  }
  const view = renderSlot({ component: Host }, { threadIds }, {
    context: { threadId: target.id },
    openUrl: () => true,
    sdk: { threads: { timeline: readTimeline as PluginBrowserBbSdk["threads"]["timeline"] } },
    ...options,
  });
  return { ...view, update: (props: HeaderProps) => view.lifecycle.rerender(<Host {...props} />) };
}

function stubRect(element: Element, x: number, y: number, width: number, height: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(x, y, width, height));
}

function setHeaderGeometry(button: HTMLElement) {
  stubRect(button.closest("header")!, 0, 0, 1_024, 46);
  stubRect(button, 854, 6, 72, 28);
  button.focus();
}

describe("PR Link header action", () => {
  it("registers only supported slots and uses host navigation for a single PR", async () => {
    expect(registered.threadHeaderActions).toEqual([]);
    expect(registered.threadActions).toEqual([expect.objectContaining({
      id: "pr-link", title: "Mentioned pull requests", icon: "GitPullRequest", group: "pr-link", placement: "header",
    })]);
    expect(registered.appOverlays).toEqual([expect.objectContaining({ id: "pr-link-menu" })]);

    const fetchTimeline = vi.fn(async () => timeline(github));
    const view = mount(fetchTimeline);
    expect(screen.queryByRole("button", { name: /PR #/ })).toBeNull();
    const button = await screen.findByRole("button", { name: "PR #42" });
    expect(button.title).toBe("acme/widgets#42 · GitHub");
    expect(fetchTimeline).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      threadId: target.id, includeNestedRows: "true", segmentLimit: "100", signal: expect.any(AbortSignal),
    }));
    fireEvent.click(button);
    expect(view.inspection.navigateCalls).toEqual([{ method: "openUrl", url: github }]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("shows the whole PR list in order, supports keyboard navigation, and opens the chosen URL", async () => {
    const view = mount(async () => timeline(third, github, delta));
    const button = await screen.findByRole("button", { name: "PRs (3)" });
    expect(button.title).toBe("Most recent: shop/world#2500000");
    setHeaderGeometry(button);
    fireEvent.click(button);
    const menu = screen.getByRole("menu", { name: "Mentioned pull requests" });
    expect(menu.parentElement?.dataset.anchored).toBe("true");
    expect(menu.style.top).toBe("59px");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((item) => [item.textContent, item.getAttribute("href")])).toEqual([
      ["shop/world#2500000Delta", delta],
      ["acme/widgets#42GitHub", github],
      ["acme/tools#7GitHub", third],
    ]);

    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1], { key: "Home" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0], { key: "End" });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(items[2], { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    fireEvent.click(screen.getAllByRole("menuitem")[1]);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(view.inspection.navigateCalls).toEqual([{ method: "openUrl", url: github }]);
  });

  it("toggles on the trigger and dismisses on outside pointerdown, resize, and thread change", async () => {
    const pane = { paneId: "pane-a", isFocused: true, threadId: target.id, rect: { x: 0, y: 0, width: 1, height: 1 } };
    const view = mount(async () => timeline(github, delta), { sidebarSplitLayout: { panes: [pane] } });
    const button = await screen.findByRole("button", { name: "PRs (2)" });
    setHeaderGeometry(button);

    fireEvent.click(button);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.pointerDown(button);
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    pane.threadId = "thread-b";
    view.update({ threadIds: [target.id] });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("uses a centered overlay when the header can't anchor it", async () => {
    mount(async () => timeline(github, delta));
    fireEvent.click(await screen.findByRole("button", { name: "PRs (2)" }));
    const menu = screen.getByRole("menu");
    expect(menu.parentElement?.dataset.anchored).toBe("false");
    expect(menu.style.top).toBe("");
    fireEvent.pointerDown(menu.parentElement!);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("refreshes by thread trigger, merges earlier PRs, and ignores aborted results", async () => {
    type SidebarFixture = Pick<PluginSidebarThread, "id" | "status" | "updatedAt">;
    const first: SidebarFixture = { id: target.id, status: "idle", updatedAt: 1 };
    const second: SidebarFixture = { id: "thread-b", status: "idle", updatedAt: 1 };
    const threadIds = [first.id, second.id];
    const pending: { input: TimelineInput; resolve: (result: Timeline) => void }[] = [];
    const read = vi.fn((input: TimelineInput) => new Promise<Timeline>((resolve) => { pending.push({ input, resolve }); }));
    // Sidebar fixture only needs the fields the plugin reads; retain the same objects to simulate updates.
    const view = mount(read, { sidebarThreads: { threads: [first, second] as PluginSidebarThread[] } }, threadIds);
    expect(pending.map(({ input }) => input.threadId)).toEqual(threadIds);
    const resolve = (request: number, ...texts: string[]) => act(async () => { pending[request].resolve(timeline(...texts)); });
    await resolve(0, github);
    expect(screen.getByRole("button", { name: "PR #42" })).toBeTruthy();

    first.updatedAt++;
    view.update({ threadIds });
    expect(read).toHaveBeenCalledTimes(3);
    expect(pending[1].input.signal?.aborted).toBe(false);
    first.status = "active";
    view.update({ threadIds });
    expect(read).toHaveBeenCalledTimes(4);
    expect(pending[2].input.signal?.aborted).toBe(true);
    first.updatedAt++;
    view.update({ threadIds });
    expect(read).toHaveBeenCalledTimes(4);
    await resolve(3, delta);
    await resolve(2, third);
    expect(screen.getByRole("button", { name: "PRs (2)" })).toBeTruthy();

    view.update({ threadIds: [first.id] });
    expect(pending[1].input.signal?.aborted).toBe(true);
    view.update({ threadIds });
    expect(read).toHaveBeenCalledTimes(5);
    expect(pending[4].input.threadId).toBe(second.id);
    view.lifecycle.unmount();
    expect(pending[4].input.signal?.aborted).toBe(true);
    await resolve(4, third);
  });
});

describe("menu anchoring", () => {
  function fixture(html: string) {
    const root = document.createElement("div");
    root.innerHTML = html;
    document.body.append(root);
    return root;
  }

  it("anchors below the whole header and under the active sole button", () => {
    const root = fixture('<header><button>PRs (2)</button></header>');
    try {
      const button = root.querySelector("button")!;
      setHeaderGeometry(button);
      const anchor = findMenuAnchor(document, "PRs (2)");
      expect(anchor).toBe(button);
      expect(menuPlacement(anchor, 1024, 768)).toEqual({ top: 59, left: 626, width: 300, caretLeft: 264 });
    } finally { root.remove(); }
  });

  it("finds a matching header button or the split-button container in the focused pane", () => {
    const root = fixture(`
      <div data-split-pane-id="one"><header><span data-thread-header-responsive-action><button>PRs (2)</button></span></header></div>
      <div data-split-pane-id="two" data-focused="true"><header><span data-thread-header-responsive-action>
        <button>Commit</button><button aria-label="PRs (2)"></button>
      </span></header></div>`);
    try {
      root.querySelector("button")!.focus();
      const split = root.querySelector('[data-focused] span')!;
      const button = split.querySelector('[aria-label="PRs (2)"]')!;
      expect(findMenuAnchor(document, "PRs (2)")).toBe(button);
      button.remove();
      stubRect(split, 997, 8, 54, 28);
      expect(findMenuAnchor(document, "PRs (2)")).toBe(split);
      expect(menuPlacement(findMenuAnchor(document, "PRs (2)"), 1024, 768))
        .toEqual({ top: 49, left: 716, width: 300, caretLeft: 286 });
    } finally { root.remove(); }
  });

  it("uses Thread actions on narrow split panes and falls back below 520px", () => {
    const root = fixture('<div data-split-pane-id="one" data-focused="true"><header><button aria-label="Thread actions"></button></header></div>');
    try {
      const button = root.querySelector("button")!;
      stubRect(button, 15, 7, 28, 28);
      const anchor = findMenuAnchor(document, "PRs (2)");
      expect(anchor).toBe(button);
      expect(menuPlacement(anchor, 1024, 768)).toEqual({ top: 48, left: 8, width: 300, caretLeft: 21 });
      expect(menuPlacement(anchor, 519, 768)).toBeNull();
      expect(menuPlacement(null, 1024, 768)).toBeNull();
    } finally { root.remove(); }
  });
});
