import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './hooks/useApi.js';
import { useWebSocket } from './hooks/useWebSocket.js';
import { useConversations } from './hooks/useConversations.js';
import { useActiveRuns } from './hooks/useActiveRuns.js';
import { useTodos } from './hooks/useTodos.js';
import { useEmotes } from './hooks/useEmotes.js';
import { useStickyScroll } from './hooks/useStickyScroll.js';
import CitySidebar from './components/CitySidebar.jsx';
import CityMap from './components/CityMap.jsx';
import CityBuildings from './components/CityBuildings.jsx';
import CityInterior from './components/CityInterior.jsx';
import PersonPicker from './components/PersonPicker.jsx';
import PersonEditor from './components/PersonEditor.jsx';
import AgentHistory from './components/AgentHistory.jsx';
import MessageBubble from './components/MessageBubble.jsx';
import DiffViewer from './components/DiffViewer.jsx';
import UsagePanel from './components/UsagePanel.jsx';
import ConfigPanel from './components/ConfigPanel.jsx';
import TaskBoard from './components/TaskBoard.jsx';
import TreasuryHud from './components/TreasuryHud.jsx';
import TreasuryPanel from './components/TreasuryPanel.jsx';
import NewCityModal from './components/NewCityModal.jsx';
import NewBuildingModal from './components/NewBuildingModal.jsx';
import TodoPanel from './components/TodoPanel.jsx';
import HandoffCourier from './components/HandoffCourier.jsx';
import { conversationToMarkdown } from './lib/transcript.js';

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

export default function App() {
  const [tree, setTree] = useState({ cities: [], allPeople: [] });
  const [loadError, setLoadError] = useState(null);
  const [cityId, setCityId] = useState(null);
  const [buildingId, setBuildingId] = useState(null);
  const [personId, setPersonId] = useState(null);
  const [input, setInput] = useState('');
  const [historyReload, setHistoryReload] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [showUsage, setShowUsage] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [showTreasury, setShowTreasury] = useState(false);
  const [treasury, setTreasury] = useState(null);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [creatingPerson, setCreatingPerson] = useState(false);
  const [creatingCity, setCreatingCity] = useState(false);
  const [creatingBuildingCityId, setCreatingBuildingCityId] = useState(null);
  // A transient paper-plane courier that flies across the screen on a handoff.
  const [handoffFx, setHandoffFx] = useState(null);
  const handoffSeq = useRef(0);

  const conv = useConversations();
  const activeRuns = useActiveRuns();
  const todos = useTodos();
  const emotes = useEmotes();
  // Fan each WS frame to the per-person chat state, the live-activity tracker
  // (refetches /api/agents/active on run start/finish), the live todos store, and
  // the office-floor status emotes.
  const onWsMessage = useCallback(
    (msg) => {
      conv.onWsMessage(msg);
      activeRuns.onWsMessage(msg);
      todos.onWsMessage(msg);
      emotes.onWsMessage(msg);
      // A run finishing changes the Recent-runs list — refetch it. The row is
      // finalized (done/cancelled/error) before this frame is broadcast, so the
      // panel (which otherwise only refreshes on spawn/filter/↻) would keep
      // showing a stale 'running' without this.
      if (msg?.type === 'agent:done') setHistoryReload((n) => n + 1);
    },
    [conv.onWsMessage, activeRuns.onWsMessage, todos.onWsMessage, emotes.onWsMessage],
  );
  const { status: wsStatus } = useWebSocket(WS_URL, { onMessage: onWsMessage });

  // After a WS reconnect (an 'open' that follows a 'closed'), resync any chat
  // left wedged in 'running' because its run finished while the socket was down
  // (the hub broadcast has no replay). Skipped on the initial connect.
  const resyncConversations = conv.resyncAfterReconnect;
  const wsWasClosed = useRef(false);
  useEffect(() => {
    if (wsStatus === 'closed') wsWasClosed.current = true;
    else if (wsStatus === 'open' && wsWasClosed.current) {
      wsWasClosed.current = false;
      resyncConversations();
    }
  }, [wsStatus, resyncConversations]);

  // Load (and reload) the city/building/people catalogue. Called on mount and
  // after a citizen edit, so a changed name / model / icon re-renders.
  const reloadTree = useCallback(() => {
    api.getCities()
      .then((t) => setTree({ cities: t.cities || [], allPeople: t.allPeople || [] }))
      .catch((e) => setLoadError(e.message));
  }, []);

  useEffect(() => { reloadTree(); }, [reloadTree]);

  // Treasury HUD: refetch the gold/tools/leaderboard on mount and whenever a run
  // finishes (historyReload bumps on agent:done), so the numbers tick up live.
  useEffect(() => { api.treasury().then(setTreasury).catch(() => {}); }, [historyReload]);

  const city = useMemo(() => tree.cities.find((c) => c.id === cityId) || null, [tree, cityId]);
  const buildings = city?.buildings || [];
  const building = buildings.find((b) => b.id === buildingId);
  const buildingName = building?.name;
  // Citizens are staffed PER BUILDING (a workspace's team), so the roster only
  // exists once a building is selected — which matches the drill-down below.
  const people = building?.people || [];
  const person = useMemo(
    () => people.find((p) => p.id === personId) || tree.allPeople.find((p) => p.id === personId) || null,
    [people, personId, tree],
  );

  // The conversation shown for the selected person (persists across navigation).
  const current = conv.get(personId);

  // Live agent-todos for the shown run (active while running, last run after it
  // ends). Seed from the API on change; live todo:update events keep it fresh.
  const panelRunId = current.activeRunId || current.lastRunId;
  const loadTodos = todos.loadRun; // stable useCallback — alias so the effect dep is precise
  useEffect(() => { if (panelRunId) loadTodos(panelRunId); }, [panelRunId, loadTodos]);

  // Bumping this re-triggers AgentHistory's self-fetch (e.g. after a spawn).
  const refreshHistory = useCallback(() => setHistoryReload((n) => n + 1), []);

  const scrollRef = useStickyScroll(current.messages.length + current.liveText.length);

  // --- Drill-down navigation: Map ▸ City (buildings) ▸ Building (citizens) ▸ Person.
  // Navigation no longer resets chat — each person's thread is kept in the map.
  const goHome = useCallback(() => { setCityId(null); setBuildingId(null); setPersonId(null); }, []);
  // Entering a city shows its buildings (no auto-selected workspace), so clear
  // the building + person.
  const selectCity = useCallback((id) => { setCityId(id); setBuildingId(null); setPersonId(null); }, []);
  const selectBuilding = useCallback((bid) => { setBuildingId(bid); setPersonId(null); }, []);
  const selectPerson = useCallback((pid) => setPersonId(pid), []);

  // Clicking a blank lot opens a lightweight "add new" modal for the current
  // screen's entity (city / building / citizen).
  const onAddCity = useCallback(() => setCreatingCity(true), []);
  const onAddBuilding = useCallback(() => setCreatingBuildingCityId(cityId), [cityId]);
  const onAddPerson = useCallback(() => setCreatingPerson(true), []);

  // After a citizen is created: reload the catalogue, and (if asked) roster the
  // new citizen into the CURRENT BUILDING so they appear in the list immediately.
  // Uses the focused roster endpoint — `building` here comes from the resolved
  // tree, so sending it back through saveCity would persist a machine-absolute
  // absolutePath and drop the sibling buildings.
  const onPersonCreated = useCallback((newId, addToBuilding) => {
    if (addToBuilding && cityId && building) {
      const ids = (building.people || []).map((p) => p.id);
      api.saveBuildingRoster(cityId, building.id, [...ids, newId])
        .then(reloadTree).catch(reloadTree);
    } else {
      reloadTree();
    }
  }, [cityId, building, reloadTree]);

  const sendPrompt = useCallback(async (text, targetPersonId) => {
    const pid = targetPersonId || personId;
    const trimmed = (text ?? input).trim();
    if (!trimmed || !pid) return;
    if (!buildingId) {
      conv.pushNote(pid, '⚠ Pick a building (workspace) in the right panel first.');
      return;
    }
    if (targetPersonId && targetPersonId !== personId) {
      // Handoff: switch to the target citizen and start a FRESH thread for them
      // (the receiving Person gets zero history — the prompt carries it all).
      conv.resetConvo(targetPersonId);
      setPersonId(targetPersonId);
    }
    conv.pushUser(pid, trimmed);
    if (!targetPersonId) setInput('');
    try {
      // Resume that person's CLI session for follow-ups; a handoff starts fresh.
      const sessionId = targetPersonId ? null : conv.get(pid).sessionId;
      const { runId } = await api.spawn({ personId: pid, cityId, buildingId, prompt: trimmed, sessionId });
      conv.startRun(pid, runId);
      emotes.startRun(pid, runId);
      setTimeout(refreshHistory, 600);
    } catch (e) {
      conv.pushNote(pid, `⚠ spawn failed: ${e.message}`);
    }
  }, [input, personId, buildingId, cityId, conv, emotes, refreshHistory]);

  const onHandoff = useCallback((h) => {
    // Fly a courier to the receiving citizen (named, falling back to the id), then
    // clear it after the flight. The seq guards against an earlier flight's timer
    // clobbering a newer one if you hand off twice in quick succession.
    const target = tree.allPeople?.find((p) => p.id === h.targetPersonId);
    const id = (handoffSeq.current += 1);
    setHandoffFx({ id, name: target?.name || h.targetPersonId });
    setTimeout(() => setHandoffFx((fx) => (fx && fx.id === id ? null : fx)), 2800);
    sendPrompt(h.prompt, h.targetPersonId);
  }, [sendPrompt, tree.allPeople]);

  // Open the current building's workspace folder in VS Code (the backend runs
  // `code <folder>`). Best-effort — surface a note in the thread if it can't.
  const onOpenVSCode = useCallback(async () => {
    if (!cityId || !buildingId) return;
    try {
      const res = await api.openWorkspace({ cityId, buildingId });
      if (!res?.opened) conv.pushNote(personId, `⚠ Couldn't open VS Code: ${res?.error || 'unknown error'}`);
    } catch (e) {
      conv.pushNote(personId, `⚠ Couldn't open VS Code: ${e.message}`);
    }
  }, [cityId, buildingId, personId, conv]);

  // Spawn an agent on a work order: navigate to the task's citizen so the run is
  // visible and streams into that thread, fire the spawn with the task's own
  // city/building/person + prompt, and flip the task to in_progress. Only called
  // for tasks that have both a citizen and a building (the board gates ▶ Run).
  const onSpawnTask = useCallback(async (task) => {
    const pid = task.person_id;
    const bid = task.building_id;
    const cid = task.city_id;
    const prompt = (task.description || task.title || '').trim();
    if (!pid || !bid || !prompt) return;
    setShowTasks(false);
    setCityId(cid); setBuildingId(bid); setPersonId(pid);
    conv.pushUser(pid, prompt);
    try {
      const sessionId = conv.get(pid).sessionId;
      const { runId } = await api.spawn({ personId: pid, cityId: cid, buildingId: bid, prompt, sessionId });
      conv.startRun(pid, runId);
      emotes.startRun(pid, runId);
      // Flip the work order to in-progress; if that fails the run still started,
      // so surface it in the thread the user just landed in rather than swallowing.
      api.updateTask(task.id, { status: 'in_progress' })
        .catch(() => conv.pushNote(pid, "⚠ couldn't mark the work order in-progress (the run still started)"));
      setTimeout(refreshHistory, 600);
    } catch (e) {
      conv.pushNote(pid, `⚠ spawn failed: ${e.message}`);
    }
  }, [conv, emotes, refreshHistory]);

  const exportChat = useCallback(() => {
    if (!person || !current.messages.length) return;
    const stamp = new Date();
    const header = `# Conversation — ${person.name}${buildingName ? ` @ ${buildingName}` : ''}\n\n_${stamp.toLocaleString()}_\n\n`;
    const md = header + conversationToMarkdown(current.messages, { personName: person.name });
    const url = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${person.id}-${stamp.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [person, current, buildingName]);

  const running = current.status === 'running';

  return (
    <div className="app">
      <CitySidebar cities={tree.cities} selectedCityId={cityId} onSelectCity={selectCity} />

      <main className="main">
        <header className="topbar">
          <span className="brand">🏙 Simulated Agent City Hub</span>
          <nav className="crumbs">
            <button className="crumb-home" onClick={goHome}>🗺 Map</button>
            {city && <><span className="crumb-sep">▸</span><button onClick={() => { setBuildingId(null); setPersonId(null); }}>{city.name}</button></>}
            {city && buildingName && <><span className="crumb-sep">▸</span><button onClick={() => setPersonId(null)}>{buildingName}</button></>}
            {person && <><span className="crumb-sep">▸</span><span className="crumb-current">{person.name}</span></>}
          </nav>
          <span className={`ws ws-${wsStatus}`}>{wsStatus}</span>
          <TreasuryHud data={treasury} active={showTreasury} onClick={() => { setShowTreasury((s) => !s); setShowTasks(false); setShowUsage(false); setShowDiff(false); setShowConfig(false); }} />
          <button className={showTasks ? 'active' : ''} onClick={() => { setShowTasks((s) => !s); setShowUsage(false); setShowDiff(false); setShowConfig(false); setShowTreasury(false); }}>Tasks</button>
          <button className={showUsage ? 'active' : ''} onClick={() => { setShowUsage((s) => !s); setShowDiff(false); setShowConfig(false); setShowTasks(false); setShowTreasury(false); }}>Usage</button>
          <button className={showDiff ? 'active' : ''} onClick={() => { setShowDiff((s) => !s); setShowUsage(false); setShowConfig(false); setShowTasks(false); setShowTreasury(false); }}>Changes</button>
          <button className={showConfig ? 'active' : ''} onClick={() => { setShowConfig((s) => !s); setShowUsage(false); setShowDiff(false); setShowTasks(false); setShowTreasury(false); }}>Config</button>
          <button onClick={() => setShowHistory((s) => !s)}>History</button>
          {person && current.messages.length > 0 && (
            <button onClick={exportChat} title="Export this conversation as markdown">Export</button>
          )}
        </header>

        <section className="content">
          {loadError && (
            <div className="error">
              Failed to load catalogue: {loadError}. Is the backend running on :3141?
            </div>
          )}

          {showConfig ? (
            <ConfigPanel allPeople={tree.allPeople} onSaved={reloadTree} />
          ) : showTasks ? (
            <TaskBoard cities={tree.cities} allPeople={tree.allPeople} defaultCityId={cityId} onSpawnTask={onSpawnTask} />
          ) : showTreasury ? (
            <TreasuryPanel data={treasury} people={tree.allPeople} />
          ) : showUsage ? (
            <UsagePanel />
          ) : showDiff ? (
            buildingId ? (
              <DiffViewer cityId={cityId} buildingId={buildingId} />
            ) : (
              <p className="view-sub">Pick a city and building to review its changes.</p>
            )
          ) : (
          <>
          {!person && !city && (
            <CityMap
              cities={tree.cities}
              onEnterCity={(c) => selectCity(c)}
              cityCounts={activeRuns.cityCounts}
              onAddCity={onAddCity}
            />
          )}

          {!person && city && !buildingId && (
            <CityBuildings
              city={city}
              buildings={buildings}
              selectedBuildingId={buildingId}
              onSelectBuilding={selectBuilding}
              buildingCounts={activeRuns.buildingCounts}
              onAddBuilding={onAddBuilding}
            />
          )}

          {!person && city && buildingId && (
            <CityInterior
              cityId={city.id}
              city={city}
              people={people}
              selectedPersonId={personId}
              onSelectPerson={selectPerson}
              personCounts={activeRuns.personCounts}
              emotes={emotes.emotes}
              onAddPerson={onAddPerson}
            />
          )}

          {person && (
            <div className="chat">
              <div className="chat-toolbar">
                {buildingName && <span className="chat-where" title={building?.absolutePath || ''}>📂 {buildingName}</span>}
                <button className="open-vscode" onClick={onOpenVSCode} disabled={!buildingId}
                  title="Open this building's workspace in VS Code">
                  Open in VS Code
                </button>
              </div>
              <TodoPanel todos={todos.todosFor(panelRunId)} />
              <div className="messages" ref={scrollRef}>
                {current.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} onHandoff={onHandoff} />
                ))}
                {current.liveText && (
                  <MessageBubble message={{ id: 'live', role: 'assistant', text: current.liveText }} live />
                )}
                {running && !current.liveText && <div className="typing">…thinking</div>}
              </div>

              <form
                className="composer"
                onSubmit={(e) => { e.preventDefault(); sendPrompt(); }}
              >
                <textarea
                  value={input}
                  placeholder={`Message ${person.name}…`}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
                  }}
                />
                {running ? (
                  <button type="button" onClick={() => current.activeRunId && api.cancel(current.activeRunId)}>
                    Stop
                  </button>
                ) : (
                  <button type="submit" disabled={!input.trim()}>Send</button>
                )}
              </form>
            </div>
          )}
          </>
          )}
        </section>
      </main>

      <aside className="rightpanel">
        <PersonPicker
          city={city}
          buildings={buildings}
          selectedBuildingId={buildingId}
          onSelectBuilding={setBuildingId}
          people={people}
          selectedPersonId={personId}
          onSelectPerson={selectPerson}
          runningPersonIds={conv.runningIds}
          onEditPerson={setEditingPersonId}
          onNewPerson={() => setCreatingPerson(true)}
        />
        {showHistory && <AgentHistory reload={historyReload} people={tree.allPeople} cities={tree.cities} />}
      </aside>

      {editingPersonId && (
        <PersonEditor
          personId={editingPersonId}
          onClose={() => setEditingPersonId(null)}
          onSaved={reloadTree}
          onDeleted={(pid) => { if (pid === personId) setPersonId(null); reloadTree(); }}
        />
      )}

      {creatingPerson && (
        <PersonEditor
          createMode
          rosterName={buildingName || null}
          onClose={() => setCreatingPerson(false)}
          onCreated={onPersonCreated}
        />
      )}

      {creatingCity && (
        <NewCityModal
          onClose={() => setCreatingCity(false)}
          onCreated={(newId) => { setCreatingCity(false); reloadTree(); selectCity(newId); }}
        />
      )}

      {creatingBuildingCityId && (
        <NewBuildingModal
          cityId={creatingBuildingCityId}
          cityName={tree.cities.find((c) => c.id === creatingBuildingCityId)?.name || null}
          onClose={() => setCreatingBuildingCityId(null)}
          onCreated={() => { setCreatingBuildingCityId(null); reloadTree(); }}
        />
      )}

      {handoffFx && <HandoffCourier key={handoffFx.id} name={handoffFx.name} />}
    </div>
  );
}
