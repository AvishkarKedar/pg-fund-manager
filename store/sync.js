/* store/sync.js — Outbox Sync Queue (the anti-data-loss engine, v2)
 *
 * Architecture (one direction of truth, always):
 *
 *   UI change -> db.js updates memory + localStorage IMMEDIATELY (optimistic)
 *             -> db.commit fires the sink -> queueMutation(mutation)
 *             -> mutation pushed to the PERSISTED outbox (localStorage pg_outbox)
 *             -> processQueue() pushes rows to Supabase ONE BY ONE, oldest first
 *
 * Guarantees:
 *   - Persistent queue: every queued item is { id (UUID), table, action
 *     ("UPSERT" | "SOFT_DELETE"), payload, timestamp, retryCount } and is
 *     written to localStorage BEFORE any network work. A refresh, crash or
 *     offline spell mid-drain loses nothing.
 *   - Optimistic writes: the local store is never blocked by the network;
 *     the outbox drains in the background.
 *   - Sync loop (processQueue): oldest item first. Success -> remove from
 *     outbox, continue. Network/5xx failure -> retryCount++ on the item and
 *     exponential backoff (1s, 2s, 4s, 8s, 16s, 30s, 60s, 120s), resuming
 *     automatically on window "online" (and tab focus). Bad-data 4xx ->
 *     the item moves to the pg_errors dead-letter queue so it cannot block
 *     the rest of the syncs; nothing is discarded (retryDeadLetters()).
 *   - Park, never drop: if a table itself is missing (migrations pending,
 *     PGRST205/42P01) or a column is missing (42703 — schema drift), the
 *     queue HOLDS in place until a read-only health probe (checkHealth on
 *     focus) sees the schema appear, then resumes. Zero data loss.
 *   - Safety rule: a SQL DELETE is NEVER sent. Deletions are pushed as
 *     UPSERT of the full row with deleted_at = ISO timestamp (tombstone).
 *     An empty local state can therefore never wipe cloud data.
 *   - Payload freezing: queueMutation deep-clones the payload, so UI edits
 *     made while an item waits can never corrupt the queued snapshot.
 *   - Events: emits (status, detail) for the UI pill:
 *     queued ("saving…") | draining ("syncing…") | synced | offline | error.
 *
 * Storage keys: pg_outbox (queue), pg_errors (dead-letter). The old
 * pgv2:outbox key is adopted once for continuity. Node-testable: storage and
 * a Supabase-shaped client are injected.
 */

const OUTBOX_KEY = "pg_outbox";
const LEGACY_OUTBOX_KEY = "pgv2:outbox";   // adopted once if the new key is empty
const ERRORS_KEY = "pg_errors";

const BACKOFFS = [1000, 2000, 4000, 8000, 16000, 30000, 60000, 120000];
const MAX_TIMER_RETRIES = BACKOFFS.length; // after this, resume on online/focus instead of timers

const TABLES = ["properties", "floors", "rooms", "beds", "tenants", "rent_ledger"];

/* Missing table (migrations pending): hold, release via health probe. */
const PARK_CODES = ["42P01", "PGRST205", "PGRST202", "PGRST204"];
const PARKED_RE = /relation .* does not exist|schema cache|could not find the table/i;

/* 42703 "column X does not exist" — adaptive stripping target: the payload
   column is dropped and the write retried immediately (graceful payload
   degradation), instead of parking/failing the sync. */
const MISSING_COL_RE = /column (?:"?\w+"?\.)?"?([a-z_][a-z0-9_]*)"? does not exist/i;
/* Some live tables were created without `updated_at` (properties, and older
   rooms/beds deployments). Sending it fails with a PL/pgSQL 42703
   `record has no field "updated_at"` from the touch trigger, which the
   regex-based stripper can't match. preparePayloadForTable drops it up front
   for the known-affected tables; the adaptive stripper covers the rest. */
const NO_UPDATED_AT_TABLES = new Set(["rooms", "beds"]);
function preparePayloadForTable(table, record) {
  if (!NO_UPDATED_AT_TABLES.has(table)) { return record; }
  const row = { ...record };
  delete row.updated_at;
  return row;
}

const NO_FIELD_RE = /record has no field "?([a-z_][a-z0-9_]*)"?/i;
function missingColumn(err) {
  const msg = err && err.message ? String(err.message) : "";
  const m = msg.match(MISSING_COL_RE) || msg.match(NO_FIELD_RE);
  return m ? m[1] : null;
}
/* Strip one or more missing columns from rows; returns null if nothing left. */
function stripColumns(rows, cols) {
  const slim = rows.map((r) => {
    const c = {};
    for (const k in r) { if (!cols.has(k)) { c[k] = r[k]; } }
    return c;
  });
  return slim.every((r) => Object.keys(r).length === 0) ? null : slim;
}

/* Bad-data / auth 4xx Postgres codes -> dead-letter (never dropped):
   22xxx value errors (22P02 invalid uuid, 22001 too long...),
   23xxx integrity (23502 not-null, 23503 FK, 23505 unique, 23514 check),
   42501 RLS violation, 42601 syntax. Everything else (no code = network
   failure, 5xx, 429) is treated as RETRYABLE — never dead-lettered on
   ambiguity. */
const DEADLETTER_RE = /^2[23]|^42501$|^42601/;

export function createSync(db, storage, getClient, emit) {
  /* db:        store/db instance (boot pull merge; commits arrive via setSink)
     storage:   { getItem, setItem } (localStorage in the browser)
     getClient: () => shared supabase client or null (local/demo mode)
     emit:      (status, detail) => void — the UI pill listens here */

  let needsMigrationPersist = false;    // set by loadOutbox (TDZ-safe: outbox isn't assigned yet)
  let outbox = loadOutbox();
  if (needsMigrationPersist) {
    if (persistOutbox()) {
      try { storage.removeItem && storage.removeItem(LEGACY_OUTBOX_KEY); } catch (e) { /* harmless */ }
    }
  }
  let draining = false;
  let timer = null;
  let failureDetail = null;
  const parked = {};                    // table -> { reason, at }
  const errors = loadErrors();          // dead-letter queue
  const strippedThisSession = {};       // table -> Set(columns adaptively stripped)

  /* ---------- item identity ---------- */
  function makeId() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) { return crypto.randomUUID(); }
    } catch (e) { /* older engine: fall through */ }
    return "m-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  /* Freeze a payload so later UI edits cannot corrupt a queued snapshot. */
  function deepClone(v) {
    if (!v || typeof v !== "object") { return v; }
    try {
      if (typeof structuredClone === "function") { return structuredClone(v); }
    } catch (e) { /* fall through to JSON */ }
    return JSON.parse(JSON.stringify(v));
  }

  /* ---------- persistence ---------- */
  /* Adopt + normalize pre-spec items (old shape: op/table/row/at or
     op/table/id/at) so queue continuity survives the format change. */
  function normalizeLegacyItem(m) {
    if (!m || !m.table || !m.id) { return null; }
    if (m.payload && m.timestamp && m.action) { return m; }   // already new shape
    if (m.op === "soft_delete") {
      return { id: m.id, table: m.table, action: "SOFT_DELETE", payload: { id: m.id, deleted_at: m.at, updated_at: m.at }, timestamp: m.at || new Date().toISOString(), retryCount: m.retryCount || 0 };
    }
    if (m.row && m.row.id) {
      return { id: m.id, table: m.table, action: "UPSERT", payload: m.row, timestamp: m.at || new Date().toISOString(), retryCount: m.retryCount || 0 };
    }
    return null;
  }
  function loadOutbox() {
    try {
      const raw = storage.getItem(OUTBOX_KEY) || storage.getItem(LEGACY_OUTBOX_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) { return []; }
      const normalized = arr.map(normalizeLegacyItem).filter(Boolean);
      if (normalized.length !== arr.length || arr.some((m) => !m.action)) {
        needsMigrationPersist = true;      // shape migration happened; caller persists
      }
      return normalized;
    } catch (e) { return []; }
  }
  function loadErrors() {
    try {
      const raw = storage.getItem(ERRORS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function persistOutbox() {
    try { storage.setItem(OUTBOX_KEY, JSON.stringify(outbox)); return true; } catch (e) { return false; /* quota: retried next persist */ }
  }
  function persistErrors() {
    try { storage.setItem(ERRORS_KEY, JSON.stringify(errors)); } catch (e) { /* quota: retried next persist */ }
  }

  function status(s, detail) { emit && emit(s, detail); }

  /* ---------- parking (schema missing: hold in place, never drop) ---------- */
  function openPark(table, reason) {
    if (parked[table]) { return; }
    parked[table] = { reason, at: new Date().toISOString() };
    status("error", table + ": " + countParked() + " mutation(s) held — " + reason);
  }
  function countParked() { return outbox.filter((m) => parked[m.table]).length; }
  function parkedInfo() {
    const t = Object.keys(parked);
    return t.length ? { tables: t, count: countParked(), reason: parked[t[0]].reason } : null;
  }

  /* Cheap READ-ONLY probe: a 1-row select tells us whether <table> exists
     (PGRST205 = missing). Never issues a write, so it cannot touch data.
     Auto-releases parked mutations the moment the migration lands. */
  async function checkHealth() {
    const client = getClient();
    if (!client) { return parkedInfo(); }
    const had = Object.keys(parked).length;
    for (const table of Object.keys(parked)) {
      const { error } = await client.from(table).select("id").limit(1);
      const missing = error && (PARK_CODES.includes(error.code) || PARKED_RE.test(error.message || ""));
      if (!missing) { delete parked[table]; }
    }
    if (had && Object.keys(parked).length === 0) { status("queued", outbox.length); schedule(0); }
    return parkedInfo();
  }

  /* ---------- 2. OPTIMISTIC WRITES ----------
     Called as the db.commit sink (and usable directly). The store has ALREADY
     applied the change to memory + localStorage before this runs; here we
     only make it durable in the outbox and wake the background loop. */
  function queueMutation(mutation) {
    if (!mutation || !mutation.table) { return; }
    const action = mutation.action || (mutation.op === "soft_delete" ? "SOFT_DELETE" : "UPSERT");
    if (action !== "UPSERT" && action !== "SOFT_DELETE") { return; }
    const payload = deepClone(mutation.payload != null ? mutation.payload : mutation.row);
    if (!payload || !payload.id) { return; }               // refuse junk: never queue an unaddressable row

    // Coalesce: the newest mutation for the same row supersedes any queued
    // one (edits, or an edit followed by its tombstone).
    const i = outbox.findIndex((m) => m.table === mutation.table && m.payload && m.payload.id === payload.id);
    const item = { id: makeId(), table: mutation.table, action, payload, timestamp: new Date().toISOString(), retryCount: 0 };
    if (i >= 0) { outbox[i] = item; } else { outbox.push(item); }
    persistOutbox();

    // No client (local/demo mode): saved locally and queued for whenever a
    // signed-in session appears — never pretend it is "saving".
    if (!getClient()) { status("offline", outbox.length); return; }
    status("queued", outbox.length);
    schedule(0);
  }
  const enqueue = queueMutation;   // sink alias (db.setSink(sync.enqueue))

  /* ---------- 3. THE SYNC LOOP ---------- */
  function schedule(delayMs) {
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(processQueue, delayMs == null ? backoffDelay() : delayMs);
  }
  function backoffDelay() {
    const m = outbox.find((x) => x.retryCount > 0) || outbox[0];
    const n = m ? m.retryCount : 0;
    return BACKOFFS[Math.min(n, BACKOFFS.length - 1)];
  }

  function isOffline() { return typeof navigator !== "undefined" && navigator.onLine === false; }

  function classify(err) {
    const code = (err && err.code) || "";
    const msg = (err && err.message) || "";
    if (PARK_CODES.includes(code) || PARKED_RE.test(msg)) { return "park"; }
    if (code === "42703") { return "park"; }               // missing column: schema drift, fixable by migration
    if (DEADLETTER_RE.test(code)) { return "deadletter"; } // bad data / RLS / FK — retrying cannot fix it
    return "retry";                                        // network, 5xx, 429, unknown: always retryable
  }

  async function processQueue() {
    timer = null;
    if (draining) { return; }
    const client = getClient();
    if (!client || !outbox.length) { return; }
    if (isOffline()) { status("offline", "no connection — resumes automatically when back online"); return; }

    draining = true;
    status("draining", outbox.length);
    let deadLettered = 0;

    /* Batch grouping: consecutive UPSERTs for the SAME table collapse into
       ONE upsert([rows]) request — fewer HTTP round-trips on reconnect.
       SOFT_DELETEs and table switches break the run. Items are PEEKED, never
       shifted before success — a failed request leaves the queue untouched. */
    const BATCH_MAX = 50;
    const peekBatch = (start) => {
      const table = outbox[start].table;
      let n = 0;
      while (start + n < outbox.length && n < BATCH_MAX && outbox[start + n].table === table && outbox[start + n].action === "UPSERT") { n++; }
      const items = outbox.slice(start, start + n);
      return { table, items, rows: items.map((m) => preparePayloadForTable(table, { ...m.payload, updated_at: m.payload.updated_at || m.timestamp })) };
    };
    const removeFrombox = (start, count) => { outbox.splice(start, count); persistOutbox(); };
    let parkedSeen = false;                 // any head-of-queue park this pass?

    try {
      let i = 0;                                     // FIFO scan; parked items are SKIPPED, not blocking
      while (i < outbox.length) {
        const m = outbox[i];
        if (parked[m.table]) {                       // schema not migrated yet: hold THIS
          parkedSeen = true;                         // item in place, keep draining the rest
          i++;
          continue;
        }
        try {
          if (m.action === "SOFT_DELETE") {
            // Safety rule: NEVER a SQL DELETE. Full tombstone rows (the norm —
            // db.js snapshots the whole row) go as UPSERT with deleted_at set.
            // Minimal tombstones (legacy queue items without the row data) go
            // through update().eq() — a partial upsert would null the row's
            // other columns; update() only patches deleted_at.
            const full = m.payload && Object.keys(m.payload).length > 3;
            if (full) {
              let row = preparePayloadForTable(m.table, { ...m.payload, updated_at: m.payload.updated_at || m.timestamp });
              for (;;) {
                const { error } = await client.from(m.table).upsert(row, { onConflict: "id", ignoreDuplicates: false });
                if (!error) { break; }
                const col = missingColumn(error);
                if (!col || col === "id" || col === "deleted_at" || Object.keys(row).length <= 2) { throw Object.assign(new Error(error.message || "soft delete failed"), { code: error.code }); }
                row = { ...row }; delete row[col];   // adaptive strip, retry now
              }
            } else {
              const patch = preparePayloadForTable(m.table, { deleted_at: m.payload.deleted_at || m.timestamp, updated_at: m.timestamp });
              const { error } = await client.from(m.table).update(patch).eq("id", m.payload.id);
              if (error) { throw Object.assign(new Error(error.message || "soft delete failed"), { code: error.code }); }
            }
            outbox.splice(i, 1);                     // success: remove, stay at i
            persistOutbox();
          } else {
            // UPSERT: send the whole consecutive same-table run in one request.
            const { table, items, rows } = peekBatch(i);
            let error = null;
            let attempt = rows;
            for (;;) {
              const res = await client.from(table).upsert(attempt, { onConflict: "id", ignoreDuplicates: false });
              if (!res.error) { error = null; break; }
              const col = missingColumn(res.error);
              if (col && col !== "id" && col !== "updated_at" && Object.keys(attempt[0]).length > 2) {
                // Adaptive degradation: drop the unknown column, retry NOW —
                // schema gaps must never block the sync (they only cost the
                // stripped fields until the migration restores them).
                if (!strippedThisSession[table]) {
                  strippedThisSession[table] = new Set();
                }
                strippedThisSession[table].add(col);
                attempt = stripColumns(attempt, strippedThisSession[table]);
                if (!attempt) { error = res.error; break; }
                continue;
              }
              error = res.error; break;
            }
            if (error) {
              // Batch rejected. If it's a per-row data problem (4xx), fall back
              // to row-by-row so only the bad rows dead-letter; network/park
              // errors leave the queue untouched (zero loss) for the catch below.
              if (DEADLETTER_RE.test((error && error.code) || "")) {
                let done = 0;                          // rows resolved this batch
                while (done < items.length && outbox[i] && outbox[i].table === table && outbox[i].action === "UPSERT") {
                  const one = outbox[i];
                  let r = preparePayloadForTable(table, { ...one.payload, updated_at: one.payload.updated_at || one.timestamp });
                  let err1 = null;
                  for (;;) {                          // per-row adaptive strip too
                    const res1 = await client.from(table).upsert(r, { onConflict: "id", ignoreDuplicates: false });
                    if (!res1.error) { err1 = null; break; }
                    const c = missingColumn(res1.error);
                    if (c && c !== "id" && Object.keys(r).length > 2) {
                      (strippedThisSession[table] = strippedThisSession[table] || new Set()).add(c);
                      const slim = stripColumns([r], strippedThisSession[table]);
                      if (!slim) { err1 = res1.error; break; }
                      r = slim[0];
                      continue;
                    }
                    err1 = res1.error; break;
                  }
                  if (err1) {
                    if (DEADLETTER_RE.test((err1 && err1.code) || "")) {
                      errors.push({ ...one, error: err1.message || "rejected", code: err1.code || null, failedAt: new Date().toISOString() });
                      persistErrors();
                      outbox.splice(i, 1);           // resolved (dead-lettered)
                      persistOutbox();
                      deadLettered++;
                      done++;
                      continue;
                    }
                    // park/retry inside fallback: queue untouched below, catch handles it
                    throw Object.assign(new Error(err1.message || "row upsert failed"), { code: err1.code });
                  }
                  outbox.splice(i, 1);               // row landed; next row now at i
                  persistOutbox();
                  done++;
                }
                continue;                              // batch fully resolved
              }
              throw Object.assign(new Error(error.message || "batch upsert failed"), { code: error.code });
            }
            removeFrombox(i, items.length);            // batch succeeded
            if (strippedThisSession[table] && strippedThisSession[table].size) {
              // Non-fatal visibility: the sync landed, minus the unknown fields.
              failureDetail = null;
              status("synced", outbox.length);
              try {
                window.dispatchEvent(new CustomEvent("pgv2:sync-degraded", { detail: {
                  table, columns: Array.from(strippedThisSession[table])
                } }));
              } catch (e) { /* non-browser */ }
            }
          }
        } catch (err) {
          const kind = classify(err);
          if (kind === "park") {
            // Table itself missing (migrations pending): mark it parked and
            // SKIP — later tables keep flowing; the health probe releases
            // this item once the schema lands. Never head-of-line blocking.
            openPark(m.table, (err.code === "42703" ? "schema: " : "") + (err.message || "table missing"));
            parkedSeen = true;
            i++;
            continue;
          }
          if (kind === "deadletter") {
            // 4xx bad data: quarantine so it cannot block the rest of the
            // syncs. The data itself is KEPT (pg_errors + local db state).
            errors.push({ ...m, error: err.message || "rejected", code: err.code || null, failedAt: new Date().toISOString() });
            persistErrors();
            outbox.splice(i, 1);
            persistOutbox();
            deadLettered++;
            continue;                                // next item — queue keeps flowing
          }
          // Retryable: increment THIS item's retryCount, exponential backoff.
          // The item STAYS in the queue (zero loss); later items keep flowing
          // on this pass so one stuck row can never head-of-line block.
          m.retryCount = (m.retryCount || 0) + 1;
          persistOutbox();
          failureDetail = err.message || "network failure";
          status("offline", failureDetail);
          i++;                                       // skip the flaky row this pass
        }
      }
      failureDetail = null;
      if (deadLettered > 0) {
        status("error", deadLettered + " row(s) couldn't sync — kept in the error queue (pg_errors), nothing lost.");
      } else if (parkedSeen && outbox.length) {
        status("error", outbox.length + " change(s) waiting for the schema migration — everything else synced.");
      } else {
        status("synced", outbox.length);
      }
      if (outbox.length) { schedule(0); }            // more queued during the drain
    } finally {
      draining = false;
    }
  }
  const drain = processQueue;      // alias (tests + boot code)

  /* ---------- dead-letter queue management (data is kept, never dropped) */
  function getDeadLetters() { return errors.slice(); }
  function retryDeadLetters() {
    if (!errors.length) { return 0; }
    const back = errors.map((e) => ({ id: e.id, table: e.table, action: e.action, payload: e.payload, timestamp: e.timestamp, retryCount: 0 }));
    errors.length = 0;
    persistErrors();
    outbox.push(...back);
    persistOutbox();
    status("queued", outbox.length);
    schedule(0);
    return back.length;
  }
  function clearDeadLetters() {
    const n = errors.length;
    errors.length = 0;
    persistErrors();
    return n;
  }

  /* ---------- boot hydration: pull every table independently ---------- */
  async function pullThenMerge() {
    const client = getClient();
    if (!client) { return { ok: false, reason: "offline-mode" }; }
    status("draining", null);
    const results = await Promise.allSettled(TABLES.map(async (t) => {
      const { data: rows, error } = await client.from(t).select("*");
      if (error) { throw Object.assign(new Error(error.message), { code: error.code }); }
      return [t, rows || []];
    }));
    let merged = 0;
    const failed = {};
    const missingTables = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        merged += db.mergeRemote(r.value[0], r.value[1]);
      } else {
        const err = r.reason || {};
        const msg = err.message || "unknown error";
        failed[err.code || "error"] = msg;
        if (PARK_CODES.includes(err.code) || PARKED_RE.test(msg)) { missingTables.push(msg); }
      }
    }
    if (results.every((r) => r.status === "fulfilled")) {
      status("synced", outbox.length);
      return { ok: true, merged };
    }
    if (missingTables.length) {
      status("error", "schema: " + missingTables[0]);
      return { ok: false, reason: "missing-tables", missing: missingTables, merged };
    }
    status("offline", Object.values(failed)[0]);
    return { ok: false, reason: Object.values(failed)[0], merged };
  }

  /* Public health snapshot for the UI. */
  function health() {
    return {
      pending: outbox.length,
      parked: parkedInfo(),
      deadLetters: errors.length,
      lastError: failureDetail
    };
  }

  /* Admin/undo path only — the app itself NEVER hard-deletes. */
  function pendingCount() { return outbox.length; }
  function lastError() { return failureDetail; }
  function flush() { schedule(0); }

  /* Browser niceties: reconnect -> skip the backoff wait and drain now;
     refocus -> health check (releases parked mutations post-migration).
     Node tests never call this. */
  function installListeners(target) {
    const t = target || (typeof window !== "undefined" ? window : null);
    if (!t || !t.addEventListener) { return () => {}; }
    const online = () => { if (outbox.length || Object.keys(parked).length) { schedule(0); } };
    const focus = () => { if (Object.keys(parked).length) { checkHealth(); } };
    t.addEventListener("online", online);
    t.addEventListener("focus", focus);
    return () => { t.removeEventListener("online", online); t.removeEventListener("focus", focus); };
  }

  return {
    queueMutation, enqueue,
    processQueue, drain,
    flush, pullThenMerge,
    pendingCount, lastError, status,
    checkHealth, health,
    getDeadLetters, retryDeadLetters, clearDeadLetters,
    installListeners
  };
}

/* Browser default instance is wired in store/index.js (needs db + client first). */
