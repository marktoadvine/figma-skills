// audit-selection.js
//
// Run via evaluate_script on the CURRENT file, with the frame(s) to migrate selected.
//
// Reports every binding in the selection that still points at something local — i.e.
// everything the migration has yet to handle. Use it twice: once before migrating to
// plan the work, and once after to verify nothing was missed. On the second run,
// summary.clean should be true.
//
// Results are grouped by variable/style name rather than listed per node, because a
// frame references the same handful of tokens hundreds of times and a per-node dump is
// mostly noise.
//
// Written as the body of an async function, which is how most Figma MCP servers wrap
// script input. If yours doesn't, wrap it yourself.

const selection = figma.currentPage.selection;
if (!selection.length) {
  return { error: 'Nothing selected. Select the frame(s) to migrate first.' };
}

const LAYOUT_FIELDS = [
  'itemSpacing', 'counterAxisSpacing',
  'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius',
  'strokeWeight',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
];

const STYLE_FIELDS = ['fillStyleId', 'strokeStyleId', 'effectStyleId', 'textStyleId', 'gridStyleId'];

// A frame reuses the same tokens constantly; resolving each id once keeps the walk fast.
const variableCache = new Map();
async function getVariable(id) {
  if (!variableCache.has(id)) {
    let v = null;
    try { v = await figma.variables.getVariableByIdAsync(id); } catch (e) { v = null; }
    variableCache.set(id, v);
  }
  return variableCache.get(id);
}

const styleCache = new Map();
async function getStyle(id) {
  if (!styleCache.has(id)) {
    let s = null;
    try { s = await figma.getStyleByIdAsync(id); } catch (e) { s = null; }
    styleCache.set(id, s);
  }
  return styleCache.get(id);
}

const out = {
  colorVariables: {},
  layoutVariables: {},
  styles: {},
  unstyledText: [],
  localInstances: {},
};

function record(bucket, key, entry) {
  if (!bucket[key]) bucket[key] = [];
  bucket[key].push(entry);
}

// Collect the selection plus every descendant.
const nodes = [];
for (const root of selection) {
  nodes.push(root);
  if (typeof root.findAll === 'function') nodes.push(...root.findAll(() => true));
}

for (const node of nodes) {
  const where = { node: node.name, type: node.type, id: node.id };

  // Colour variables bound to fills and strokes.
  for (const prop of ['fills', 'strokes']) {
    const paints = node[prop];
    // figma.mixed is a symbol, so an Array check also filters mixed values out.
    if (!Array.isArray(paints)) continue;
    for (const paint of paints) {
      const bound = paint.boundVariables && paint.boundVariables.color;
      if (!bound) continue;
      const v = await getVariable(bound.id);
      if (v && !v.remote) record(out.colorVariables, v.name, { ...where, prop });
    }
  }

  // Variables bound to layout properties.
  const bound = node.boundVariables || {};
  for (const field of LAYOUT_FIELDS) {
    const ref = bound[field];
    if (!ref || !ref.id) continue;
    const v = await getVariable(ref.id);
    if (v && !v.remote) record(out.layoutVariables, v.name, { ...where, field });
  }

  // Local style bindings.
  for (const field of STYLE_FIELDS) {
    const id = node[field];
    if (typeof id !== 'string' || !id) continue; // guards figma.mixed
    const s = await getStyle(id);
    if (s && !s.remote) record(out.styles, s.type + ': ' + s.name, { ...where, field });
  }

  // Text nodes with no style at all — these need linking, not swapping.
  if (node.type === 'TEXT' && node.textStyleId === '') {
    const mixedFont = node.fontName === figma.mixed;
    out.unstyledText.push({
      ...where,
      fontFamily: mixedFont ? 'MIXED' : node.fontName.family,
      fontStyle: mixedFont ? 'MIXED' : node.fontName.style,
      fontSize: node.fontSize === figma.mixed ? 'MIXED' : node.fontSize,
      fontWeight: node.fontWeight === figma.mixed ? 'MIXED' : node.fontWeight,
    });
  }

  // Instances still pointing at a local main component.
  if (node.type === 'INSTANCE') {
    let main = null;
    try { main = await node.getMainComponentAsync(); } catch (e) { main = null; }
    if (main && !main.remote) {
      const setName = main.parent && main.parent.type === 'COMPONENT_SET'
        ? main.parent.name
        : main.name;
      record(out.localInstances, setName, { ...where, variant: main.name });
    }
  }
}

const summary = {
  nodesScanned: nodes.length,
  localColorVariables: Object.keys(out.colorVariables).length,
  localLayoutVariables: Object.keys(out.layoutVariables).length,
  localStyles: Object.keys(out.styles).length,
  unstyledTextNodes: out.unstyledText.length,
  localInstanceSets: Object.keys(out.localInstances).length,
};

summary.clean =
  summary.localColorVariables === 0 &&
  summary.localLayoutVariables === 0 &&
  summary.localStyles === 0 &&
  summary.unstyledTextNodes === 0 &&
  summary.localInstanceSets === 0;

out.summary = summary;
return out;
