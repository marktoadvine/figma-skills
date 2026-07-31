// inventory-library.js
//
// Run via evaluate_script against the TARGET LIBRARY's fileKey.
//
// Collects style and component keys, together with their resolved values — actual paints,
// actual font properties. Values matter more than names here: two design systems rarely
// agree on naming, but a 16px regular style is a 16px regular style in both.
//
// Do NOT collect variables here. Variable keys read this way fail on import; use
// discover-library-variables.js instead.
//
// Written as the body of an async function, which is how most Figma MCP servers wrap
// script input. If yours doesn't, wrap it yourself.

// Restrict the component sweep to the families present in the selection. A mature
// library can otherwise return tens of thousands of tokens of component data.
// Example: /button|card|input|badge/i
const COMPONENT_FILTER = null;

// Set false once components are inventoried, to keep later runs small.
const INCLUDE_COMPONENTS = true;

const matchesFilter = name =>
  !COMPONENT_FILTER || COMPONENT_FILTER.test(name);

const [paintStyles, textStyles, effectStyles] = await Promise.all([
  figma.getLocalPaintStylesAsync(),
  figma.getLocalTextStylesAsync(),
  figma.getLocalEffectStylesAsync(),
]);

const out = {
  // Always confirm this is the library you meant. A wrong file key returns an empty
  // inventory rather than an error, which reads like "this library has no components".
  fileName: figma.root.name,

  paintStyles: paintStyles.map(s => ({
    name: s.name,
    key: s.key,
    paints: s.paints.map(p => ({
      type: p.type,
      color: p.color || null,
      opacity: typeof p.opacity === 'number' ? p.opacity : 1,
      gradientStops: p.gradientStops
        ? p.gradientStops.map(g => ({ position: g.position, color: g.color }))
        : null,
    })),
  })),

  textStyles: textStyles.map(s => ({
    name: s.name,
    key: s.key,
    fontFamily: s.fontName.family,
    fontStyle: s.fontName.style,
    fontSize: s.fontSize,
    lineHeight: s.lineHeight,
    letterSpacing: s.letterSpacing,
    textCase: s.textCase,
    textDecoration: s.textDecoration,
  })),

  effectStyles: effectStyles.map(s => ({
    name: s.name,
    key: s.key,
    effects: s.effects.map(e => ({
      type: e.type,
      radius: e.radius,
      spread: e.spread,
      offset: e.offset,
      color: e.color,
    })),
  })),

  componentSets: [],
  components: [],
};

if (INCLUDE_COMPONENTS) {
  // Required before findAllWithCriteria can see nodes on pages other than the current one.
  await figma.loadAllPagesAsync();

  for (const page of figma.root.children) {
    for (const cs of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) {
      if (!matchesFilter(cs.name)) continue;
      out.componentSets.push({
        name: cs.name,
        key: cs.key,
        page: page.name,
        // Import a VARIANT key, not the set key — swapComponent rejects COMPONENT_SET.
        variants: cs.children.map(v => ({ name: v.name, key: v.key })),
        properties: cs.componentPropertyDefinitions
          ? Object.keys(cs.componentPropertyDefinitions)
          : [],
      });
    }

    for (const c of page.findAllWithCriteria({ types: ['COMPONENT'] })) {
      // Variants are already captured above via their parent set.
      if (c.parent && c.parent.type === 'COMPONENT_SET') continue;
      if (!matchesFilter(c.name)) continue;
      out.components.push({ name: c.name, key: c.key, page: page.name });
    }
  }
}

out.summary = {
  paintStyles: out.paintStyles.length,
  textStyles: out.textStyles.length,
  effectStyles: out.effectStyles.length,
  componentSets: out.componentSets.length,
  standaloneComponents: out.components.length,
};

return out;
