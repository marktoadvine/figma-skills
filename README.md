# fig-skills

Figma-agentic skills for design systems to help aid you in your Figma-native design processes.

## Skills

| Skill | What it does |
|---|---|
| [`better-accessibility`](skills/better-accessibility.md) | Audits a selected frame, component, or multi-screen user flow against WCAG 2.2 AA with measured values, marks up the canvas with annotated fixes, and emits a `.pa11yci` config so the criteria a static design can't prove get verified in CI. |
| [`migrate-library`](skills/migrate-library.md) | Relinks a Figma selection's styles, variables, tokens, and component instances onto a different published library, without changing how anything looks. |

## Using a skill

Each skill is a **single self-contained `.md` file** under `skills/`, following the
[Agent Skills specification](https://github.com/figma/mcp-server-guide/blob/main/skills/figma-use/SKILL.md).

To use one in Figma, upload it to the Figma agent or Figma Make: drag the `.md` file in, or
click **Upload a file** and pick it. Figma's custom skills do not support the optional
`scripts/`, `references/`, or `assets/` directories that agent skills sometimes ship with,
which is why everything here stays in one file, any script a skill needs is inlined.

The same files also work in an MCP client such as Claude Code or Cursor (though, these havent been fully tested; the main usecase for these is in Figma's native agent): drop one into
`.claude/skills/<name>/SKILL.md`.

These skills drive Figma through the `use_figma` tool, and expect `figma-use` to be passed
in the `skillNames` parameter alongside them. See each skill's own setup section for
anything it needs beyond that.
