// If prefaced with W/, that means "weak" algorithm ok.
// We're already pretty weak. :)
// Keep the dquotes to make matching with generated etag easier.
const firstTag = /^(?:W\/)?(?<etag>"[^"]*")/;
const otherTags = /\s*,\s*(?:W\/)?(?<others>"[^"]*")/g;

/**
 * Parse an if-none-match header, which might include multiple etags.
 *
 * @param inm If-None-Match header.
 * @returns Array of etags.
 * @see https://httpwg.org/specs/rfc9110.html#rfc.section.13.1.2
 */
export function parseIfNoneMatch(
  inm: string | null | undefined
): Set<string> | undefined {
  if (typeof inm !== 'string') {
    return undefined;
  }
  const res = new Set<string>();
  if (inm === '*') {
    res.add('*');
  } else {
    const first = firstTag.exec(inm);
    if (first) {
      res.add(first[1]);
      otherTags.lastIndex = first[0].length;
      for (const other of inm.matchAll(otherTags)) {
        res.add(other[1]);
      }
    }
  }
  return res;
}
