// Pure helper for `MessageHistory`'s auto-scroll: decides whether a scroll
// container is "close enough" to its bottom edge to keep auto-following new
// content. Extracted as a pure function (instead of inlined in the
// component) because `happy-dom` (this project's test DOM environment) does
// no layout: `scrollHeight`/`clientHeight` always read back `0` on real
// elements, so the threshold logic itself isn't observable through a
// rendered component and needs its own direct unit coverage.

export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/** How close to the bottom (in pixels) still counts as "at the bottom". */
export const BOTTOM_THRESHOLD_PX = 48;

/**
 * `true` when `metrics` represents a scroll position within `threshold`
 * pixels of the bottom edge -- including when the content is shorter than
 * the viewport (nothing to scroll, so it's trivially "at the bottom").
 */
export function isScrolledToBottom(
  metrics: ScrollMetrics,
  threshold: number = BOTTOM_THRESHOLD_PX,
): boolean {
  const distanceFromBottom = metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight;
  return distanceFromBottom <= threshold;
}
