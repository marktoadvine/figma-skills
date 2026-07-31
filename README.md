# helpful-skills

Some agentic skills for design systems, to help aid my Figma design processes inside web and apps.

## Skills

| Skill | What it does |
|---|---|
| [`migrate-library`](skills/migrate-library) | Relinks a Figma selection's styles, variables, tokens, and component instances onto a different published library, without changing how anything looks. |

## Using a skill

Each skill lives in its own directory under `skills/`, following the standard layout:

```
skills/<skill-name>/
├── SKILL.md      # frontmatter + instructions
├── references/   # docs loaded on demand
└── scripts/      # reusable code
```

To use one, copy its directory into `.claude/skills/` in the project you're working in,
or into `~/.claude/skills/` to make it available everywhere.

The Figma skills expect a Figma MCP connection that exposes `evaluate_script`. See the
individual `SKILL.md` for each skill's specific requirements.
