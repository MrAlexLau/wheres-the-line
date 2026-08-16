// Row ids come back from two different NocodeBackend code paths — api.create()'s
// response body and api.read()'s row payloads — which aren't guaranteed to
// agree on number-vs-string typing. Comparing loosely (as strings) avoids
// "who am I" / "who's the judge" / cross-table id checks silently failing.
// See docs/SPEC.md §8b.
export function sameId(a, b) {
  return a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
}
