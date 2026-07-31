---
name: migrate-library
description: Migrate a Figma selection onto a different published library — relink every style, variable, token, and component instance from local or deprecated bindings to the target library's published equivalents, without changing how anything looks. Use this whenever the user wants to move designs onto a new or updated design system, swap out a deprecated library, relink local styles/variables/tokens to a published library, migrate component instances to a new component library, or says something like "update this frame to use the new library" or "point these designs at our new design system." The skill discovers the target library's collections, styles, and components at runtime, so it works with any Figma library rather than one specific design system.
---

# Migrate a Figma Selection to a Published Library

Take whatever the user has selected and repoint every design decision in it — colors,
spacing, radii, type, effects, components — at a target published library, while leaving
the visual result identical. Nothing here is specific to a particular design system: the
library's contents are discovered at runtime, every mapping is derived from what actually
exists on both sides, and anything ambiguous is confirmed with the user rather than guessed.

## Requirements

- A Figma MCP connection that exposes `evaluate_script` (running plugin-API code against a
  file), ideally with the ability to target a `fileKey` other than the current file.
- The target library **enabled on the current file**. There is no plugin API to enable a
  library, so if it isn't enabled the user has to do it: Assets panel → book icon →
  toggle the library on. Check this in Step 0 before doing anything else.
- A selection in the current file. Migrate what's selected, never the whole page.

## Bundled scripts

The `scripts/` directory holds ready-made plugin-API code to pass to `evaluate_script`.
They save rewriting the same traversal every run. Each one is written to be the *body* of
an async function, which is how most Figma MCP servers wrap script input — if yours
doesn't, wrap it yourself.

| Script | Run against | Purpose |
|---|---|---|
| `scripts/discover-library-variables.js` | current file | Every published variable collection + importable variable keys |
| `scripts/inventory-library.js` | target library file | Style and component keys, with real font/paint values |
| `scripts/audit-selection.js` | current file | Every local binding in the selection — run before to plan, after to verify |

## Reference material

- `references/mapping-strategies.md` — how to build each mapping table (name matching,
  RGB matching, font-property matching, variant matching) and how to handle ambiguity.
  Read this before Step 4.
- `references/figma-api.md` — API cheat sheet and the failure modes worth knowing about
  in advance. Read this if an import or rebind fails unexpectedly.

## Execution overview

0. Resolve the target library
1. Inventory the library's styles and components
2. Discover the library's published variable collections
3. Audit the selection for local bindings
4. Build the mapping tables and confirm ambiguities
5. Rebind layout variables (spacing, padding, radius, sizing)
6. Rebind color variables
7. Swap component instances
8. Link text, fill, and effect styles
9. Verify

Steps 5–8 are independent of each other. Do them in whatever order suits the selection,
but always finish the audit (3) and the mapping (4) first — rebinding as you discover
things leads to half-migrated frames that are hard to reason about.

---

## Step 0: Resolve the target library

Two things are needed, and they come from different places.

**The library name and its variable collections** come from the current file, free:

```js
const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
// each has { key, name, libraryName }
```

Group the result by `libraryName` to get the list of libraries enabled on this file. If
the user named a target, match it here. If nothing matches, the library isn't enabled —
say so and ask them to enable it, since no script can do it for them. If several libraries
could plausibly be the target, show the list and ask which one.

**The library's file key** is needed separately, because styles and components can only be
enumerated by reading the library file directly — there's no `teamLibrary` API for them.
Ask the user for the library's URL and take the key from it:

```
figma.com/design/<FILE_KEY>/Some-Library-Name
```

Confirm it's the right file by reading `figma.root.name` from it before going further. A
wrong file key produces an empty inventory rather than an error, which is easy to
misread as "the library has no components."

If the MCP server can't target another file key, variables still work through Step 2, but
styles and components can't be enumerated. Say that plainly and migrate what you can
rather than silently skipping Steps 7 and 8.

---

## Step 1: Inventory the library's styles and components

Run `scripts/inventory-library.js` against the library's file key.

It returns paint, text, and effect styles with their keys **and their resolved values** —
actual paint colors, actual `fontName`/`fontSize`/`lineHeight`. Collect values, not just
names, because matching on values is what makes this work across design systems that name
things differently. A library calling something `Body/Regular` and a local style called
`text-16-normal` are the same style if their font properties agree, and no amount of name
parsing will tell you that.

Components are large. The script takes a name filter at the top — set it to the families
actually present in the selection (from Step 3) rather than pulling every component set in
the library. On a big library, an unfiltered inventory can be tens of thousands of tokens.

Do **not** try to read variables from the library file here. Variable keys obtained by
reading a file directly fail on `importVariableByKeyAsync`. Step 2 is the only reliable
source.

---

## Step 2: Discover the library's published variable collections

Run `scripts/discover-library-variables.js` **on the current file**, not the library file.

This returns each published collection with its variables and their importable keys. Keep
the ones whose `libraryName` matches the target library.

Two things are worth noticing in the result:

- **Not every collection in a library is published.** Design systems often keep a
  primitives or internal layer unpublished on purpose, so semantic tokens are the only
  public surface. Whatever doesn't appear here cannot be imported at all. Treat the
  discovered set as the complete list of what's reachable, and map through values
  (Step 6) for anything that isn't.
- **Collection names vary.** Don't assume names like `Color` or `Sizing`. Classify
  collections by what their variables resolve to — `COLOR`, `FLOAT`, `STRING` — and by
  the shape of their names, not by the collection's label.

---

## Step 3: Audit the selection

Run `scripts/audit-selection.js` on the current file with the frames selected.

It walks every descendant and reports everything still bound to something local: color
variables, layout variables, styles, unstyled text nodes, and instances whose main
component isn't remote. Each entry carries the node name and id so you can trace it back.

Read the summary before planning. If a category is already empty, skip its step entirely.

---

## Step 4: Build the mapping tables

Now cross-reference the audit (what's used) against the inventory (what's available).
Read `references/mapping-strategies.md` for the matching techniques — the short version:

- **Layout variables** → match by normalized name, then confirm by resolved number.
- **Colors** → match by resolved RGB, then pick among the matches using node context.
- **Text styles** → match by font family + size + style, never by name.
- **Components** → match by component-set name, then map variant properties.

Produce the full mapping before touching anything, and show the user two things: the
mappings you're confident about, and the ones you aren't. Ambiguous cases are worth one
question — the whole point of a migration is that the result is *correct*, and a token
picked by coin flip is a bug that surfaces months later when someone switches themes.

Anything with no match at all goes in a third list: report it, leave it bound as-is, and
say so at the end. Silently unbinding something is worse than leaving it local.

---

## Step 5: Rebind layout variables

Spacing, padding, gap, radius, stroke weight, and sizing all bind the same way:

```js
const imported = await figma.variables.importVariableByKeyAsync(libraryKey);
node.setBoundVariable('itemSpacing', imported); // or paddingTop, topLeftRadius, ...
```

Import each variable once and reuse it — `importVariableByKeyAsync` is a network call, and
a frame with a hundred nodes will otherwise make a hundred round trips for the same token.

---

## Step 6: Rebind color variables

If the library publishes the same primitive layer the selection uses, this is a direct
name match and behaves like Step 5.

More often the library publishes only semantic tokens, so the local primitive has to be
mapped to a semantic token **by value**: resolve the local variable's RGB, resolve each
library token's RGB (following aliases), and match. `references/mapping-strategies.md`
covers alias resolution and the context rules for choosing among multiple matches.

Rebinding a paint is not like rebinding a layout property — paints are immutable, so the
returned paint has to be written back into the array:

```js
const imported = await figma.variables.importVariableByKeyAsync(semanticKey);
const fills = [...node.fills];
fills[i] = figma.variables.setBoundVariableForPaint(fills[i], 'color', imported);
node.fills = fills; // reassigning the whole array is required
```

Mutating `node.fills[i]` in place does nothing. This is the single most common reason a
color migration appears to run cleanly and changes nothing.

---

## Step 7: Swap component instances

```js
const libComponent = await figma.importComponentByKeyAsync(variantKey);
await instance.swapComponent(libComponent);
```

Swapping is destructive in two ways that both need handling.

**Layout properties reset.** Library components frequently default to `FIXED` sizing,
which breaks an instance that was filling its parent auto-layout container and leaves
visible gaps. Snapshot and restore:

```js
const snap = {
  layoutSizingHorizontal: instance.layoutSizingHorizontal,
  layoutSizingVertical: instance.layoutSizingVertical,
  layoutAlign: instance.layoutAlign,
  layoutGrow: instance.layoutGrow,
  layoutPositioning: instance.layoutPositioning,
};

await instance.swapComponent(libComponent);

Object.assign(instance, snap);
```

Restore sizing after the swap, not before — the swap overwrites it.

**Text overrides are lost.** Capture them keyed by node name, then restore:

```js
const overrides = [];
walkTexts(instance, n => overrides.push({ name: n.name, characters: n.characters }));

await instance.swapComponent(libComponent);

for (const n of collectTexts(instance)) {
  const orig = overrides.find(o => o.name === n.name);
  if (orig && orig.characters !== n.characters) {
    await figma.loadFontAsync(n.fontName);
    n.characters = orig.characters;
  }
}
```

Fonts must be loaded before writing `characters` or the assignment throws.

**Instances nested inside one-off component definitions** should be swapped at the
definition level, not per-instance. Find the `COMPONENT_SET` or `COMPONENT` in the
selection, walk into its children, and swap there — the change cascades to every instance
automatically, and swapping instance-by-instance instead will fight the cascade.

**Components with no library equivalent** are one-offs and stay as they are structurally.
Still apply Steps 5, 6, and 8 to the nodes inside them: a one-off shell is fine, local
tokens inside it are not.

---

## Step 8: Link text, fill, and effect styles

```js
const libStyle = await figma.importStyleByKeyAsync(matchedKey);
await textNode.setTextStyleIdAsync(libStyle.id);
```

Style keys read directly from the library file work here — unlike variables, styles don't
need `teamLibrary` discovery.

Match text nodes on their actual font properties, not on names. Build the lookup from the
library's `fontName.family` + `fontSize` + `fontName.style` and compare against the same
three properties on each node. With variable fonts, `fontName.style` may read as
`Regular` while the numeric `fontWeight` differs — if family and size match but style
doesn't disambiguate, fall back to `fontWeight` on the node side.

Text nodes with mixed styling report `figma.mixed` for `fontName` and `fontSize`. Those
can't be matched as a unit; either style their sub-ranges individually or report them as
needing manual attention.

---

## Step 9: Verify

Re-run `scripts/audit-selection.js` on the same selection. `summary.clean` should be true,
with these caveats:

- Instances of components that genuinely have no library equivalent will still show up.
- Text nodes with mixed styling will still show up.

Both are expected. Everything else means a step didn't take effect.

Then close the loop with the user by reporting, briefly:

- what was rebound, by category and count
- what had no library equivalent and was deliberately left alone
- anything that needs a human decision

A migration that quietly leaves a third of the frame on local tokens looks identical to
one that worked. The report is what makes the difference visible.

---

## Constraints

- **Preserve visual fidelity.** Colors, sizes, spacing, and type must look identical
  afterward. A migration that changes the design is a failed migration, even if every
  binding is now correct.
- **Never hardcode values.** Every value comes from a style or variable binding. Replacing
  a local token with a literal hex or a raw number defeats the purpose entirely.
- **Preserve text content.** Change style bindings, never the strings themselves.
- **Preserve layout.** Don't alter positions, sizes, or auto-layout structure. The only
  things that change are token, style, and component references.
- **Prefer leaving something local over guessing.** An unmapped binding is visible and
  fixable; a wrong mapping is invisible and ships.
- **Migrate the selection, not the page.** Users select a frame because they want that
  frame migrated, often as a trial run before committing to the rest.
