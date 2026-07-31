# Mapping strategies

How to build each mapping table in Step 4, without assuming anything about how either
design system names things.

- [Layout variables](#layout-variables)
- [Colors](#colors)
- [Text styles](#text-styles)
- [Paint and effect styles](#paint-and-effect-styles)
- [Components and variants](#components-and-variants)
- [Handling ambiguity](#handling-ambiguity)

The common thread: **names are a hint, values are the truth.** Two design systems almost
never agree on naming, but they do agree on what 16 pixels is and what `#1D5A85` looks
like. Match on resolved values wherever a value exists, and use names only to break ties
or where there's nothing else to go on.

---

## Layout variables

Numbers are the easy case, because a spacing scale is usually the same scale with a
different label — `spacing/4`, `Space/4`, `space-4`, and `4` are all the same idea.

1. **Normalize both sides.** Lowercase, strip separators (`/`, `-`, `_`, spaces), and
   split trailing digits off the stem. `Space/12` and `spacing-12` both become
   `space` + `12`.
2. **Match stem, then index.** A local `spacing/12` maps to a library variable whose stem
   is one of the known synonyms (`space`, `spacing`, `gap`, `size`) with the same index.
3. **Confirm by resolved value.** Read both variables' numbers. If `spacing/12` resolves
   to 48 and `Space/12` resolves to 32, the scales don't align and the name match is
   actively misleading — fall back to matching by value alone and flag the whole scale to
   the user, because the mismatch will affect every binding.

Radius, stroke weight, and sizing follow the same shape with different stems (`radius`,
`corner`, `rounded`; `stroke`, `border`, `weight`).

Where no name match exists, match purely on the resolved number and prefer the library
variable whose name is least qualified — a bare `Radius/2` over `Radius/2-inset` — since
the qualified one usually encodes a use case you can't verify from here.

---

## Colors

The hard case, and the one worth being careful about.

### When the library publishes primitives

Direct name match, same normalization as above. Done.

### When the library publishes only semantic tokens

Common on mature design systems: the primitive layer is deliberately unpublished so
consumers are forced onto semantic tokens. The local selection is bound to primitives that
have no published counterpart, so map **primitive → semantic by resolved RGB**.

**1. Resolve local primitives.**

```js
const collection = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
const value = v.valuesByMode[collection.defaultModeId];
```

**2. Resolve library semantic tokens, following aliases.** Semantic tokens almost always
alias a primitive, which sometimes aliases another primitive. Resolve iteratively rather
than at a fixed depth:

```js
async function resolve(value, modeId) {
  let guard = 0;
  while (value && value.type === 'VARIABLE_ALIAS' && guard++ < 10) {
    const target = await figma.variables.getVariableByIdAsync(value.id);
    if (!target) return null;
    const coll = await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId);
    value = target.valuesByMode[modeId] ?? target.valuesByMode[coll.defaultModeId];
  }
  return value;
}
```

The guard matters: a circular alias in a work-in-progress library will otherwise hang the
script with no error.

**3. Match on RGB, ignoring alpha.** Compare `r`, `g`, `b` with a small epsilon (`1e-4`) —
Figma stores channels as floats and round-tripped values don't compare exactly. Handle
alpha separately: a token that matches on RGB but has a different opacity is usually still
the right token, with the opacity applied at the layer.

**4. Expect multiple matches.** A neutral like pure white legitimately backs a text token,
a background token, and a border token. Choosing among them is the next section.

### Choosing among multiple semantic matches

The right token depends on where the color is being used. Filter candidates by node
context, using whichever category names the target library actually uses:

| Where the color is used | Prefer tokens whose path starts with |
|---|---|
| Fill on a `TEXT` node | `Text`, `Foreground`, `Content`, `On*` |
| Stroke on any node | `Border`, `Stroke`, `Outline` |
| Fill on a frame, rectangle, or other container | `Background`, `Surface`, `Fill` |
| Fill on a vector or icon-sized node | `Icon`, `Foreground` |
| Large translucent overlay | `Utilities`, `Overlay`, `Scrim` |

Derive the real category names from the library's own token paths rather than assuming
this table's vocabulary — read the first path segment of every color token in the
collection and map it onto these roles once, at the start.

If several candidates survive the context filter, prefer the least qualified name. State
suffixes (`-hover`, `-pressed`, `-disabled`, `-selected`) and role qualifiers describe
situations you can't verify from a static frame, so a base token is the safer default and
a wrong state token is a subtle, long-lived bug.

If it's still ambiguous after all that, ask. One question is cheap.

---

## Text styles

Match on font properties, never on names. Name schemes encode different things in
different orders (`Heading/24/Bold`, `text-serif-24-420`, `H2`) and parsing them is
fragile in a way that value matching isn't.

Build the library lookup from `fontName.family` + `fontSize` + `fontName.style`, and
compare against the same three properties on each unstyled text node.

Refinements worth applying:

- **Variable fonts.** `fontName.style` may read `Regular` on both sides while the numeric
  weights differ. Text *nodes* expose a numeric `fontWeight`; text *styles* don't. When
  family and size match but style doesn't disambiguate, use the node's `fontWeight` and
  the style's style-name-to-weight mapping as a tiebreak.
- **Line height and letter spacing** are good confirmations but poor primary keys — they
  frequently differ slightly between a hand-set node and the library style it should
  become, and that difference is usually the thing the migration is meant to fix.
- **No exact size match.** Prefer the nearest size in the same family and weight, but
  don't apply it silently — a 15px node becoming a 16px style is a visual change, which
  the migration is not supposed to make. Report it and let the user decide.
- **Mixed styling.** `fontName` or `fontSize` reading `figma.mixed` means the node has
  multiple styles across its character ranges. Either handle sub-ranges individually with
  `setRangeTextStyleIdAsync`, or report the node for manual attention.

---

## Paint and effect styles

Match on the resolved paint value, using the same RGB comparison as the color section.
A local paint style and a library paint style that resolve to the same color are the same
style regardless of naming.

Gradients need all stops to match — position and color — not just the first one.

Effect styles are harder to compare structurally (shadow offset, blur, spread, colour, and
count all matter). Match on name similarity first, confirm by comparing the effect arrays,
and ask when the arrays differ. Effects are also the category where a near-match is most
visible, so err toward asking.

---

## Components and variants

**1. Match the component set by name.** Normalize the same way as variables — case,
separators, and any leading dot or underscore that marks a private component. Library and
local sets are usually named recognizably, since both descend from the same design intent.

**2. Map variant properties.** Property names and values commonly diverge even when the
components are equivalent — a local `Color=Blue` may be the library's `Color=Default`,
and `Color=White` may be `Color=Invert`. Build the mapping per component set by comparing
the variant option lists, and lean on what the variants actually render: a variant whose
fills resolve to the same colors is the same variant regardless of what it's called.

**3. Handle missing properties.** If the library component has a property the local one
doesn't, leave it at the library default. If the local one has a property with nowhere to
go, note it — that's a real capability difference the user probably wants to know about.

**4. Pick the variant, not the set.** `importComponentByKeyAsync` takes a specific
variant's key. Importing the set's key gets you a `COMPONENT_SET`, which `swapComponent`
won't accept.

---

## Handling ambiguity

Sort every mapping into three buckets and show all three before rebinding anything:

- **Confident** — value match plus context agreement. Apply without asking.
- **Ambiguous** — several plausible targets, or a name match contradicted by values.
  Ask, in one batched question rather than one at a time.
- **No match** — nothing in the library corresponds. Leave the binding alone and report it.

The third bucket is the one to resist acting on. Unbinding a token to leave a raw value
behind, or forcing it onto the closest-looking token, both produce a frame that looks
migrated and isn't. Leaving it local keeps the problem visible to whoever picks it up next.
