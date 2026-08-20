---
name: better-accessibility
description: Audits a selected Figma frame, component, or multi-screen user flow against WCAG 2.2 AA using measured values, marks up the canvas with Figma annotation fixes, and emits a pa11y config (.json) so the criteria a static design cannot prove can be separately verified in CI.
---

# Better Accessibility (Figma)

Audit what is selected — a frame, a component, or a whole user flow — against WCAG 2.2 AA
with measured values, pin the findings onto the canvas as annotations the designer can act
on, fix what is safely fixable, and hand the rest to [pa11y](https://pa11y.org) as a
runnable config instead of a paragraph of good intentions.

Two rules govern everything below. **Measure, never eyeball** — every ratio, px size, and
gap is computed from resolved values, never judged from a screenshot. And **never claim a
design "passes WCAG"** — a design can only be *contrast-conformant and structurally
sound*; conformance is a property of the built product.

The audit will produce a pa11y config in json. Instruct the prompter to
replace the blank URLs within this file with their actual routes on their live environment, to run pa11y-ci against the codebase, targetting exactly what their Figma designs had failed in.

## What gets checked where

Figma has no DOM, so there is nothing to inspect for ARIA, semantics, or tab order. pa11y
has a DOM but no design intent, so it cannot tell a decorative rectangle from a missing
icon. Each covers the other's blind spot, and some things neither can settle:

| This skill checks on canvas | pa11y checks in build | Neither — needs a human |
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
| `notice` | 3 | Needs a human or a runtime check. Becomes a pa11y config entry, not a fix. |

Order findings by user impact, never by how easy they are to fix.

## Issue codes

Every finding carries a code. Where a build-time runner would emit the same defect, use
**its** code verbatim — the design finding and the CI failure then collapse into one row.
Where no runner covers it, use the `Figma.` namespace, which is this skill's, not pa11y's.

| Check | Code | Caught in build by |
| --- | --- | --- |
| Text contrast, normal | `WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail` | `htmlcs`, `axe` |
| Text contrast, large | `WCAG2AA.Principle1.Guideline1_4.1_4_3.G145.Fail` | `htmlcs`, `axe` |
| Image missing alt | `WCAG2AA.Principle1.Guideline1_1.1_1_1.H37` | `htmlcs`, `axe` |
| Input without label | `WCAG2AA.Principle1.Guideline1_3.1_3_1.F68` | `htmlcs`, `axe` |
| Empty heading | `WCAG2AA.Principle1.Guideline1_3.1_3_1.H42.2` | `htmlcs` |
| Link purpose unclear | `WCAG2AA.Principle2.Guideline2_4.2_4_4.H77,H78,H79,H80,H81` | `htmlcs` |
| Target size < 24px | `Figma.2_5_8.TargetSize` | `axe` only |
| Non-text contrast < 3:1 | `Figma.1_4_11.NonTextContrast` | nothing |
| No focus variant designed | `Figma.2_4_7.NoFocusVariant` | nothing automatic |
| Reflow / fixed width | `Figma.1_4_10.Reflow` | pa11y at 320px |
| Meaning by colour alone | `Figma.1_4_1.ColorOnly` | nothing |
| Body text < 16px, line height < 1.5 | `Figma.1_4_12.TextSpacing` | nothing |
| Re-asks data from an earlier step | `Figma.3_3_7.RedundantEntry` | nothing — flow-level |
| Control renamed between steps | `Figma.3_2_4.InconsistentIdentification` | nothing — flow-level |

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
function backdrop(node) {
  const stack = [];
  for (let p = node.parent; p && p.type !== 'PAGE'; p = p.parent) {
    const f = Array.isArray(p.fills) && p.fills.find(f => f.visible !== false && f.type === 'SOLID');
    if (!f) continue;
    const a = (f.opacity ?? 1) * (p.opacity ?? 1);
    stack.push({ color: f.color, a });
    if (a >= 0.99) break;
  }
  const page = (figma.currentPage.backgrounds || []).find(b => b.type === 'SOLID');
  return stack.reverse().reduce((bg, l) => mix(l.color, bg, l.a),
    page ? page.color : { r: 0.96, g: 0.96, b: 0.96 });
}

// One text node can hold several fills. Measure per styled segment, not per node.
const fails = [];
for (const t of screen.query('TEXT')) {
  for (const s of t.getStyledTextSegments(['fills', 'fontSize', 'fontWeight', 'textCase'])) {
    const f = (s.fills || []).find(p => p.visible !== false && p.type === 'SOLID');
    if (!f) continue;
    const bg = backdrop(t);
    const fg = mix(f.color, bg, (f.opacity ?? 1) * (t.opacity ?? 1));
    const r = ratio(fg, bg), req = need(s.fontSize, s.fontWeight);
    if (r < req) fails.push({ id: t.id, name: t.name, sample: s.characters.slice(0, 24),
      fg: hex(fg), bg: hex(bg), ratio: +r.toFixed(2), need: req });
  }
}
return fails;
```

`node.query('TEXT')` beats a `findAll` predicate, and `getStyledTextSegments` is the only
way to catch a mixed-fill text node — a heading whose last word is a lighter accent fails
on that word alone, and a node-level read never sees it.

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
const ANNOTATABLE = new Set(['FRAME','COMPONENT','COMPONENT_SET','INSTANCE','RECTANGLE',
  'LINE','ELLIPSE','POLYGON','STAR','VECTOR','TEXT','TEXT_PATH']);
const host = n => { for (let p = n; p; p = p.parent) if (ANNOTATABLE.has(p.type)) return p; return null; };

const cats = await figma.annotations.getAnnotationCategoriesAsync();
const cat = cats.find(c => c.label === 'Accessibility Review')
  || await figma.annotations.addAnnotationCategoryAsync({ label: 'Accessibility Review', color: 'red' });

// Group findings by host node, then write one pin each. Replaces only our [A11Y] pin.
const byHost = new Map();
for (const f of findings) {
  const h = host(await figma.getNodeByIdAsync(f.id)); if (!h) continue;
  (byHost.get(h) ?? byHost.set(h, []).get(h)).push(f.line);
}
const mutated = [];
for (const [node, lines] of byHost) {
  const others = (node.annotations || []).filter(a => !/^\[A11Y\]/.test(a.label || ''));
  const head = `${lines.length} issue${lines.length > 1 ? 's' : ''}`;
  node.annotations = lines.length ? [...others, { categoryId: cat.id, label: `[A11Y] ${head}`,
    labelMarkdown: figma.util.normalizeMarkdown([`**${head}**`, ...lines].join('\n\n')) }] : others;
  mutated.push(node.id);
}
return { mutatedNodeIds: mutated };
```

Each line reads plain language first, code second, and always carries the fix:

```
Text too light — 3.07:1, needs 4.5:1 (1.4.3 · G18.Fail)
Fix: bind fill to Core/color/text-primary (7.2:1)
```

Then put a `[SUMMARY]` pin on **each screen frame** — `error`/`warning`/`notice` counts for
that screen. A flow's roll-up cannot live on the Section, so print it in chat and in the
report instead. Re-running is idempotent: anything now passing gets an empty `lines` array
and its pin disappears, so the canvas never carries a stale count. Finish with
`await screen.screenshot()` to confirm the markup landed where you think it did.

Categories are shared document state — reuse `Accessibility Review` rather than creating a
near-duplicate on every run, and keep a second `Accessibility` category (blue) for resolved
specs that downstream handoff should keep, so fixing an issue doesn't erase the decision.

## Step 4 — Report

Save it to a file where the environment allows, and always print it. Group by pa11y type
so it lines up with a CI run:

```
## Accessibility audit — [selection name]

**Scope:** 4 screens · 118 elements measured · **Standard:** WCAG 2.2 AA
**Summary:** 6 errors · 3 warnings · 5 notices

### Errors
- `WCAG2AA.Principle1.Guideline1_4.1_4_3.G18.Fail` — Checkout / Button "Continue"
  Measured 3.07:1 on #FFFFFF, needs 4.5:1. Fix: bind `Core/color/text-on-brand` (7.2:1).

### Warnings
### Notices — carried into .pa11yci
```

Itemise every element measured, passes included. An audit that lists four failures out of
forty elements and an audit that only looked at four are indistinguishable unless the
count is stated.

## Step 5 — Flow-level checks

Only when the selection is a flow. These criteria are invisible on any single screen,
which is the whole reason to audit a flow as one object:

- **3.3.7 Redundant Entry (A).** Does a later step re-ask for something already given?
- **3.2.4 Consistent Identification (AA).** The same control keeps the same label and icon
  across steps — "Continue" must not become "Next" on screen 3.
- **3.2.3 Consistent Navigation (AA).** Shared navigation keeps its relative order.
- **3.3.1 / 3.3.3 Error paths.** The flow includes error states, with text and an icon, and
  a suggested correction — not a red border alone.
- **3.3.4 Error Prevention (AA).** The last irreversible step is confirmable or reversible.
- **2.4.11 Focus Not Obscured (AA).** Sticky headers and bottom bars don't cover the
  element that would hold focus.

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

## Step 7 — Emit the pa11y config

The notices are the point of this step: everything the canvas could not verify becomes
something the team can actually run. Print it in chat, and where the environment cannot
write files, place it as a text node beside the flow so it travels with the design.

```json
{
  "defaults": {
    "standard": "WCAG2AA",
    "runners": ["htmlcs", "axe"],
    "threshold": 0,
    "hideElements": "#cookie-banner",
    "ignore": ["notice"]
  },
  "urls": [
    { "url": "http://localhost:3000/checkout",
      "viewport": { "width": 320, "height": 640 },
      "actions": [
        "set field #email to not-an-email",
        "click element #submit",
        "wait for element #email-error to be visible"
      ] }
  ]
}
```

Derive it from what the audit saw, not from a template:

- Each **variant state** becomes an `actions` sequence, because pa11y only ever sees the
  default state otherwise. A designed error state is worth nothing in CI until something
  drives the form into it — and Step 5 already found the screens that do.
- Each **reflow finding** becomes a second URL entry at `viewport: { width: 320 }`.
- Each **overlay, banner, or third-party embed** the design excludes becomes
  `hideElements`, so the report is about the team's own code.
- Set `threshold` to the current error count, not 0, when adopting on an existing product —
  a ratchet that can only go down beats a red build everyone learns to ignore.
- `runners: ["htmlcs", "axe"]` is deliberate: `axe` alone carries `target-size` for 2.5.8,
  and the two disagree often enough that either alone under-reports.

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
| `figma.util.colorToHex` is not a function | It doesn't exist. `figma.util` has `rgb`, `rgba`, `solidPaint`, `normalizeMarkdown` |
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

## Credit

Written by Mark Toadvine (@marktoadvine) for Figma agents, inspired by original work done by jakubkrehel/skills.
