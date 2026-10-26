import { useEffect, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_Icon as Icon,
  experimental_useSidebarThreads,
  UrlLink,
  useSdk,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { byorUrl, conversationTexts, latestPrs, mergePrs, prLabel, type PrRef } from "./prs";
import "./app.css";

/**
 * PRs mentioned in the thread's chat, most recent first. Re-reads the timeline
 * when the thread's status changes (a sent message starts a turn; a finished
 * turn has the agent's reply) and when an idle thread is updated.
 */
function useMentionedPrs(threadId: string): PrRef[] {
  const sdk = useSdk();
  const { threads } = experimental_useSidebarThreads();
  const thread = threads.find((candidate) => candidate.id === threadId);
  const trigger = thread === undefined ? "" : `${thread.status}:${thread.status === "idle" ? thread.updatedAt : ""}`;
  const [prs, setPrs] = useState<PrRef[]>([]);

  useEffect(() => setPrs([]), [threadId]);
  useEffect(() => {
    const controller = new AbortController();
    sdk.threads
      .timeline({ threadId, includeNestedRows: "true", segmentLimit: "100", signal: controller.signal })
      .then((timeline) => {
        const fresh = latestPrs(conversationTexts(timeline.rows));
        setPrs((earlier) => mergePrs(fresh, earlier));
      })
      .catch(() => {
        // Offline, aborted, or the thread is gone: keep what we have.
      });
    return () => controller.abort();
  }, [sdk, threadId, trigger]);

  return prs;
}

/** Gap between the header's bottom edge and the caret tip. */
const HEADER_GAP = 6;
/** Caret height: the rotated square's half-diagonal. */
const CARET = 7;

/**
 * Where the menu sits relative to its button: below the whole title bar (not
 * just the button), with the caret centered under the icon.
 */
function menuPlacement(button: HTMLElement | null): { top: number; caretRight: number } | null {
  if (button === null) return null;
  const rect = button.getBoundingClientRect();
  const headerBottom = button.closest("header")?.getBoundingClientRect().bottom ?? rect.bottom;
  return {
    top: Math.max(headerBottom, rect.bottom) - rect.top + HEADER_GAP + CARET,
    caretRight: rect.width / 2,
  };
}

function PrLinkAction({ threadId }: PluginThreadHeaderActionProps) {
  const prs = useMentionedPrs(threadId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<{ top: number; caretRight: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const latest = prs[0];
  if (latest === undefined) return null;
  const icon = <Icon name="GitPullRequest" fallback="GitBranch" className="pr-link-icon" aria-hidden />;

  if (prs.length === 1) {
    const label = `Open ${prLabel(latest)} on BYOR`;
    return (
      <UrlLink href={byorUrl(latest)} className="pr-link-button" aria-label={label} title={label}>
        {icon}
      </UrlLink>
    );
  }

  const label = `${prs.length} pull requests mentioned`;
  return (
    <div ref={rootRef} className="pr-link-root">
      <button
        type="button"
        className="pr-link-button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        ref={buttonRef}
        onClick={() => {
          if (!open) setPlacement(menuPlacement(buttonRef.current));
          setOpen((value) => !value);
        }}
      >
        {icon}
        <span className="pr-link-count">{prs.length}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="pr-link-menu"
          style={placement === null ? undefined : { top: placement.top, ["--pr-link-caret-right" as string]: `${placement.caretRight}px` }}
        >
          <div className="pr-link-menu-items">
          {prs.map((pr) => (
            <UrlLink
              key={prLabel(pr).toLowerCase()}
              role="menuitem"
              href={byorUrl(pr)}
              className="pr-link-item"
              onClick={() => setOpen(false)}
            >
              <Icon name="GitPullRequest" fallback="GitBranch" className="pr-link-icon" aria-hidden />
              <span className="pr-link-item-label">{prLabel(pr)}</span>
            </UrlLink>
          ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadHeaderAction({
    id: "pr-link",
    title: "Mentioned pull requests",
    component: PrLinkAction,
  });
});
