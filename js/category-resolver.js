// category-resolver.js — the single seam that turns a route/category key into a
// viewable marker-set.
//
// A "category" in this app is really "a set of markers you can view." Most sets
// are real categories living in data.categories; some are *derived* (e.g. "all
// biomarkers"), computed on demand from the real ones. Keyed lookups go through
// resolveCategory(); iteration over data.categories stays real-only, so derived
// sets never leak into the sidebar, CSV export, or dashboard widgets.

// Derived (virtual) categories: key → builder(data) → category-shaped object.
// Add a new entry here to introduce another derived view (e.g. flagged-only).
export const VIRTUAL_CATEGORY_BUILDERS = {
  allbiomarkers: buildAllBiomarkersCategory,
};

export function isVirtualCategory(key) {
  return Object.prototype.hasOwnProperty.call(VIRTUAL_CATEGORY_BUILDERS, key);
}

// The one place that maps a key to its marker-set. Real categories resolve from
// data.categories; virtual ones are built on demand. Returns undefined for an
// unknown key (same as data.categories[key] would).
export function resolveCategory(key, data) {
  if (isVirtualCategory(key)) return VIRTUAL_CATEGORY_BUILDERS[key](data);
  return data?.categories?.[key];
}

// Merge every real category's markers into one flat set. Keyed by full dotKey
// (`category.markerKey`) so cross-category collisions can't clobber each other —
// this is also the key the detail modal resolves back through, since a chart-card
// id is `allbiomarkers_<dotKey>` and the modal splits on the first underscore.
function buildAllBiomarkersCategory(data) {
  const markers = {};
  for (const [catKey, cat] of Object.entries(data?.categories || {})) {
    for (const [mKey, marker] of Object.entries(cat?.markers || {})) {
      markers[`${catKey}.${mKey}`] = marker;
    }
  }
  return { label: 'All Biomarkers', markers };
}
