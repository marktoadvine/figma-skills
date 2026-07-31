# Figma plugin API reference

API surface and failure modes relevant to library migration.

- [Where keys come from](#where-keys-come-from)
- [API cheat sheet](#api-cheat-sheet)
- [Failure modes](#failure-modes)
- [Performance](#performance)

---

## Where keys come from

The most confusing part of migration is that the three importable things get their keys
from three different places, and using the wrong source fails in a way that looks like a
permissions problem.

| Thing | Key source | Notes |
|---|---|---|
| Variable | `figma.teamLibrary.*` on the **current** file | Keys read from the library file directly will fail on import |
| Style | Reading the **library** file (`getLocalPaintStylesAsync` etc.) | No `teamLibrary` equivalent exists |
| Component | Reading the **library** file (`findAllWithCriteria`) | No `teamLibrary` equivalent exists |

Variables are the odd one out because only *published* variables are importable, and only
the `teamLibrary` API knows what's published. Reading the library file shows every
variable including the unpublished ones, and their internal keys are meaningless to
`importVariableByKeyAsync`.

---

## API cheat sheet

### Discovery

```js
figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync()  // → { key, name, libraryName }[]
figma.teamLibrary.getVariablesInLibraryCollectionAsync(collKey)  // → { key, name, resolvedType }[]

figma.getLocalPaintStylesAsync()   // run against the library file
figma.getLocalTextStylesAsync()
figma.getLocalEffectStylesAsync()

await figma.loadAllPagesAsync();   // required before findAllWithCriteria across pages
page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })
```

### Import

```js
await figma.variables.importVariableByKeyAsync(key)   // key must come from teamLibrary
await figma.importStyleByKeyAsync(key)
await figma.importComponentByKeyAsync(key)            // variant key, not component-set key
```

### Resolve

```js
await figma.variables.getVariableByIdAsync(id)
await figma.variables.getVariableCollectionByIdAsync(id)
await figma.getStyleByIdAsync(id)
await instanceNode.getMainComponentAsync()

variable.valuesByMode[collection.defaultModeId]
variable.remote   // true = already from a library
style.remote
mainComponent.remote
```

### Rebind

```js
node.setBoundVariable('itemSpacing', variable);         // layout properties, sync

const fills = [...node.fills];                          // paints are immutable
fills[0] = figma.variables.setBoundVariableForPaint(fills[0], 'color', variable);
node.fills = fills;                                     // reassign the array

await node.setTextStyleIdAsync(style.id);               // style setters are async
await node.setFillStyleIdAsync(style.id);
await node.setStrokeStyleIdAsync(style.id);
await node.setEffectStyleIdAsync(style.id);

await instance.swapComponent(component);
await figma.loadFontAsync(node.fontName);               // before writing characters
```

Bindable layout fields: `itemSpacing`, `counterAxisSpacing`, `paddingTop`,
`paddingBottom`, `paddingLeft`, `paddingRight`, `topLeftRadius`, `topRightRadius`,
`bottomLeftRadius`, `bottomRightRadius`, `strokeWeight`, `width`, `height`, `minWidth`,
`maxWidth`, `minHeight`, `maxHeight`.

---

## Failure modes

**Rebinding a fill appears to succeed but nothing changes.** Paints are immutable objects.
`node.fills[0].boundVariables = ...` and in-place mutation both silently no-op. Clone the
array, replace the entry with the result of `setBoundVariableForPaint`, and assign the
whole array back.

**`importVariableByKeyAsync` throws for a variable that visibly exists in the library.**
The key came from reading the library file rather than from `teamLibrary`, or the
variable's collection isn't published. Re-derive the key from
`getVariablesInLibraryCollectionAsync`; if it isn't there, it isn't importable and needs
value-based mapping instead.

**`swapComponent` throws.** Usually a component-set key was imported instead of a variant
key — the result is a `COMPONENT_SET`, which isn't swappable. Import a specific variant.

**Instance renders at the wrong size after a swap.** The library component's default
sizing replaced the instance's. Restore `layoutSizingHorizontal`, `layoutSizingVertical`,
`layoutAlign`, `layoutGrow`, and `layoutPositioning` from a snapshot taken before the swap.

**Setting `characters` throws.** The font isn't loaded. `await figma.loadFontAsync(node.fontName)`
first, and note that `fontName` may be `figma.mixed` on a multi-style node, in which case
per-range loading is needed.

**`findAllWithCriteria` returns nothing on other pages.** In dynamic-page mode, pages must
be loaded first — `await figma.loadAllPagesAsync()` or `await page.loadAsync()`.

**Reading a style or variable id returns `figma.mixed`.** The node has different values
across children or character ranges. `figma.mixed` is a symbol, so guard with
`typeof id === 'string'` rather than a truthiness check.

**An empty inventory from the library file.** Almost always a wrong file key rather than
an empty library. Confirm by reading `figma.root.name`.

---

## Performance

`evaluate_script` round trips are the bottleneck, and large results are the second
bottleneck.

- **Cache resolved variables and styles** in a `Map` keyed by id inside a single script.
  A frame will reference the same twenty tokens hundreds of times.
- **Import each key once**, outside the loop that applies it. Every
  `importVariableByKeyAsync` call is a network fetch.
- **Filter the component inventory** to the families actually present in the selection.
  An unfiltered inventory of a mature library can run to tens of thousands of tokens.
- **Return summaries, not node dumps.** Group by variable or style name with a short list
  of affected nodes, rather than one record per node.
- **Batch mutations into one script** where possible. Twenty rebinds in one
  `evaluate_script` call is far cheaper than twenty calls.
