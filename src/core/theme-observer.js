/**
 * Better Tasks resamples its panel colors whenever `document.body` /
 * `document.documentElement` gain or lose a theme-indicating class
 * (`bp3-dark`) or `data-theme` attribute — see syncDashboardThemeVars,
 * which only ever reads `body.classList` / `root.classList` themselves.
 * It never inspects a descendant's class list, and the Roam Studio /
 * Blueprint toggle buttons already get their own narrowly-scoped
 * observers and click listener.
 *
 * `subtree: true` on body/documentElement therefore buys nothing: it
 * just means every class/data-theme mutation ANYWHERE inside Roam's
 * whole UI queues a MutationRecord for us. Roam mutates classes
 * constantly while typing (decorations, focus/caret state, virtualized
 * rows), so that bookkeeping is charged to Roam's own render task on
 * nearly every keystroke — a graph-wide latency tax invisible as this
 * extension's own CPU time. `document.head` keeps subtree tracking:
 * theme extensions swap `<link>`/`<style>` tags there, and head almost
 * never mutates while a user is just typing.
 */
export function getThemeObserverRegistrations({ body, documentElement, head } = {}) {
  const registrations = [];
  for (const target of [body, documentElement, head]) {
    if (!target) continue;
    const options =
      target === head
        ? { childList: true, subtree: true, attributes: true, attributeFilter: ["href", "data-theme"] }
        : { attributes: true, attributeFilter: ["class", "data-theme"], subtree: false };
    registrations.push({ target, options });
  }
  return registrations;
}
