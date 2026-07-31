// discover-library-variables.js
//
// Run via evaluate_script on the CURRENT file — NOT the library file.
//
// Lists every variable collection published by every library enabled on this file,
// along with the variable keys that importVariableByKeyAsync will actually accept.
// This is the only reliable source of importable variable keys: keys read by opening
// the library file directly will fail on import, because unpublished collections look
// identical to published ones from the inside.
//
// Written as the body of an async function, which is how most Figma MCP servers wrap
// script input. If yours doesn't, wrap it yourself.

// Optional: set to a library name (or part of one) to return only that library.
// Leave null on the first run to see everything that's enabled.
const LIBRARY_FILTER = null; // e.g. 'Core Component Library'

const collections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();

const matches = LIBRARY_FILTER
  ? collections.filter(c => c.libraryName.toLowerCase().includes(LIBRARY_FILTER.toLowerCase()))
  : collections;

const out = [];

for (const coll of matches) {
  let variables = [];
  let error = null;

  try {
    variables = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(coll.key);
  } catch (e) {
    error = String(e && e.message ? e.message : e);
  }

  // Group by resolved type so colour / number / string collections are easy to tell
  // apart without relying on the collection's name, which varies between systems.
  const byType = {};
  for (const v of variables) {
    if (!byType[v.resolvedType]) byType[v.resolvedType] = 0;
    byType[v.resolvedType] += 1;
  }

  out.push({
    libraryName: coll.libraryName,
    collectionName: coll.name,
    collectionKey: coll.key,
    variableCount: variables.length,
    typeBreakdown: byType,
    error,
    variables: variables.map(v => ({
      name: v.name,
      key: v.key,
      type: v.resolvedType,
    })),
  });
}

return {
  librariesEnabled: [...new Set(collections.map(c => c.libraryName))],
  collections: out,
};
