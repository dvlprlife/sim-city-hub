import { useEffect, useState } from 'react';

// Probe once per session whether the (git-ignored, download-separately) Sunnyside
// asset pack is present locally — so the optional pixel-art Buildings view and its
// toggle only appear when it can actually render. Theme-neutral: no Simulated Agent
// City strings; just a presence check.
//
// Returns 'unknown' (still probing) | true (present) | false (absent). We probe
// room1.json (the pixel view's load-bearing dependency, itself git-ignored) with a
// HEAD fetch — a 404 resolves with res.ok === false rather than rejecting, and HEAD
// (unlike `new Image()`) logs nothing to the console when the file is missing, so a
// fresh clone stays silent.
const PROBE_URL = '/assets/sunnyside/room1.json';
let cached = null; // Promise<boolean>, shared across mounts

function probe() {
  if (!cached) {
    cached = fetch(PROBE_URL, { method: 'HEAD', cache: 'force-cache' })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return cached;
}

export function useSunnysideAvailable() {
  const [state, setState] = useState('unknown');
  useEffect(() => {
    let ignore = false;
    probe().then((ok) => { if (!ignore) setState(ok); });
    return () => { ignore = true; };
  }, []);
  return state;
}
