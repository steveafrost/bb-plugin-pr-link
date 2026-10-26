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

function PrLinkAction({ threadId }: PluginThreadHeaderActionProps) {
  const prs = useMentionedPrs(threadId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
        onClick={() => setOpen((value) => !value)}
      >
        {icon}
        <span className="pr-link-count">{prs.length}</span>
      </button>
      {open ? (
        <div role="menu" className="pr-link-menu">
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
