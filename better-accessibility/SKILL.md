---
name: better-accessibility
description: Audits a selected Figma frame, component, or multi-screen user flow against WCAG 2.2 AA using measured values, and marks the canvas up with Figma annotations that carry the WCAG criterion and render in Dev Mode. Findings a static design cannot settle are listed in plain language a developer can act on with any tooling; a runnable pa11y config is available on request.
---

# Better Accessibility (Figma)

Audit what is selected — a frame, a component, or a whole user flow — against WCAG 2.2 AA
with measured values, and pin the findings onto the canvas as annotations the designer can
act on. **That canvas markup is the deliverable** — and because Figma annotations render in
Dev Mode, it is also the handoff: a developer sees every finding, with its criterion, in the
file they already have open.

The criteria a static design cannot settle go into a short plain-language list in the report
(Step 4) that a developer can act on with whatever tooling they already have. A runnable
[pa11y](https://pa11y.org) config is available as well, but **only when the user asks for
it** — see Step 7.

Run all scripts through `use_figma`, with `figma-use` in the `skillNames` parameter. Code is
auto-wrapped in an async context — use top-level `await` and `return` explicitly, since only
the returned value is visible and `console.log` is not.

Three rules govern everything below.

**Measure, never eyeball** — every ratio, px size, and gap is computed from resolved values,
never judged from a screenshot. Where a value cannot be resolved, say so; do not estimate.

**Never claim a design "passes WCAG"** — a design can only be *contrast-conformant and
structurally sound*; conformance is a property of the built product.

**Never invent a selector.** Figma has no DOM, so every class, id, and route in the Step 7
config is a guess. Guesses are written as named placeholders the user replaces — never as
plausible-looking values, which run against the wrong element and pass silently.

## What gets checked where

Figma has no DOM, so there is nothing to inspect for ARIA, semantics, or tab order. pa11y
has a DOM but no design intent, so it cannot tell a decorative rectangle from a missing
icon. Each covers the other's blind spot, and some things neither can settle:

| This skill checks on canvas | Checkable in the build (pa11y, axe) | Neither — needs a human |
| --- | --- | --- |
| Contrast: text, icons, borders, every variant state | Computed contrast on rendered colour | Text over photography or video |
| Text size, line height, measure, all-caps runs | — | Whether the copy actually reads well |
| Target size and spacing (2.5.8) | `axe` runner only (`target-size`, axe-core ≥ 4.8) | Touch ergonomics on device |
| Layer order as a *proxy* for reading order | Real source order, `heading-order` | Screen-reader announcement quality |
| Focus / error / disabled variants exist | Focus styles, but only via scripted `actions` | Keyboard traps, focus management |
| Alt-text and heading-level annotations | `image-alt`, `H37`, `H42`, `label`, `F68` | Whether the alt text is *good* |
| Reflow via auto layout resizing | Real reflow at `viewport: { width: 320 }` | Zoom + magnification behaviour |
| Colour-only meaning (1.4.1), non-text contrast (1.4.11) | — no runner covers these | Both, always |

## Severity — pa11y's vocabulary, on purpose

Findings use pa11y's three types rather than a bespoke scale, so a design-time report and
a CI run can be read side by side and merged without translation.

| Type | `typeCode` | Means here |
| --- | --- | --- |
| `error` | 1 | A **measured** WCAG 2.2 A/AA failure. Blocking. |
| `warning` | 2 | Probable failure, or one depending on content or state not visible on canvas. |
| `notice` | 3 | Needs a human or a runtime check. Becomes a Step 4 handoff entry, not a fix. |

Order findings by user impact, never by how easy they are to fix.

## Issue codes and WCAG references

**Every finding carries its success criterion — number, official name, level, and a link to
the W3C Understanding page — wherever it appears: the canvas pin, the chat report, and the
config comments alike.** A finding without one is not actionable: "text too light" is an
opinion, and `G18.Fail` is a string only a runner recognises, but "1.4.3 Contrast (Minimum),
Level AA" is the thing a designer can escalate, a developer can look up, and a compliance
statement can cite.

Alongside it, each finding carries a **code**. Where a build-time runner would emit the same
defect, use **its** code verbatim — the design finding and the CI failure then collapse into
one row. Where no runner covers it, use the `Figma.` namespace, which is this skill's, not
pa11y's.

| Check | Success criterion | Code | Caught in build by |
| --- | --- | --- | --- |
| Text contrast, normal | [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) · AA | `WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail` | `htmlcs`, `axe` |
| Text contrast, large | [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) · AA | `WCAG2AA.Principle1.Guideline1_4.1_4_3.G145.Fail` | `htmlcs`, `axe` |
| Image missing alt | [1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content) · A | `WCAG2AA.Principle1.Guideline1_1.1_1_1.H37` | `htmlcs`, `axe` |
| Input without label | [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships) · A | `WCAG2AA.Principle1.Guideline1_3.1_3_1.F68` | `htmlcs`, `axe` |
| Empty heading | [1.3.1 Info and Relationships](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships) · A | `WCAG2AA.Principle1.Guideline1_3.1_3_1.H42.2` | `htmlcs` |
| Link purpose unclear | [2.4.4 Link Purpose (In Context)](https://www.w3.org/WAI/WCAG22/Understanding/link-purpose-in-context) · A | `WCAG2AA.Principle2.Guideline2_4.2_4_4.H77,H78,H79,H80,H81` | `htmlcs` |
| Target size < 24px | [2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) · AA | `Figma.2_5_8.TargetSize` | `axe` only |
| Non-text contrast < 3:1 | [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) · AA | `Figma.1_4_11.NonTextContrast` | nothing |
| No focus variant designed | [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) · AA | `Figma.2_4_7.NoFocusVariant` | nothing automatic |
| Reflow / fixed width | [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow) · AA | `Figma.1_4_10.Reflow` | pa11y at 320px |
| Meaning by colour alone | [1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) · A | `Figma.1_4_1.ColorOnly` | nothing |
| Text on a gradient, image, or video | [1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum) · AA | `Figma.1_4_3.UnmeasurableBackdrop` | `axe` sees the rendered pixel |
| Body text < 16px, line height < 1.5 | [1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing) · AA | `Figma.1_4_12.TextSpacing` | nothing |
| Re-asks data from an earlier step | [3.3.7 Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry) · A | `Figma.3_3_7.RedundantEntry` | nothing — flow-level |
| Control renamed between steps | [3.2.4 Consistent Identification](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification) · AA | `Figma.3_2_4.InconsistentIdentification` | nothing — flow-level |

Never retype a criterion name from memory — build every finding line from this map, which
also covers the flow-level criteria in Step 5:

```js
// [official name, level, Understanding-page slug] — WCAG 2.2.
const SC = {
  '1.1.1':  ['Non-text Content', 'A', 'non-text-content'],
  '1.3.1':  ['Info and Relationships', 'A', 'info-and-relationships'],
  '1.4.1':  ['Use of Color', 'A', 'use-of-color'],
  '1.4.3':  ['Contrast (Minimum)', 'AA', 'contrast-minimum'],
  '1.4.10': ['Reflow', 'AA', 'reflow'],
  '1.4.11': ['Non-text Contrast', 'AA', 'non-text-contrast'],
  '1.4.12': ['Text Spacing', 'AA', 'text-spacing'],
  '2.4.4':  ['Link Purpose (In Context)', 'A', 'link-purpose-in-context'],
  '2.4.7':  ['Focus Visible', 'AA', 'focus-visible'],
  '2.4.11': ['Focus Not Obscured (Minimum)', 'AA', 'focus-not-obscured-minimum'],
  '2.5.8':  ['Target Size (Minimum)', 'AA', 'target-size-minimum'],
  '3.2.3':  ['Consistent Navigation', 'AA', 'consistent-navigation'],
  '3.2.4':  ['Consistent Identification', 'AA', 'consistent-identification'],
  '3.3.1':  ['Error Identification', 'A', 'error-identification'],
  '3.3.3':  ['Error Suggestion', 'AA', 'error-suggestion'],
  '3.3.4':  ['Error Prevention (Legal, Financial, Data)', 'AA', 'error-prevention-legal-financial-data'],
  '3.3.7':  ['Redundant Entry', 'A', 'redundant-entry'],
};
// Plain text for a canvas pin; a markdown link for the chat report.
const ref     = sc => `${sc} ${SC[sc][0]} · ${SC[sc][1]}`;
const refLink = sc => `[${ref(sc)}](https://www.w3.org/WAI/WCAG22/Understanding/${SC[sc][2]})`;
```

Pins get `ref()` and the report gets `refLink()`: a pin is read on canvas at a glance, where
a long URL crowds out the finding, and the report is markdown in chat where the link
resolves. If a finding needs a criterion this map does not list, add it here first — an
invented criterion name is worse than none, because it survives into a compliance document.

## Step 1 — Resolve the scope

Nothing selected → **ask what to audit**; never audit a whole page on a guess. Otherwise
the selection defines the job, and its shape decides which mode runs:

| Selection | Mode |
| --- | --- |
| One frame or component | Single screen |
| Several frames, or a Section containing them | **Flow** — per-screen passes plus the cross-screen checks in Step 5 |
| A component set | Every variant is its own screen; disabled/focus variants are the point |

```js
const sel = figma.currentPage.selection;
if (!sel.length) return { error: 'Select a frame, a flow, or a section to audit.' };
// A Section is a container, not a screen — audit the frames inside it.
const screens = sel.flatMap(n => n.type === 'SECTION' ? n.children : [n]);
return screens.map(s => ({ id: s.id, name: s.name, type: s.type, w: s.width, h: s.height }));
```

Order screens left-to-right then top-to-bottom by `x`/`y` — that is the flow order a
reader assumes, and prototype `reactions` confirm it when present.

Note which library each instance comes from. A violation inside a published component or
a foundation token is a systemic bug hitting every consumer downstream; the same violation
on one screen is local. Say which — it changes both owner and urgency.

## Step 2 — Enumerate and measure

Walk every descendant, **including inside instances**. The failure mode to guard against
is fixating on one control and skipping the grid of similar ones: a row of ten chips is
ten elements, each measured with its own rendered overrides, because a component in
several colour variants is a trap where some pass and some fail. Report an itemised count
equal to the number of elements actually measured.

Figma paint colours are 0–1 floats, and the default page background is `#F5F5F5`, not
white — assuming white silently inflates every ratio measured against bare canvas.

```js
const lin = c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
const mix = (fg, bg, a) => ({ r: fg.r*a + bg.r*(1-a), g: fg.g*a + bg.g*(1-a), b: fg.b*a + bg.b*(1-a) });
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((a, b) => b - a); return (hi + 0.05) / (lo + 0.05); };
const need = (size, weight) => (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
const hex = c => '#' + ['r','g','b'].map(k => Math.round(c[k]*255).toString(16).padStart(2,'0')).join('');

// Effective backdrop: walk up, compositing translucent layers until something opaque.
// Returns { color } when every surface behind the node is a single solid fill, and
// { unmeasurable } when one is not — a ratio against a gradient or a photo is fiction.
function backdrop(node) {
  const stack = [];
  for (let p = node.parent; p && p.type !== 'PAGE'; p = p.parent) {
    if (!('fills' in p) || !Array.isArray(p.fills)) continue;   // no fills, or figma.mixed
    const paints = p.fills.filter(f => f.visible !== false);
    if (!paints.length) continue;
    // fills render bottom-first, so the last visible paint is the one on top.
    const top = paints[paints.length - 1];
    if (paints.length > 1) return { unmeasurable: 'STACKED_FILLS' };
    if (top.type !== 'SOLID') return { unmeasurable: top.type };
    const a = (top.opacity ?? 1) * (p.opacity ?? 1);
    stack.push({ color: top.color, a });
    if (a >= 0.99) break;
  }
  const page = (figma.currentPage.backgrounds || []).find(b => b.type === 'SOLID');
  return { color: stack.reverse().reduce((bg, l) => mix(l.color, bg, l.a),
    page ? page.color : { r: 0.96, g: 0.96, b: 0.96 }) };
}

// `screen` is one entry from Step 1. One text node can hold several fills, so measure
// per styled segment, not per node.
const fails = [], notices = [];
for (const t of screen.query('TEXT')) {
  const back = backdrop(t);                          // per node, not per segment
  if (back.unmeasurable) {
    notices.push({ id: t.id, name: t.name, code: 'Figma.1_4_3.UnmeasurableBackdrop',
      backdrop: back.unmeasurable });
    continue;
  }
  const bg = back.color;
  for (const s of t.getStyledTextSegments(['fills', 'fontSize', 'fontWeight', 'textCase'])) {
    const f = (s.fills || []).find(p => p.visible !== false && p.type === 'SOLID');
    if (!f) continue;
    const fg = mix(f.color, bg, (f.opacity ?? 1) * (t.opacity ?? 1));
    const r = ratio(fg, bg), req = need(s.fontSize, s.fontWeight);
    if (r < req) fails.push({ id: t.id, name: t.name, sample: s.characters.slice(0, 24),
      code: `WCAG2AA.Principle1.Guideline1_4.1_4_3.${req === 3 ? 'G145' : 'G18'}.Fail`,
      fg: hex(fg), bg: hex(bg), ratio: +r.toFixed(2), need: req });
  }
}
return { fails, notices };
```

`node.query('TEXT')` beats a `findAll` predicate, and `getStyledTextSegments` is the only
way to catch a mixed-fill text node — a heading whose last word is a lighter accent fails
on that word alone, and a node-level read never sees it.

Text on a gradient, an image, or a video has no single backdrop colour, so it produces a
notice rather than a ratio. Reporting "unmeasurable, needs a human" is the honest result;
`backdrop()` returning some ancestor's colour instead would be a confident wrong number,
which is worse than no number.

Then run the remaining passes against the same enumeration:

**Non-text contrast (1.4.11).** Icons, input borders, focus rings, and chart marks need
3:1. Nothing automated catches these later, so they are worth the care here.

**Typography.** Body text under 16px, line height under 1.5× for paragraphs,
letter-spacing under -1%, measure beyond ~75 characters. `textCase === 'UPPER'` on
anything longer than a short label is a finding: all-caps slows dyslexic readers, and
where the underlying string is genuinely uppercase some screen readers spell it out.
Display and editorial faces at small sizes measure as conformant while reading poorly —
the ratio comes from the fill colour and ignores stroke weight.

**Target size (2.5.8).** 24×24px minimum with a spacing exception; 44×44px is the
practical mobile target. Measure `absoluteBoundingBox` on the *hit area*, not the glyph —
a 16px icon in a 24px frame with no padding is a fail. Flag adjacent targets under 24px
apart.

**Structure and order.** Layer order is bottom-to-top, reading order is top-to-bottom.
Auto layout serializes predictably; absolutely positioned children do not. Flag any
absolutely positioned interactive element, any layer whose visual position contradicts its
tree position, and generic names (`Frame 427`, `Rectangle 12`) on anything interactive —
the layer name is what the developer inherits.

**States.** Every interactive component needs default, hover, focus, active, disabled, and
where relevant error as real variants. A missing focus variant is high severity: undesigned
means it ships as `outline: none`. Check disabled and placeholder styles especially —
that is where most contrast failures hide, and "it's disabled so it doesn't count" only
holds if the control is genuinely non-interactive.

**Reflow and independence.** Fixed-width text containers break at 200% zoom. Flag
hug-vs-fill choices that will clip translated strings — French runs roughly 15–25% longer
than English, which matters under RGAA. Verify nothing is conveyed by colour alone (a red
border with no error text, a green dot with no label).

**Never in scope:** a plain shape with nothing on top of it. A decorative rectangle, a
swatch, an empty placeholder has no contrast requirement and must not be flagged. Contrast
exists between content and the surface behind it, or not at all.

## Step 3 — Mark up the canvas

This is the deliverable, not an optional extra. Write **one consolidated annotation per
element** listing all of that element's issues — never one pin per criterion, which floods
the frame.

**Only some node types accept annotations.** Frames, components, component sets, and
instances do (via `BaseFrameMixin`), as do the leaf shapes: `RECTANGLE`, `LINE`, `ELLIPSE`,
`POLYGON`, `STAR`, `VECTOR`, `TEXT`, `TEXT_PATH`. **`GROUP`, `SECTION`, `BOOLEAN_OPERATION`,
`SLICE`, and `PAGE` do not** — which matters constantly, because grouped icons and
section-wrapped flows are everywhere. Resolve each finding to its nearest annotatable
ancestor and merge anything that lands on the same node:

```js
const ANNOTATABLE = 'FRAME, COMPONENT, COMPONENT_SET, INSTANCE, RECTANGLE, LINE, ELLIPSE, ' +
  'POLYGON, STAR, VECTOR, TEXT, TEXT_PATH';
const canPin = new Set(ANNOTATABLE.split(', '));
const host = n => { for (let p = n; p; p = p.parent) if (canPin.has(p.type)) return p; return null; };

const cats = await figma.annotations.getAnnotationCategoriesAsync();
const cat = cats.find(c => c.label === 'Accessibility Review')
  || await figma.annotations.addAnnotationCategoryAsync({ label: 'Accessibility Review', color: 'red' });

// The category id — not a text prefix — is what marks a pin as this skill's. It needs no
// string parsing, and it leaves the designer's own pins and the blue specs below untouched.
const ours = a => a.categoryId === cat.id;

const nodes = new Map();                       // id -> node: everything this run rewrites
const lines = new Map();                       // id -> finding lines for that node
for (const f of findings) {
  const h = host(await figma.getNodeByIdAsync(f.id)); if (!h) continue;
  nodes.set(h.id, h);
  if (!lines.has(h.id)) lines.set(h.id, []);
  lines.get(h.id).push(f.line);
}
// Sweep in every node already pinned by this category, including ones with no finding now
// — without this a fixed issue keeps its pin forever. Restrict the query to annotatable
// types: reading `.annotations` on a GROUP throws.
for (const n of screen.query(ANNOTATABLE)) if ((n.annotations || []).some(ours)) nodes.set(n.id, n);
nodes.set(screen.id, screen);                  // the summary pin lives on the screen frame

const mutated = [];
for (const [id, node] of nodes) {
  const keep = (node.annotations || []).filter(a => !ours(a));    // never clobber anyone else's
  const mine = [], ls = lines.get(id) || [];
  if (ls.length) {
    const head = `${ls.length} issue${ls.length > 1 ? 's' : ''}`;
    mine.push({ categoryId: cat.id,
      labelMarkdown: figma.util.normalizeMarkdown([`**${head}**`, ...ls].join('\n\n')) });
  }
  if (id === screen.id) mine.push({ categoryId: cat.id,
    labelMarkdown: figma.util.normalizeMarkdown(
      `**Summary** — ${counts.error} errors · ${counts.warning} warnings · ${counts.notice} notices`) });
  node.annotations = [...keep, ...mine];       // `mine` empty ⇒ our pin is gone. That is the idempotency.
  mutated.push(id);
}
return { mutatedNodeIds: mutated };
```

Write `labelMarkdown` alone rather than `label` and `labelMarkdown` together, and never
identify a pin by reading `label` back — a pin written with markdown has no plain `label`,
so a prefix filter on it silently matches nothing and every re-run stacks another pin.

Each line reads plain language first, then the criterion, then the fix — three lines, in
that order, every time. Plain language first because the designer reads it first; the
criterion second because it is what turns a complaint into a citation; the fix last because
it is what they actually do next:

```
Text too light — 3.07:1, needs 4.5:1
1.4.3 Contrast (Minimum) · AA · G18.Fail
Fix: bind fill to Core/color/text-primary (7.2:1)
```

The middle line is `ref(sc)` from the map above, never a name typed from memory.

The summary pin — `error`/`warning`/`notice` counts for that screen — goes on the screen
frame in the same pass, so one write per node covers everything this skill puts there. A
flow's roll-up cannot live on the Section, which takes no annotations, so print that in chat
and in the report instead.

Re-running is idempotent **only because of the sweep**. Findings alone can never clear a
pin: a node that now passes produces no finding, so a loop driven by findings never visits
it and its stale pin survives every re-run. The loop has to visit every node the category
already marks and rewrite it to an empty list. Finish with `await screen.screenshot()` to
confirm the markup landed where you think it did.

Categories are shared document state — reuse `Accessibility Review` rather than creating a
near-duplicate on every run, and keep a second `Accessibility` category (blue) for resolved
specs that downstream handoff should keep, so fixing an issue doesn't erase the decision.
Filtering by `categoryId` is what keeps the two apart, and it is why the sweep can safely
rewrite a node it has never seen before.

## Step 4 — Report

Print the report in chat in full. Figma's agent has no filesystem, so the inline paste is
the only delivery that always works — where the environment does have one, also write it to
the code directory. Group by pa11y type so it lines up with a CI run:

```
## Accessibility audit — [selection name]

**Scope:** 4 screens · 118 elements measured · **Standard:** WCAG 2.2 AA
**Summary:** 6 errors · 3 warnings · 5 notices

### Errors
- **[1.4.3 Contrast (Minimum) · AA](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum)**
  — Checkout / Button "Continue"
  Measured 3.07:1 on #FFFFFF, needs 4.5:1. Fix: bind `Core/color/text-on-brand` (7.2:1).
  `WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail`

### Warnings

### Needs verification in the build (5)
- **[1.4.10 Reflow · AA](https://www.w3.org/WAI/WCAG22/Understanding/reflow)** — Checkout / Order summary
  Fixed 480px wide in the design. Check it reflows at 320px with no horizontal scroll.
- **[1.1.1 Non-text Content · A](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content)** — Checkout / Hero illustration
  Marked decorative on canvas. Check it ships as `alt=""` and is not announced.
```

Lead each entry with the linked criterion and keep the runner code on its own line beneath.
The criterion is what a reader acts on; the code is what a CI log matches against, and
putting it first buries the finding under a string most readers cannot parse.

**The last section is the handoff, and for most audits it is the only one needed.** It
carries the findings the canvas raised but cannot settle, written so a developer can act on
them with whatever tooling their team already runs. Each entry names the criterion, the
layer, what the design shows, and the one thing to check in the build — and **never a
selector, a route, or a tool**, because the design file knows none of the three. A designer
can paste this straight into a ticket without editing it, which is the test it has to pass.

Itemise every element measured, passes included. An audit that lists four failures out of
forty elements and an audit that only looked at four are indistinguishable unless the
count is stated.

## Step 5 — Flow-level checks

Only when the selection is a flow. These criteria are invisible on any single screen,
which is the whole reason to audit a flow as one object:

- **[3.3.7 Redundant Entry · A](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry).** Does a later step re-ask for
  something already given?
- **[3.2.4 Consistent Identification · AA](https://www.w3.org/WAI/WCAG22/Understanding/consistent-identification).** The same
  control keeps the same label and icon across steps — "Continue" must not become "Next" on
  screen 3.
- **[3.2.3 Consistent Navigation · AA](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation).** Shared navigation
  keeps its relative order.
- **[3.3.1 Error Identification · A](https://www.w3.org/WAI/WCAG22/Understanding/error-identification)** and
  **[3.3.3 Error Suggestion · AA](https://www.w3.org/WAI/WCAG22/Understanding/error-suggestion).** The flow includes error states,
  with text and an icon, and a suggested correction — not a red border alone.
- **[3.3.4 Error Prevention (Legal, Financial, Data) · AA](https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data).**
  The last irreversible step is confirmable or reversible.
- **[2.4.11 Focus Not Obscured (Minimum) · AA](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).** Sticky
  headers and bottom bars don't cover the element that would hold focus.

A designed happy path with no error state is itself a finding — report the gap rather than
auditing only what was drawn.

## Step 6 — Fix

- **Bind to variables, never hardcode.** A pasted hex is a future drift bug. Use
  `search_design_system` before concluding no token exists; if none does, propose one
  rather than inventing a value. pa11y's contrast message ends with a recommended hex — do
  one better and recommend the nearest **passing token**, so the fix survives a re-theme.
- **Fix at the highest level that resolves it.** Forty screens failing on one bad Core
  token is one fix plus a blast-radius note, not forty patches.
- **Never detach an instance to fix it.** Detaching cures the symptom and breaks the
  system — if the fix needs a detach, it is a component-level finding, so report it.
- **Preserve intent.** If darkening a brand colour breaks brand compliance, present the
  tradeoff (larger text, a text-only dark variant, added weight) rather than overriding it.
- Re-measure changed nodes, re-run Step 3 to clear resolved pins, re-screenshot.

## Step 7 — The pa11y config, on request

### Do not emit this unless the user asks

The Step 4 handoff list already tells a developer what to check, in a form that needs no
selectors and assumes no tooling. This step exists for the narrower case where a team wants
those checks to **re-run on every commit** — which is the one thing a canvas annotation
genuinely cannot do, since a pin is a point-in-time note and CI is not.

Offer it once, in a single line at the end of the report, and only when both are true: the
handoff list is non-empty, **and** the user has mentioned a codebase, a repo, or CI. A
designer auditing a concept has no use for it, and the config nobody asked for is what makes
this step feel like homework rather than a deliverable.

When they do ask, the rest of this step applies — starting with whether the findings justify
one at all. An audit whose findings are all errors Step 2 measured and Step 6 fixed has
nothing for CI to carry; say so rather than emitting a file that tests nothing:

| Finding | Becomes |
| --- | --- |
| Focus / error / disabled variant that only exists at runtime | An `actions` sequence driving the page into that state |
| Reflow (`Figma.1_4_10.Reflow`) | A second URL entry at `viewport: { width: 320 }` |
| Alt text, labels, heading level — annotated on canvas, provable only in the DOM | A plain URL entry; `htmlcs` and `axe` check it |
| Text on a gradient or photo (`Figma.1_4_3.UnmeasurableBackdrop`) | A URL entry — `axe` reads the rendered pixel the canvas could not |
| Everything the canvas already measured and fixed | Nothing. It is already resolved. |

### Print it inline, in chat

**Paste the config in chat in full, inside a fenced block**, named `.pa11yci` at the repo
root — that is the filename `pa11y-ci` looks for with no arguments, and `.pa11yci.json` if
the team prefers an extension. Figma's agent has no filesystem, so the inline paste is the
only delivery that always works; where the environment does have one, also write the file.
Place it as a canvas text node **only if the user asks** — a config that lives in the design
file is a config nobody runs.

Figma has no DOM, so every route and selector below is a guess. Write guesses as
`REPLACE_*` placeholders:

```json
{
  "defaults": {
    "standard": "WCAG2AA",
    "runners": ["htmlcs", "axe"],
    "threshold": 6
  },
  "urls": [
    {
      "url": "REPLACE_ORIGIN/checkout",
      "viewport": { "width": 320, "height": 640 },
      "actions": [
        "set field REPLACE_SELECTOR_email to not-an-email",
        "click element REPLACE_SELECTOR_submit",
        "wait for element REPLACE_SELECTOR_email_error to be visible"
      ]
    }
  ]
}
```

### Then print the fill-in table

One row per placeholder, naming the layer it came from. **This table is what makes the
config worth emitting from a design audit rather than copying from pa11y's README** — it
turns "wire this up somehow" into a short list of lookups, each already pointing at the
element it means:

| Placeholder | Layer it came from | Replace with |
| --- | --- | --- |
| `REPLACE_ORIGIN` | — | The origin you test, e.g. `https://staging.example.com` |
| `REPLACE_SELECTOR_email` | `Checkout / Form / Email input` | That input's selector |
| `REPLACE_SELECTOR_submit` | `Checkout / Button "Continue"` | That button's selector |
| `REPLACE_SELECTOR_email_error` | `Checkout / Form / Error — email` | The error message's selector |

A placeholder left in place fails loudly: pa11y reports no element matching
`REPLACE_SELECTOR_email`, and the run stops. That is the intended behaviour. A guessed
`#email` that happens to match the wrong field passes silently, and reports green on a form
nobody tested — which is the failure mode worth designing out.

### Notes on the values

- Set `threshold` to the error count **this audit measured** when adopting on an existing
  product — a ratchet that can only go down beats a red build everyone learns to ignore. On
  a greenfield build use `0`. The example says `6` because the Step 4 report said 6 errors.
- `runners: ["htmlcs", "axe"]` is deliberate: `axe` alone carries `target-size` for 2.5.8,
  and the two disagree often enough that either alone under-reports.
- Each **overlay, banner, or third-party embed** the design excludes becomes a
  `hideElements` selector, so the report is about the team's own code — as a placeholder
  like the rest, never as a plausible `#cookie-banner`.
- One vocabulary collision, since the config gets read next to the report: this skill's
  `notice` means *needs a human or a runtime check*, while pa11y's `notice` type is an
  informational row in its own output. They are unrelated. Do not reach for
  `"ignore": ["notice"]` — it suppresses pa11y's rows and does nothing to the findings this
  step just carried across.

Run with `pa11y-ci` (add `--sitemap` for whole-site sweeps), or one page at a time via
`pa11y --standard WCAG2AA --runner axe --reporter json <url>` when comparing a specific fix
against its design-time measurement.

## Gotchas

| Symptom | Cause |
| --- | --- |
| `annotations` assignment fails | Node is a `GROUP`, `SECTION`, `BOOLEAN_OPERATION`, `SLICE`, or `PAGE` — resolve to an annotatable host |
| Designer says they see no pins | Annotations are toggled off: Main menu → View → Annotations. Viewing needs a Full or Dev seat |
| Ratios all suspiciously high | Backdrop assumed white; the page default is `#F5F5F5` |
| A heading passes but one word is illegible | Read `getStyledTextSegments`, not `node.fills` — mixed fills hide inside one node |
| Re-run stacks a second pin instead of replacing the first | The pin was written with `labelMarkdown` and filtered by reading `label` — filter on `categoryId` |
| A fixed issue keeps its pin forever | The rewrite loop only visited nodes with findings — sweep every node the category already marks |
| `node.annotations` throws `no such property` | Read on a `GROUP`, `SECTION`, `BOOLEAN_OPERATION`, or `SLICE` — restrict the query to annotatable types |
| Contrast measured against the wrong surface | `fills.find(…)` takes the **bottom** paint; the one on top is `fills[fills.length - 1]` |
| A confident ratio on text over a photo or gradient | The backdrop is not a solid colour — return unmeasurable and raise a notice, never a number |
| `figma.util.colorToHex` is not a function | It doesn't exist. `figma.util` has `rgb`, `rgba`, `solidPaint`, `normalizeMarkdown`, `getSfSymbolCharacter` |
| Text mutation throws | Load fonts first: `await figma.loadFontAsync(node.fontName)` |
| Fill change runs clean, nothing happens | Paints are immutable — clone the array and reassign |
| `fills` reads as `figma.mixed` | Values differ across children — guard with `Array.isArray` |
| Script returns nothing | `console.log` isn't visible; use top-level `await` and `return` |
| Plugin dies mid-run | Never call `figma.closePlugin()`; `figma.notify()` is not implemented |

Return every mutated node ID so findings can be re-verified, and work in small batches —
roughly ten logical operations per call — rather than one script that annotates a flow.

## Regulatory notes

WCAG 2.2 AA is the unifying technical standard across all three frameworks — audit once,
map the result.

- **US (ADA / Section 508):** Section 508 references WCAG 2.0 AA, ADA Title II now
  references WCAG 2.1 AA. Auditing to 2.2 AA satisfies both. pa11y's `Section508` standard
  was removed from HTML_CodeSniffer — use `WCAG2AA`.
- **UK (Equality Act / PSBAR):** public sector bodies target WCAG 2.2 AA and must publish
  an accessibility statement — flag findings that would need disclosing.
- **France (RGAA):** a test methodology layered on WCAG with its own numbering and a
  mandatory declaration. Findings map to WCAG criteria; if RGAA numbers are needed, say the
  mapping is required rather than guessing. String-length expansion is a compliance issue
  here, not a layout nicety.

---

Credit: Originally written by @marktoadvine (Mark Toadvine) for Figma agents, inspired by original work done by jakubkrehel/skills.
