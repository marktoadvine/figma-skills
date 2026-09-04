---
name: review-summary
description: |-
  Summarize your design feedback into a quick-glance dashboard! :)
  This skill fetches all comments from the current page, categorizes them into Decisions, Design Changes, Open Questions, and Positive Notes, then builds a linked dashboard frame with a stats header and consistent table layout - each row hyperlinked back to its source frame.
---

# Review Summary Dashboard

Consolidates all reviewer comments on the current page into a structured, at-a-glance dashboard with clickable links back to source frames.

## Step 1 — Fetch comments

Use `get_comments` with the current file key and page ID. Collect for each comment: `id`, `message`, `user.handle`, `createdAt`, `position.nodeId`. Skip resolved comments unless the user asks for them. If there are no comments, tell the user and stop.

## Step 2 — Categorize

Group each comment into one of four buckets by reading its tone and content:

- **Decisions** — Confirmations where nothing needs to change ("same as last year", "keep this", "will remain").
- **Design Changes** — Action items requiring design work ("update X", "change to Y", "reduce", "add", "remove", "increase").
- **Open Questions** — Unanswered questions blocking progress ("do they have…?", "can we…?", "is there…?").
- **Positive Notes** — Approval or affirmative reactions ("like this idea", "looks great", "good").

For each comment, also identify the parent section name (e.g. `/home`, `/venue`, `/agenda`) by traversing from `position.nodeId` up to the nearest named section or top-level frame.

## Step 3 — Build the dashboard

Call `create_design` with this brief:

"Design Review Dashboard, 1440px wide desktop. Navy header (left: title 'Design Review Dashboard', reviewer name, date, page count as meta chips; right: four stat pill boxes — Design Changes count in orange, Decisions in green, Open Question count in blue, Positive Note count in teal, each with large number + small label). Below the header: four sections stacked vertically with 24px gap. Each section has a colored square + uppercase label, then a data table with columns: # (8px colored dot), Page (chip, 120px fixed), Action Item (fills remaining space), Link ('View →' right-aligned). Use alternating row shading (white / very light gray) and thin bottom dividers between rows. Section order: Decisions first, then Design Changes (largest section), then Open Questions, then Positive Notes."

Populate each row with the categorized comment data. Use the parent section name as the page chip text.

## Step 4 — Fix layout programmatically

After `create_design` returns, run `evaluate_script` to enforce pixel-perfect consistency. Load ALL fonts present in the dashboard first with `figma.loadFontAsync` before touching any text node — missing fonts will cause an error. To discover which fonts are present, traverse all text nodes and collect unique `fontName` values before loading.

For every data row across all sections, set:
- `row.counterAxisAlignItems = 'CENTER'` — vertically center all column items
- Chip column frame: `resize(120, height)`, `clipsContent = true`, `layoutAlign = 'CENTER'`
- Action text node: `layoutGrow = 1`, `textAutoResize = 'HEIGHT'`, `layoutAlign = 'CENTER'`
- View → text node: `layoutAlign = 'CENTER'`
- Even rows fill: `{ r:1, g:1, b:1 }` / Odd rows: `{ r:0.965, g:0.968, b:0.975 }`
- Bottom-only stroke divider: color `{ r:0.871, g:0.878, b:0.898 }`, weight 1, align inside. Use `strokeTopWeight = 0`, `strokeRightWeight = 0`, `strokeBottomWeight = 1`, `strokeLeftWeight = 0` for bottom-only — wrap in try/catch and fall back to `strokeWeight = 1` if individual side weights are unavailable.

Also set `counterAxisAlignItems = 'CENTER'` on all table header rows and apply a slightly darker fill `{ r:0.941, g:0.945, b:0.957 }` to header rows with the same bottom-only divider stroke.

## Step 5 — Wire hyperlinks

Run a second `evaluate_script` to add `hyperlink = { type: 'NODE', value: nodeId }` on three node types within the dashboard frame:

1. **Page chip text nodes** — match by exact chip text (e.g. `/home`) and link to the section frame that chip represents.
2. **Action item text nodes** — match each row's action text by substring against the original comment message, then link to `position.nodeId` from that comment.
3. **View → text nodes** — collect all nodes whose text starts with "View", sort them by absolute Y position ascending, then assign `position.nodeId` values in the same top-to-bottom order as the rows appear in the dashboard.

## Step 6 — Verify and report

Take a screenshot of the dashboard frame using `await node.screenshot()` and inspect it before responding. Check that:
- All four sections are present and visually consistent
- No chip text is overflowing its column
- Rows are evenly spaced with visible dividers
- The header stat counts match the actual number of items in each section

If any section looks broken or misaligned, re-run the layout fix from Step 4 targeting only the affected rows before responding.

---

Credit: Originally written by @marktoadvine (Mark Toadvine)
