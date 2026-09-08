---
name: export-tokens
description: Export the published local variable collections from the current Figma file as spec-correct DTCG tokens.json, a Tailwind v4 @theme stylesheet, and a versioned changelog. Detects changes since the last export, bumps the version, and presents every file inline in chat for copy/paste.
---

# Export Design Tokens

Turn the current Figma file's local variables into three outputs:

1. **`tokens.json`** — [DTCG](https://www.designtokens.org/tr/drafts/format/) 2025.10, the source of truth
2. **`theme.css`** — a Tailwind v4 `@theme` block generated from those tokens
3. **`CHANGELOG.md`** — what changed since the last export

Run all scripts through `use_figma`, with `figma-use` in the `skillNames` parameter. Code is
auto-wrapped in an async context — use top-level `await` and `return` explicitly, since only
the returned value is visible and `console.log` is not.

Paste every output **inline in the chat** inside fenced code blocks. Where the environment
has a filesystem, also write them to the code directory; Figma's agent has none, so the
inline paste is the only delivery that always works.

## Two rules that govern everything

**Never invent a value.** Every number, colour, and curve in the output comes from a
variable that exists in the file. Do not derive line heights from font sizes, do not
synthesise shadows from a depth scale, do not add fallback fonts that nobody chose. If a
value the target format wants is missing, omit the key and say so in the summary — a gap is
recoverable, a fabricated value silently becomes someone's design system.

**Never flatten an alias.** A semantic token pointing at a primitive stays a reference: a
DTCG alias in `tokens.json`, a `var()` in `theme.css`. Resolving `color/text/link` down to
`#1d5a85` throws away the relationship that makes theming and dark mode possible.

## Exclusions

Skip any collection with `hiddenFromPublishing === true`, any variable with
`hiddenFromPublishing === true`, and any variable whose name has a `/`-segment starting with
`.` or `_` (`.primitives`, `_internal/spacing`, `utilities/_component-background`).

## Step 1 — Find the previous export

Look for a previous `tokens.json`: in the code directory where there is a filesystem,
otherwise ask the user to paste last run's file. Read its version from
`$extensions["com.figma.export"].version` and keep the token tree for diffing. No previous
file, or none to paste → this is the first export, version `0.1.0`.

## Step 2 — Read the variables

```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const variables = await figma.variables.getLocalVariablesAsync();
```

For each surviving variable read the value from its collection's **first mode**, and record
`name`, `resolvedType`, `scopes`, `codeSyntax`, and the collection name. Resolve
`VARIABLE_ALIAS` values to the *target's name* — not its value — with
`figma.variables.getVariableByIdAsync()`. Convert colours from Figma's 0–1 floats to hex,
appending the alpha pair only when `a !== 1`.

**Sanitise names before anything else.** DTCG forbids `.`, `{`, `}` and `$` in token and
group names, because `.` is the path separator inside a `{alias.reference}`. A Figma
variable called `space.4` produces an unresolvable alias. Replace those characters with `-`
and report every rename in the summary.

## Step 3 — Map Figma types to DTCG types

This is where a generic export goes wrong. Figma has four resolved types; DTCG has thirteen,
and the difference is what makes downstream tooling able to do anything useful. Decide by
`scopes` first — they are declared intent — and fall back to the name path.

| Figma | Condition | `$type` | `$value` |
|---|---|---|---|
| `COLOR` | — | `color` | `"#1d5a85"` |
| `FLOAT` | scope `WIDTH_HEIGHT` / `GAP` / `CORNER_RADIUS` / `STROKE_FLOAT`, or path names a size, space, radius, stroke or blur | `dimension` | `{ "value": 16, "unit": "px" }` |
| `FLOAT` | path names a font size | `dimension` | `{ "value": 16, "unit": "px" }` |
| `FLOAT` | path names a duration | `duration` | `{ "value": 150, "unit": "ms" }` |
| `FLOAT` | path names a font weight | `fontWeight` | `500` — a number in 1–1000, or a keyword like `"bold"` |
| `FLOAT` | unitless ratio — line height, opacity | `number` | `1.5` |
| `STRING` | path names a font family | `fontFamily` | `"Season Sans"`, or an array for a stack |
| `BOOLEAN` | — | `boolean` | `true` |
| easing | `CUSTOM_CUBIC_BEZIER` | `cubicBezier` | `[0.4, 0, 0.2, 1]` |
| any | value is an alias | **omit `$type`** | `"{color.blue.600}"` |

`dimension` and `duration` values are **objects, not strings** — `"16px"` and `"150ms"` are
from an older draft, and emitting them as `number` tokens holding strings is exactly what
makes a generator produce garbage. A group may declare a `$type` its children inherit, which
is the tidiest way to type a whole colour ramp at once. `string` and `boolean` sit outside
the core thirteen types; emit them, but say so in the summary.

## Step 4 — Build tokens.json

Group by collection name, then split each variable name on `/` into nested groups. Export
metadata lives in `$extensions` — the `$` prefix is reserved for spec properties, so a
top-level `$version` is not valid DTCG:

```json
{
  "$extensions": {
    "com.figma.export": { "version": "0.1.4", "generated": "2026-09-08T14:30:00Z" }
  },
  "color": {
    "blue": { "600": { "$type": "color", "$value": "#1d5a85" } },
    "text": { "link": { "$value": "{color.blue.600}" } }
  },
  "sizing": {
    "space": { "4": { "$type": "dimension", "$value": { "value": 16, "unit": "px" } } }
  }
}
```

Carry Figma specifics per token in `$extensions` too — `com.figma.scopes` when not
`ALL_SCOPES`, and `com.figma.codeSyntax` when set.

## Step 5 — Build theme.css

Tailwind v4 is configured in CSS, not `tailwind.config.js`. Each `@theme` namespace
generates its own utilities, so the whole step is a mechanical rename — no value ever
changes shape between `tokens.json` and here:

| Tokens | Namespace | Emits |
|---|---|---|
| colour | `--color-*` | `--color-blue-600: #1d5a85;` |
| spacing, sizing | `--spacing-*` | `--spacing-4: 16px;` |
| radius | `--radius-*` | `--radius-md: 8px;` |
| font family | `--font-*` | `--font-sans: "Season Sans";` |
| font size | `--text-*` | `--text-base: 16px;` |
| font weight | `--font-weight-*` | `--font-weight-md: 500;` |
| line height | `--leading-*` | `--leading-normal: 1.5;` |
| letter spacing | `--tracking-*` | `--tracking-tight: -0.01em;` |
| shadow | `--shadow-*` | only where a token really is a shadow |
| blur | `--blur-*` | `--blur-sm: 4px;` |
| easing | `--ease-*` | `--ease-out: cubic-bezier(0.4, 0, 0.2, 1);` |

```css
/* Generated from Figma variables — v0.1.4 · 2026-09-08. Re-run /export-tokens to update. */
@import "tailwindcss";

@theme {
  --color-blue-600: #1d5a85;
  --color-text-link: var(--color-blue-600);  /* alias stays an alias */
  --spacing-4: 16px;
  --ease-out: cubic-bezier(0.4, 0, 0.2, 1);
}

:root {
  --duration-fast: 150ms;   /* v4 has no duration namespace — a plain property */
}
```

**Names carry no prefix of their own**: a `space/4` token becomes `--spacing-4`, giving
`p-4` — never `--spacing-space-4` and `p-space-4`. **Anything the namespaces don't cover** —
composite shadows, per-size line-height pairings, a bespoke type scale — is a mapping
decision owned by whoever owns the codebase: say what didn't map and stop. For a real build
step rather than a pasted file, point them at [Terrazzo](https://terrazzo.app) or Style
Dictionary, both of which consume Step 4's `tokens.json` directly.

If the project is still on Tailwind v3, say so and emit the same values as a
`tailwind.config.js` `theme.extend` — same names, same units, JS object instead of CSS.

## Step 6 — Version and changelog

Compare against Step 1. No previous export → `0.1.0`. No changes → keep the version, say
everything is current, still emit the files. Otherwise bump: **patch** for any token added,
changed or removed; **minor** when a whole collection appears or disappears, resetting
patch; **major** only when the user asks.

Prepend to any existing `CHANGELOG.md`, newest first:

```markdown
## v0.1.4 — 2026-09-08

### Added (2)
- `color/background/raised` → #ffffff

### Changed (1)
- `typography/fontWeight/md` — 500 → 550

### Removed (1)
- `sizing/depth/neg-1600`
```

## Step 7 — Deliver

Lead with a short summary, then paste `tokens.json`, `theme.css` and `CHANGELOG.md` in full,
each in its own fenced block. The summary states: version (old → new, or initial); token
count and per-collection breakdown; added / changed / removed counts; how many were excluded
by the rules above; every name sanitised in Step 2; and anything that could not be mapped in
Step 5.

---

Credit: Originally written by @marktoadvine (Mark Toadvine)
