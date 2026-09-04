# figma-skills

Welcome!

I'm in Figma a lot. We have a good relationship.
This library contains Figma-agentic skills for design systems to help aid you in your Figma-native design processes.

## Skills

| Skill | What it does |
|---|---|
| [`better-accessibility`](/better-accessibility) | Audits a selected frame, component, or multi-screen user flow against WCAG 2.2 AA with measured values, marks up the canvas with annotated fixes, and emits a `.pa11yci` config so the criteria a static design can't prove get verified in CI. |
| [`export-tokens`](/export-tokens) | Export all published local variable collections from the current Figma file as a versioned DTCG tokens.json and tailwind.config.js. Detects changes from previous exports, bumps the version, generates a diff summary, and presents all files inline in chat for copy/paste. |
| [`import-tokens`](/import-tokens) | Import design tokens from a JSON, JS, or config file (tokens.json, tailwind.config.js, Style Dictionary, etc.) into the current Figma file as local variables and styles. Handles both fresh imports and incremental updates to an existing variable system. Adds new tokens, updates changed values, and optionally removes deleted ones. Yay! |
| [`migrate-library`](/migrate-library) (unfinished WIP) | Relinks a Figma selection's styles, variables, tokens, and component instances onto a different published library, without changing how anything looks. |
| [`review-summary`](/review-summary) | Summarize your design feedback into a quick-glance dashboard! :) This skill fetches all comments from the current page, categorizes them into Decisions, Design Changes, Open Questions, and Positive Notes, then builds a linked dashboard frame with a stats header and consistent table layout - each row hyperlinked back to its source frame. |

## Using a skill

Each skill is a **single self-contained `SKILL.md`** in its own folder at the repo root,
following the
[Agent Skills specification](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-use/SKILL.md).

To use one in Figma, upload it to the Figma agent or Figma Make: drag that skill's
`SKILL.md` in, or click **Upload a file** and pick it. Figma's custom skills do not support the optional
`scripts/`, `references/`, or `assets/` directories that agent skills sometimes ship with,
which is why everything here stays in one file, any script a skill needs is inlined.

Most of these skills drive Figma through the `use_figma` tool, and expect `figma-use` to be passed
in the `skillNames` parameter alongside them. See each skill's own setup section for
anything it needs beyond that.

## Figma

These skills are also published in the [Figma community](https://www.figma.com/@marktoadvine)

## Suggestions

I welcome any feedback, issues, and PRs to better enhance this skill library.