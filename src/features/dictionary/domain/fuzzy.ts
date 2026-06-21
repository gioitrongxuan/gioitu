// Fuzzy matching for look-up: surface a near-miss term when the user misspells
// or misremembers a word. Pure logic (no IndexedDB/DOM) so it stays testable;
// `data/yomitan.ts` scans the store and feeds candidates through these.

/**
 * Levenshtein edit distance, **bounded** by `max`: returns the real distance
 * when it is ≤ `max`, otherwise `max + 1`. The bound lets the row-fill bail out
 * early — cheap to reject the vast majority of dictionary entries during a scan.
 */
export function editDistanceWithin(a: string, b: string, max: number): number {
  if (a === b) return 0;
  // A length gap alone already exceeds the budget — no need to fill the table.
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length <= max ? b.length : max + 1;
  if (b.length === 0) return a.length <= max ? a.length : max + 1;

  // Two rolling rows of the DP matrix; `b` indexes the columns.
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Every remaining cell can only grow from this row's minimum, so once the
    // whole row is over budget the final distance is too.
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] <= max ? prev[b.length] : max + 1;
}

/**
 * How many edits we tolerate for a query of a given length. Short queries allow
 * only one edit (otherwise everything looks "close"); longer ones allow two.
 */
export function fuzzyThreshold(query: string): number {
  return query.length <= 4 ? 1 : 2;
}

/**
 * Distance of a query to a dictionary entry, matching against **both** the term
 * and its reading and keeping the smaller. A kana query (たべる) should match a
 * kanji term (食べる) via its reading; comparing only the term — often a short
 * kanji string — would reject it on length alone.
 */
export function fuzzyMatchDistance(
  query: string,
  term: string,
  reading: string | undefined,
  max: number,
): number {
  let best = editDistanceWithin(query, term, max);
  if (best === 0) return 0;
  if (reading && reading !== term) {
    best = Math.min(best, editDistanceWithin(query, reading, max));
  }
  return best;
}
