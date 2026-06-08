import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './useApi.js';

// Tracks where agents are CURRENTLY working, for the live counts on the themed
// map views. The source of truth is server-side: GET /api/agents/active returns
// the running + queued agent_runs rows (with city/building/person ids). The WS
// agent:* events carry only a runId — never city/building — so counts can't be
// derived from them or from per-client chat state (useConversations only knows
// runs THIS browser started). We therefore seed from the endpoint and refetch
// on run-lifecycle boundaries:
//   • a run STARTS  → first sight of an unknown runId (its first WS frame is
//                     agent:model), so the count grew.
//   • a run FINISHES → agent:done for a known runId, so the count dropped.
// Steady token streaming (agent:output for a known run) triggers no refetch, so
// it's at most a couple of small fetches per run. Correct across multiple
// browser clients and across the queued→running flip, which chat state misses.
export function useActiveRuns() {
  const [runs, setRuns] = useState([]); // raw agent_runs rows (running + queued)
  const seen = useRef(new Set());        // runIds already accounted for
  const timer = useRef(null);
  const live = useRef(true);             // false after unmount — don't setState on a late fetch

  const fetchActive = useCallback(() => {
    api
      .activeRuns()
      .then((rows) => {
        if (!live.current) return;
        const list = Array.isArray(rows) ? rows : [];
        setRuns(list);
        seen.current = new Set(list.map((r) => r.run_id));
      })
      .catch(() => {
        /* transient — the next lifecycle event schedules another refetch */
      });
  }, []);

  // Debounced + coalesced: a burst of lifecycle events collapses to one fetch.
  const scheduleRefetch = useCallback(() => {
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      fetchActive();
    }, 350);
  }, [fetchActive]);

  useEffect(() => {
    live.current = true; // re-arm on (re)mount — StrictMode mounts twice in dev
    fetchActive();
    return () => {
      live.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fetchActive]);

  const onWsMessage = useCallback(
    (msg) => {
      if (!msg || !msg.runId || typeof msg.type !== 'string' || !msg.type.startsWith('agent:')) return;
      if (msg.type === 'agent:done') {
        seen.current.delete(msg.runId);
        scheduleRefetch(); // a run ended — counts dropped
      } else if (!seen.current.has(msg.runId)) {
        seen.current.add(msg.runId);
        scheduleRefetch(); // a new run appeared — counts grew
      }
    },
    [scheduleRefetch],
  );

  const { cityCounts, buildingCounts, personCounts } = useMemo(() => {
    const city = {};
    const building = {};
    const person = {};
    const bump = (map, key, status) => {
      if (key == null) return;
      const c = map[key] || (map[key] = { running: 0, queued: 0 });
      if (status === 'queued') c.queued += 1;
      else c.running += 1;
    };
    for (const r of runs) {
      bump(city, r.city_id, r.status);
      if (r.building_id != null) bump(building, `${r.city_id}::${r.building_id}`, r.status);
      bump(person, r.person_id, r.status);
    }
    return { cityCounts: city, buildingCounts: building, personCounts: person };
  }, [runs]);

  return { cityCounts, buildingCounts, personCounts, onWsMessage };
}
