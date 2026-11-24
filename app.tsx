import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useSidebarThreads,
  UrlLink,
  useBbContext,
  useSdk,
  useSidebarSplitLayout,
} from "@get-bb/plugin-sdk/app";
import { conversationTexts, hostName, latestPrs, mergePrs, prHost, prLabel, prUrl, type PrRef } from "./prs";
import "./app.css";

type TimelineRequest = { trigger: string; controller?: AbortController };

function useMentionedPrs(threadIds: readonly string[]) {
  const sdk = useSdk();
  const { threads } = experimental_useSidebarThreads();
  const requests = useRef(new Map<string, TimelineRequest>());
  const [prs, setPrs] = useState<ReadonlyMap<string, readonly PrRef[]>>(() => new Map());

  useEffect(() => {
    const current = requests.current;
    return () => {
      for (const request of current.values()) request.controller?.abort();
      current.clear();
    };
  }, [sdk]);

  // Reconcile by thread, so a change in one pane doesn't restart other requests.
  useEffect(() => {
    const visible = new Set(threadIds);
    const triggers = new Map(threads.filter((thread) => visible.has(thread.id)).map((thread) => [
      thread.id,
      `${thread.status}:${thread.status === "idle" ? thread.updatedAt : ""}`,
    ]));
    const current = requests.current;
    for (const [threadId, request] of current) {
      if (!visible.has(threadId) && request.controller) {
        request.controller.abort();
        current.delete(threadId);
      }
    }
    for (const threadId of threadIds) {
      const trigger = triggers.get(threadId) ?? "";
      const earlier = current.get(threadId);
      if (earlier?.trigger === trigger) continue;
      earlier?.controller?.abort();
      const controller = new AbortController();
      const request: TimelineRequest = { trigger, controller };
      current.set(threadId, request);
      void sdk.threads.timeline({ threadId, includeNestedRows: "true", segmentLimit: "100", signal: controller.signal })
        .then((timeline) => {
          if (controller.signal.aborted) return;
          const fresh = latestPrs(conversationTexts(timeline.rows));
          setPrs((previous) => {
            const next = new Map(previous);
            next.set(threadId, mergePrs(fresh, previous.get(threadId) ?? []));
            return next;
          });
        })
        .catch(() => {
          // Offline or the thread is gone: keep earlier PRs until the next refresh.
        })
        .finally(() => { request.controller = undefined; });
    }
  });

  return prs;
}

const MENU_WIDTH = 300;
const VIEWPORT_MARGIN = 8;
const HEADER_GAP = 6;
const CARET = 7;
const CARET_INSET = 14;
const RESPONSIVE_ACTION = "[data-thread-header-responsive-action]";
const THREAD_ACTIONS = 'button[aria-label="Thread actions"]';

export function findMenuAnchor(doc: Document, label: string): HTMLElement | null {
  const focusedPane = doc.querySelector('[data-split-pane-id][data-focused="true"]:not([aria-hidden="true"])');
  const active = doc.activeElement;
  if (active instanceof HTMLElement && active.closest("header") && (!focusedPane || focusedPane.contains(active))) {
    if (active.closest(RESPONSIVE_ACTION) || active.matches(THREAD_ACTIONS) || active.textContent?.trim() === label) {
      return active;
    }
  }

  // The secondary action itself is in a host popup, not in the header.
  const scope = focusedPane ?? doc;
  const container = Array.from(scope.querySelectorAll<HTMLElement>(`header ${RESPONSIVE_ACTION}`)).at(-1);
  const header = container?.closest("header") ?? scope.querySelector(`header:has(${THREAD_ACTIONS})`);
  if (!header) return null;
  const buttons = header.querySelectorAll<HTMLButtonElement>(`${RESPONSIVE_ACTION} button`);
  return Array.from(buttons).find((button) => button.textContent?.trim() === label || button.getAttribute("aria-label") === label)
    ?? container
    ?? header.querySelector<HTMLElement>(THREAD_ACTIONS);
}

export function menuPlacement(anchor: HTMLElement | null, viewportWidth: number, viewportHeight: number) {
  if (!anchor || viewportWidth < 520) return null;
  const rect = anchor.getBoundingClientRect();
  if (!rect.width) return null;
  const headerBottom = anchor.closest("header")?.getBoundingClientRect().bottom ?? rect.bottom;
  const top = Math.max(headerBottom, rect.bottom) + HEADER_GAP + CARET;
  if (viewportHeight - top < 64) return null;

  const width = Math.min(MENU_WIDTH, viewportWidth - 2 * VIEWPORT_MARGIN);
  const left = Math.min(Math.max(VIEWPORT_MARGIN, rect.right - width), viewportWidth - width - VIEWPORT_MARGIN);
  const caretLeft = Math.min(Math.max(rect.left + rect.width / 2 - left, CARET_INSET), width - CARET_INSET);
  return { top, left, width, caretLeft };
}

type MenuState = {
  threadId: string;
  prs: readonly PrRef[];
  anchor: HTMLElement | null;
  placement: ReturnType<typeof menuPlacement>;
};

let openMenu: MenuState | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getMenu = () => openMenu;
function setMenu(next: MenuState | null) {
  if (openMenu === next) return;
  openMenu = next;
  for (const listener of listeners) listener();
}

export function resetPrLinkMenuForTests() {
  setMenu(null);
}

function focusAnchor(anchor: HTMLElement | null) {
  if (anchor?.isConnected) {
    const button = anchor.matches("button") ? anchor
      : anchor.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]') ?? anchor.querySelector("button");
    button?.focus({ preventScroll: true });
  }
}

function toggleMenuForThread(threadId: string, prs: readonly PrRef[], label: string) {
  if (openMenu?.threadId === threadId) {
    setMenu(null);
    return;
  }
  const anchor = findMenuAnchor(document, label);
  setMenu({ threadId, prs, anchor, placement: menuPlacement(anchor, window.innerWidth, window.innerHeight) });
}

function PrLinkMenuOverlay() {
  const menu = useSyncExternalStore(subscribe, getMenu);
  const { threadId } = useBbContext();
  const splitLayout = useSidebarSplitLayout();
  const focusedThreadId = splitLayout?.panes.find((pane) => pane.isFocused)?.threadId ?? threadId;
  const previousThread = useRef(focusedThreadId);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (previousThread.current !== focusedThreadId && getMenu()?.threadId !== focusedThreadId) setMenu(null);
    previousThread.current = focusedThreadId;
  }, [focusedThreadId]);
  useEffect(() => () => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const element = menuRef.current;
    if (!element) return;
    const items = Array.from(element.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]'));
    items[0]?.focus({ preventScroll: true });

    // BB's popup may restore focus to its trigger as it closes.
    const frame = window.requestAnimationFrame(() => {
      if (getMenu() === menu && (document.activeElement === document.body || menu.anchor?.contains(document.activeElement))) {
        items[0]?.focus({ preventScroll: true });
      }
    });
    const close = () => setMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target) && !menu.anchor?.contains(event.target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        focusAnchor(menu.anchor);
        return;
      }
      // Leave the menu and let Tab continue from the header trigger.
      if (event.key === "Tab") {
        close();
        focusAnchor(menu.anchor);
        return;
      }
      const index = items.findIndex((item) => item === document.activeElement);
      let next: number;
      switch (event.key) {
        case "ArrowDown": next = (index + 1) % items.length; break;
        case "ArrowUp": next = index <= 0 ? items.length - 1 : index - 1; break;
        case "Home": next = 0; break;
        case "End": next = items.length - 1; break;
        default: return;
      }
      event.preventDefault();
      event.stopPropagation();
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  if (!menu) return null;
  const { placement } = menu;
  const style = placement ? {
    top: placement.top,
    left: placement.left,
    width: placement.width,
    "--pr-link-caret-left": `${placement.caretLeft}px`,
    "--pr-link-top": `${placement.top}px`,
  } as CSSProperties : undefined;
  return (
    <div className="pr-link-overlay" data-anchored={placement !== null}>
      <div ref={menuRef} className="pr-link-menu" role="menu" aria-label="Mentioned pull requests" style={style}>
        <div className="pr-link-menu-items" role="presentation">
          {menu.prs.map((pr) => (
            <UrlLink
              key={prLabel(pr).toLowerCase()}
              role="menuitem"
              href={prUrl(pr)}
              tabIndex={-1}
              title={prLabel(pr)}
              className="pr-link-item"
              onClick={() => {
                setMenu(null);
                focusAnchor(menu.anchor);
              }}
            >
              <Icon name="GitPullRequest" fallback="GitBranch" className="pr-link-icon" aria-hidden />
              <span className="pr-link-item-label">{prLabel(pr)}</span>
              <span className="pr-link-item-host">{hostName(prHost(pr))}</span>
            </UrlLink>
          ))}
        </div>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "pr-link",
    title: "Mentioned pull requests",
    icon: "GitPullRequest",
    group: "pr-link",
    placement: "header",
    useData: ({ threadIds }) => useMentionedPrs(threadIds),
    item: ({ thread, data, navigate }) => {
      const prs = data.get(thread.id);
      const latest = prs?.[0];
      if (!prs || !latest) return null;
      if (prs.length === 1) {
        return {
          label: `PR #${latest.number}`,
          detail: `${prLabel(latest)} · ${hostName(prHost(latest))}`,
          icon: "GitPullRequest",
          run: () => { navigate.openUrl(prUrl(latest)); },
        };
      }
      const label = `PRs (${prs.length})`;
      return {
        label,
        detail: `Most recent: ${prLabel(latest)}`,
        icon: "GitPullRequest",
        run: () => toggleMenuForThread(thread.id, prs, label),
      };
    },
  });
  app.slots.experimental_appOverlay({ id: "pr-link-menu", component: PrLinkMenuOverlay });
});
