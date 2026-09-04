---
name: export-tokens
description: Export all published local variable collections from the current Figma file as a versioned DTCG tokens.json and tailwind.config.js. Detects changes from previous exports, bumps the version, generates a diff summary, and presents all files inline in chat for copy/paste.
---

# Export Design Tokens

Export all local variable collections from the current Figma file as three outputs:
1. **`tokens.json`** — DTCG (Design Tokens Community Group) format with a `$version` field
2. **`tailwind.config.js`** — Tailwind CSS config with all aliases resolved to hex, versioned in a header comment
3. **`CHANGELOG.md`** — a diff summary showing what changed since the last export

Run all scripts through `use_figma`, with `figma-use` in the `skillNames` parameter. Code is
auto-wrapped in an async context — use top-level `await` and `return` explicitly, since
only the returned value is visible and `console.log` is not.

All three outputs MUST be pasted **inline in the chat response** inside code blocks so the user can copy/paste or download. Where the environment has a filesystem, also write them to the code directory as a secondary convenience — Figma's agent does not, so the inline paste is the primary delivery and the only one that always works.

---

## Exclusion Rules

Automatically exclude variables and collections that match any of these criteria:
- **Unpublished**: `hiddenFromPublishing === true` on the variable
- **Private by naming convention**: The variable name OR any segment of its `/`-delimited path starts with `.` or `_` (e.g. `.primitives`, `_internal/spacing`, `utilities/_component-background`)
- **Unpublished collections**: Skip entire collections where `hiddenFromPublishing === true` on the collection itself

---

## Step 1: Read the previous export (if any)

Before extracting fresh data, look for a previous `tokens.json` — in the code directory where there is a filesystem, otherwise ask the user to paste the one from their last run. If you have it:
- Read it and parse the `$version` field (e.g. `"0.1.3"`)
- Keep the full previous token tree in memory for diffing in Step 5

If no previous file exists, or the user has none to paste, this is the first export — start at version `0.1.0`.

## Step 2: Extract variables via Plugin API

Use `use_figma` to read all local variable collections and variables:

- Use `figma.variables.getLocalVariableCollectionsAsync()` and `figma.variables.getLocalVariablesAsync()`
- For each collection, check `collection.hiddenFromPublishing` — skip the entire collection if true
- For each variable, check:
  - `variable.hiddenFromPublishing` — skip if true
  - `variable.name` — split by `/` and skip if any segment starts with `.` or `_`
- For each included variable, read the value from the first mode of its collection
- Convert Figma normalized RGB colors (0-1 floats) to hex strings, including alpha channel when `a !== 1`
- For alias values (`VARIABLE_ALIAS` type), resolve the alias reference using `figma.variables.getVariableByIdAsync()`
- For cubic bezier easing values (`CUSTOM_CUBIC_BEZIER` type), extract the control points
- For duration values (FLOAT type in the motion collection), convert from seconds to milliseconds and append "ms"
- Include `$extensions` with `com.figma.codeSyntax` when present on variables
- Include `$extensions` with `com.figma.scopes` when not ALL_SCOPES
- Build a primitive color lookup table from all COLOR type variables for resolving semantic aliases to hex

## Step 3: Compute version bump

Compare the new token data against the previous export from Step 1:

- **No previous export** → set version to `0.1.0`
- **No changes detected** → keep the same version and tell the user everything is up to date (still output the files)
- **Changes detected** → bump the patch version (e.g. `0.1.3` → `0.1.4`)

The version format is `MAJOR.MINOR.PATCH`:
- PATCH: any token value changed, token added, or token removed
- MINOR: a whole collection added or removed (bump minor, reset patch to 0)
- MAJOR: reserved for the user to bump manually

## Step 4: Build tokens.json

Add a top-level `$version` field and `$generated` timestamp:
```json
{
  "$version": "0.1.4",
  "$generated": "2026-09-03T14:30:00Z",
  "sizing": { ... },
  "color": { ... },
  ...
}
```

Structure the tokens hierarchically using `/` in variable names as path separators. Each leaf token has:
- `$type`: mapped from Figma type (COLOR → "color", FLOAT → "number", STRING → "string", BOOLEAN → "boolean")
- `$value`: the resolved value (hex for colors, raw for numbers/strings, alias reference format `{path.to.token}` for aliases)
- `$extensions`: optional Figma-specific metadata (codeSyntax, scopes)

Group by collection name as top-level keys.

## Step 5: Build the diff / CHANGELOG.md

Compare old vs. new token trees and produce a human-readable diff grouped into three sections:

```markdown
# Token Export Changelog

## v0.1.4 — 2026-09-03

### Added (N tokens)
- `color/background/new-token` → #ff0000
- `sizing/space/24` → 168

### Changed (N tokens)
- `typography/fontWeight/md` — 500 → 550
- `color/text/link` — #1a5a85 → #1d5a85

### Removed (N tokens)
- `sizing/depth/neg 1600`
```

If this is the first export, write:
```markdown
# Token Export Changelog

## v0.1.0 — 2026-09-03

Initial export. N tokens across M collections.
```

Append new entries to the top of any existing CHANGELOG.md (preserve history).

## Step 6: Build tailwind.config.js

Include the version in a header comment:
```js
/**
 * Auto-generated from Figma variables — v0.1.4
 * Generated: 2026-09-03
 * Do not edit manually; re-run /export-tokens to update.
 *
 * @type {import('tailwindcss').Config}
 */
```

Map the tokens to Tailwind theme keys:
- **colors**: Both primitive colors (stripping "Color/" prefix if present) and semantic color tokens with all aliases resolved to their final hex values
- **spacing**: From `space/*` variables, formatted as `"space-N": "Xpx"`
- **borderRadius**: From `radius/*` variables, formatted as `"radius-N": "Xpx"` (9999 for `full`)
- **borderWidth**: From `stroke/*` variables
- **blur**: From `blur/*` variables
- **boxShadow**: Map depth tokens to reasonable CSS shadow values scaled by depth level
- **fontFamily**: From `fontFamily/*` variables with system fallbacks
- **fontSize**: From `fontSize/*` variables with calculated lineHeight (1.5 for ≤16px, 1.4 for ≤24px, 1.3 for ≤36px, 1.1 for larger)
- **fontWeight**: From `fontWeight/*` variables as string values
- **transitionDuration**: From `duration/*` variables
- **transitionTimingFunction**: From `easing/*` variables as `cubic-bezier()` values

Use Tailwind-friendly key conventions: kebab-case, `DEFAULT` for base values.

## Step 7: Present results inline

**This is critical.** Paste ALL THREE files inline in the chat as fenced code blocks:

1. `tokens.json` — full file in a ```json block
2. `tailwind.config.js` — full file in a ```js block
3. `CHANGELOG.md` — full file in a ```markdown block

Before the code blocks, include a short summary:
- Version (old → new, or "initial")
- Total token count and per-collection breakdown
- Number of tokens added / changed / removed
- Number excluded by filtering rules

Also write the files to the code directory so they persist for the next run's diff comparison.

---

Credit: Originally written by @marktoadvine (Mark Toadvine)
