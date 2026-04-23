import { useState, useEffect } from "react";

export function useSlideshow(length: number, intervalMs = 4000) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % length), intervalMs);
    return () => clearInterval(t);
  }, [length, intervalMs]);

  return index;
}
