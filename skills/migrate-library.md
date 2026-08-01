---
name: migrate-library
description: Relink a Figma selection's styles, variables, tokens, and component instances onto a different published library, without changing how anything looks. Use whenever the user wants to move designs onto a new or updated design system, swap out a deprecated library, relink local styles or tokens to a published library, migrate component instances to a new component library, or says something like "update this frame to use the new library." Discovers the target library's contents at runtime, so it works with any library rather than one specific design system.
---

# Migrate a Figma selection to a published library

Repoint every design decision in the selection — colors, spacing, radii, type, effects,
components — at a target published library, leaving the visual result identical. Nothing
is assumed about the library: its contents are discovered at runtime, mappings are derived
from what exists on both sides, and ambiguity is confirmed rather than guessed.

Run all scripts through `use_figma` with `figma-use` in the `skillNames` parameter. Code is
auto-wrapped in an async context — use top-level `await`, and `return` explicitly, since
only the returned value is visible and `console.log` is not.

## Setup

The target library must be **enabled on the current file** (Assets panel → book icon →
toggle it on). No API can enable it, so if it isn't on, stop and ask the user to do it.

Work on the selection only, never the whole page — users select a frame because they want
that frame migrated, often as a trial before committing to the rest.

## Step 1 — Resolve the target library

Variable collections come from the current file, free:

```js
const colls = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
const out = [];
for (const c of colls) {
  const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key);
  out.push({ library: c.libraryName, collection: c.name, key: c.key,
    variables: vars.map(v => ({ name: v.name, key: v.key, type: v.resolvedType })) });
}
return { libraries: [...new Set(colls.map(c => c.libraryName))], collections: out };
```

Match the user's named target against `libraries`. No match means it isn't enabled. Several
plausible matches means ask.

Two things to notice in the result. **Not every collection is published** — design systems
often keep a primitives layer private on purpose, so semantic tokens are the only public
surface. What isn't listed cannot be imported at all; map through values instead (Step 4).
And **collection names vary**, so classify by `resolvedType` (`COLOR`, `FLOAT`, `STRING`),
not by labels like "Color" or "Sizing".

## Step 2 — Inventory the library's styles and components

Styles and components have no `teamLibrary` API, so the library file has to be read
directly. Two ways, depending on the environment:

**If the tool accepts a `fileKey`**, ask for the library's URL and take the key from
`figma.com/design/<FILE_KEY>/...`, then run the script below against it. Verify the
returned `fileName` differs from the working file — if it matches, the key was ignored and
the environment doesn't support cross-file reads, so use the second path.

**Otherwise**, ask the user to open the library file in a tab, run the script there, keep
the result, and switch back. Slightly manual, but it works everywhere and only needs doing
once per library.

```js
const FILTER = null; // e.g. /button|card|input/i — set to families in the selection
const keep = n => !FILTER || FILTER.test(n);
const [paints, texts, effects] = await Promise.all([
  figma.getLocalPaintStylesAsync(), figma.getLocalTextStylesAsync(), figma.getLocalEffectStylesAsync()]);
const out = {
  fileName: figma.root.name, // confirm this is the library, not the working file
  paintStyles: paints.map(s => ({ name: s.name, key: s.key, paints: s.paints })),
  textStyles: texts.map(s => ({ name: s.name, key: s.key, family: s.fontName.family,
    style: s.fontName.style, size: s.fontSize, lineHeight: s.lineHeight })),
  effectStyles: effects.map(s => ({ name: s.name, key: s.key, effects: s.effects })),
  componentSets: [], components: [] };
await figma.loadAllPagesAsync(); // required before findAllWithCriteria sees other pages
for (const page of figma.root.children) {
  for (const cs of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
    if (keep(cs.name)) out.componentSets.push({ name: cs.name, key: cs.key,
      variants: cs.children.map(v => ({ name: v.name, key: v.key })) });
  }
  for (const c of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
    if (keep(c.name) && !(c.parent && c.parent.type === 'COMPONENT_SET'))
      out.components.push({ name: c.name, key: c.key });
  }
}
return out;
```

Set `FILTER` once the audit shows which component families are present — an unfiltered
inventory of a mature library runs to tens of thousands of tokens. Collect *values*, not
just names: a library's `Body/Regular` and a local `text-16-normal` are the same style if
their font properties agree, and no name parsing will tell you that.

Do not read variables here. Keys obtained by reading a file directly fail on
`importVariableByKeyAsync` — Step 1 is the only valid source.

## Step 3 — Audit the selection

```js
const sel = figma.currentPage.selection;
if (!sel.length) return { error: 'Select the frame(s) to migrate.' };
const LAYOUT = ['itemSpacing','counterAxisSpacing','paddingTop','paddingBottom','paddingLeft',
  'paddingRight','topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius','strokeWeight'];
const STYLES = ['fillStyleId','strokeStyleId','effectStyleId','textStyleId'];
const vc = new Map(), sc = new Map();
const gv = async id => { if (!vc.has(id)) vc.set(id, await figma.variables.getVariableByIdAsync(id).catch(() => null)); return vc.get(id); };
const gs = async id => { if (!sc.has(id)) sc.set(id, await figma.getStyleByIdAsync(id).catch(() => null)); return sc.get(id); };
const out = { colorVars: {}, layoutVars: {}, styles: {}, unstyledText: [], localInstances: {} };
const put = (b, k, e) => { (b[k] = b[k] || []).push(e); };
const nodes = [];
for (const r of sel) { nodes.push(r); if (r.findAll) nodes.push(...r.findAll(() => true)); }
for (const n of nodes) {
  const w = { node: n.name, id: n.id, type: n.type };
  for (const p of ['fills', 'strokes']) {
    if (!Array.isArray(n[p])) continue; // also filters figma.mixed
    for (const paint of n[p]) {
      const b = paint.boundVariables && paint.boundVariables.color;
      if (b) { const v = await gv(b.id); if (v && !v.remote) put(out.colorVars, v.name, { ...w, prop: p }); }
    }
  }
  for (const f of LAYOUT) {
    const ref = (n.boundVariables || {})[f];
    if (ref) { const v = await gv(ref.id); if (v && !v.remote) put(out.layoutVars, v.name, { ...w, field: f }); }
  }
  for (const f of STYLES) {
    const id = n[f];
    if (typeof id === 'string' && id) { const s = await gs(id); if (s && !s.remote) put(out.styles, s.name, { ...w, field: f }); }
  }
  if (n.type === 'TEXT' && n.textStyleId === '') {
    const mixed = n.fontName === figma.mixed;
    out.unstyledText.push({ ...w, family: mixed ? 'MIXED' : n.fontName.family,
      style: mixed ? 'MIXED' : n.fontName.style, size: n.fontSize === figma.mixed ? 'MIXED' : n.fontSize });
  }
  if (n.type === 'INSTANCE') {
    const m = await n.getMainComponentAsync().catch(() => null);
    if (m && !m.remote) put(out.localInstances,
      m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name, { ...w, variant: m.name });
  }
}
const c = o => Object.keys(o).length;
out.summary = { scanned: nodes.length, colorVars: c(out.colorVars), layoutVars: c(out.layoutVars),
  styles: c(out.styles), unstyledText: out.unstyledText.length, instances: c(out.localInstances) };
out.summary.clean = Object.values(out.summary).slice(1).every(v => v === 0);
return out;
```

Everything reported is still local. Skip any step whose category is already empty. Re-run
this unchanged in Step 6 to verify.

## Step 4 — Build the mappings

Names are a hint; values are the truth. Two systems rarely agree on naming but always agree
on what 16px is and what `#1D5A85` looks like.

**Layout variables** — normalize both sides (lowercase, strip `/`, `-`, `_`, split trailing
digits), match stem synonyms (`space`/`spacing`/`gap`, `radius`/`corner`) plus index, then
confirm by resolved number. If `spacing/12` resolves to 48 and `Space/12` to 32 the scales
don't align — the name match is actively misleading, so match by value and flag the whole
scale, since it affects every binding.

**Colors** — direct name match if primitives are published. Otherwise map primitive →
semantic by resolved RGB. Resolve aliases iteratively with a guard, since a circular alias
in a work-in-progress library hangs the script with no error:

```js
async function resolve(value, modeId) {
  let guard = 0;
  while (value && value.type === 'VARIABLE_ALIAS' && guard++ < 10) {
    const t = await figma.variables.getVariableByIdAsync(value.id); if (!t) return null;
    const coll = await figma.variables.getVariableCollectionByIdAsync(t.variableCollectionId);
    value = t.valuesByMode[modeId] || t.valuesByMode[coll.defaultModeId];
  }
  return value;
}
```

Compare `r`/`g`/`b` with an epsilon of `1e-4` — Figma stores floats and round-tripped values
never compare exactly. Ignore alpha when matching; a token matching on RGB with different
opacity is usually still right. Expect multiple hits: white legitimately backs text,
background, and border tokens. Narrow by where the color is used, deriving the actual
category names from the library's own token paths rather than assuming this vocabulary:

| Used as | Prefer paths starting with |
|---|---|
| Fill on a `TEXT` node | `Text`, `Foreground`, `Content`, `On*` |
| Stroke on any node | `Border`, `Stroke`, `Outline` |
| Fill on a frame or shape | `Background`, `Surface`, `Fill` |
| Fill on a vector or icon | `Icon`, `Foreground` |
| Large translucent overlay | `Utilities`, `Overlay`, `Scrim` |

Still tied? Prefer the least-qualified name — state suffixes (`-hover`, `-pressed`,
`-disabled`) describe situations you cannot verify from a static frame.

**Text styles** — match on `family` + `size` + `style`, never on names, which encode
different things in different orders. With variable fonts `style` may read `Regular` on both
sides while numeric weights differ; text *nodes* expose `fontWeight` and text *styles* don't,
so use it as the tiebreak. No exact size match means a visual change, which this migration is
not allowed to make — report it instead of applying the nearest.

**Components** — match sets by normalized name, then map variant properties by comparing
option lists and what the variants actually render (`Color=Blue` is often `Color=Default`).
Import a **variant** key; a component-set key yields a `COMPONENT_SET`, which `swapComponent`
rejects.

Sort everything into three buckets and show all three before touching anything: **confident**
(apply), **ambiguous** (ask once, batched), **no match** (leave local and report). Resist
acting on the third. Unbinding a token to leave a raw value, or forcing it onto the closest
match, both produce a frame that looks migrated and isn't — an unmapped binding is visible
and fixable, a wrong one is invisible and ships.

## Step 5 — Apply

Import each key once and reuse it; every import is a network call. Work in modest batches
with a verification pass between them rather than one enormous script — roughly ten logical
operations per call — and return the ids you changed so progress is auditable.

```js
const changed = [];

// Layout: spacing, padding, radius, stroke weight
const v = await figma.variables.importVariableByKeyAsync(key);
node.setBoundVariable('itemSpacing', v);

// Color: paints are immutable, so write the array back
const cv = await figma.variables.importVariableByKeyAsync(semanticKey);
const fills = [...node.fills];
fills[i] = figma.variables.setBoundVariableForPaint(fills[i], 'color', cv);
node.fills = fills;

// Styles: keys read from the library file work directly, no teamLibrary needed
const st = await figma.importStyleByKeyAsync(styleKey);
await node.setTextStyleIdAsync(st.id); // also setFillStyleIdAsync, setEffectStyleIdAsync

return { mutatedNodeIds: changed };
```

Mutating `node.fills[i]` in place silently does nothing — the single most common reason a
color migration appears to run cleanly and changes nothing.

**Component swaps** are destructive twice over. Library components often default to `FIXED`
sizing, which breaks an instance that was filling its parent and leaves visible gaps; and
text overrides are lost. Snapshot both, swap, then restore — sizing *after* the swap, since
the swap overwrites it:

```js
const snap = { layoutSizingHorizontal: inst.layoutSizingHorizontal, layoutSizingVertical: inst.layoutSizingVertical,
  layoutAlign: inst.layoutAlign, layoutGrow: inst.layoutGrow, layoutPositioning: inst.layoutPositioning };
const texts = inst.findAll(n => n.type === 'TEXT').map(n => ({ name: n.name, characters: n.characters }));
await inst.swapComponent(await figma.importComponentByKeyAsync(variantKey));
Object.assign(inst, snap);
for (const n of inst.findAll(n => n.type === 'TEXT')) {
  const o = texts.find(t => t.name === n.name);
  if (o && o.characters !== n.characters) { await figma.loadFontAsync(n.fontName); n.characters = o.characters; }
}
```

Fonts must be loaded before writing `characters` or the assignment throws.

Instances nested inside one-off `COMPONENT` definitions get swapped at the **definition**
level — the change cascades to every instance, and going instance-by-instance fights the
cascade. Components with no library equivalent stay as they are structurally, but still get
Steps 4–5 applied to the nodes inside them: a one-off shell is fine, local tokens inside it
are not.

## Step 6 — Verify and report

Re-run Step 3. `summary.clean` should be true, except for instances with no library
equivalent and text nodes with mixed styling — both expected. Anything else means a step
didn't take.

Then tell the user what was rebound by category and count, what had no equivalent and was
deliberately left alone, and anything needing a human decision. A migration that quietly
leaves a third of the frame local looks identical to one that worked; the report is what
makes the difference visible.

## Constraints

- **Preserve visual fidelity.** A migration that changes the design has failed, even if
  every binding is now correct.
- **Never hardcode values.** Every value comes from a style or variable binding. Replacing a
  token with a literal hex or raw number defeats the entire purpose.
- **Preserve text content and layout.** Only token, style, and component references change —
  never strings, positions, sizes, or auto-layout structure.
- **Prefer leaving something local over guessing.**
- **Never call `figma.closePlugin()`.** The plugin lifecycle is managed for you.

## Gotchas

| Symptom | Cause |
|---|---|
| Fill rebind runs clean, nothing changes | Paints are immutable — clone the array and reassign |
| `importVariableByKeyAsync` throws on a visible variable | Key came from reading the file, or its collection is unpublished |
| `swapComponent` throws | A component-set key was imported instead of a variant key |
| Instance wrong size after swap | Library default sizing replaced it — restore the layout snapshot |
| Setting `characters` throws | Font not loaded, or `fontName` is `figma.mixed` |
| `findAllWithCriteria` finds nothing on other pages | Call `figma.loadAllPagesAsync()` first |
| Empty library inventory | Wrong file key, or the key was ignored — check `figma.root.name` |
| Style id reads as `figma.mixed` | Values differ across children or ranges — guard with `typeof id === 'string'` |
