// An illustrative image for a vocabulary word, shared by the detail panel and
// the review flashcard so a word looks the same wherever it appears. Degrades
// silently: a missing or broken URL renders nothing rather than a broken icon.

import { useEffect, useState } from "react";

interface Props {
  /** Image URL (a Wikimedia thumbnail). */
  url: string;
  /** Alt text — the word itself. */
  alt: string;
  /** Attribution caption, e.g. "Wikipedia: 犬". */
  source?: string;
}

export function WordImage({ url, alt, source }: Props) {
  const [failed, setFailed] = useState(false);
  // A new word reuses this component instance, so clear a previous load error.
  useEffect(() => setFailed(false), [url]);

  if (!url || failed) return null;
  return (
    <figure className="word-image">
      <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      {source && <figcaption className="word-image-credit">{source}</figcaption>}
    </figure>
  );
}
