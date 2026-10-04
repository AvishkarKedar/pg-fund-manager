/* PG Manager — dashboard.

   No sample data lives in this file. Everything on screen comes from PGStore,
   which starts empty for every account and is filled in through the UI.
*/

/* ---------- helpers ---------- */

const el = (id) => document.getElementById(id);
const money = (n) => "\u20b9" + Number(n || 0).toLocaleString("en-IN");
const isArray = (v) => Array.isArray(v);
const BADGE = { paid: "Paid", due: "Due", late: "Overdue" };

const initials = (name) =>
  String(name || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";

/* Tenant names and phone numbers are typed by the user, so everything that
   reaches innerHTML goes through this first. */
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- toast notifications ---------- */
function toast(msg, type, duration) {
  type = type || 'success';
  duration = duration || 3000;
  var container = el('toast-container');
  if (!container) return;
  var icons = { success: '✓', error: '✕', info: 'ℹ', warn: '⚠' };
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;
  t.innerHTML = '<span class="toast-icon">' + (icons[type] || '') + '</span>' +
    '<span class="toast-body">' + esc(msg) + '</span>' +
    '<button class="toast-close" type="button" aria-label="Dismiss">✕</button>';
  t.querySelector('.toast-close').onclick = function () { removeToast(t); };
  container.appendChild(t);
  setTimeout(function () { removeToast(t); }, duration);
}
function removeToast(t) {
  if (!t || !t.parentNode) return;
  t.classList.add('removing');
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
}

/* ---------- custom confirm dialog ---------- */
var _confirmResolve = null;
function confirmAsync(opts) {
  return new Promise(function (resolve) {
    _confirmResolve = resolve;
    var dlg = el('dlg-confirm');
    var icon = el('confirm-icon');
    var title = el('confirm-title');
    var msg = el('confirm-msg');
    var okBtn = el('confirm-ok');
    var cancelBtn = el('confirm-cancel');
    var type = opts.type || 'warn';
    icon.textContent = opts.icon || (type === 'danger' ? '⚠' : type === 'success' ? '✓' : '?');
    icon.className = 'confirm-' + type;
    title.textContent = opts.title || 'Are you sure?';
    msg.textContent = opts.message || '';
    okBtn.textContent = opts.okText || 'Confirm';
    okBtn.className = type === 'danger' ? 'btn-primary btn-sm btn-danger' : 'btn-primary btn-sm';
    okBtn.style.width = 'auto';
    okBtn.style.minWidth = '120px';
    function close(result) {
      if (dlg.close) dlg.close(); else dlg.removeAttribute('open');
      if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
    }
    okBtn.onclick = function () { close(true); };
    cancelBtn.onclick = function () { close(false); };
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
}

function prettyDate(value) {
  if (!value) { return "\u2014"; }
  const d = new Date(value);
  if (isNaN(d.getTime())) { return esc(value); }
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function sinceLabel(iso) {
  const then = new Date(iso).getTime();
  if (isNaN(then)) { return ""; }
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) { return "just now"; }
  if (mins < 60) { return mins + " min ago"; }
  const hrs = Math.round(mins / 60);
  if (hrs < 24) { return hrs + (hrs === 1 ? " hour ago" : " hours ago"); }
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : days + " days ago";
}

/* Unpaid becomes "Overdue" once we are past the 10th of the month. */
function bedStatus(bed) {
  if (bed.paid) { return "paid"; }
  return new Date().getDate() > 10 ? "late" : "due";
}

function tenants() {
  const out = [];
  PGStore.state().rooms.forEach((room) => {
    room.beds.forEach((bed, i) => {
      if (!bed) { return; }
      const effRent = PGStore.effectiveRent ? PGStore.effectiveRent(room, bed) : (bed.rent || room.rent);
      out.push({
        name: bed.name,
        phone: bed.phone,
        joined: bed.joined,
        leaving: bed.leaving,
        note: bed.note,
        deposit: bed.deposit || 0,
        idType: bed.idType || "",
        idNumber: bed.idNumber || "",
        emergencyContact: bed.emergencyContact || "",
        workplace: bed.workplace || "",
        onNotice: bed.onNotice,
        paid: bed.paid,
        status: bedStatus(bed),
        roomId: room.id,
        roomNo: room.no,
        bedIndex: i,
        bed: PGStore.bedLabel(i, room.id),
        rent: effRent,
        hasCustomRent: bed.rent != null && bed.rent > 0
      });
    });
  });
  return out;
}

function totals() {
  const rooms = PGStore.state().rooms;
  const list = tenants();
  const beds = rooms.reduce((s, r) => s + r.beds.length, 0);
  const expected = list.reduce((s, t) => s + t.rent, 0);
  const collected = list.filter((t) => t.paid).reduce((s, t) => s + t.rent, 0);
  return {
    rooms: rooms.length,
    beds,
    occupied: list.length,
    vacant: beds - list.length,
    onNotice: list.filter((t) => t.onNotice).length,
    expected,
    collected,
    pending: expected - collected,
    rate: beds ? Math.round((list.length / beds) * 100) : 0
  };
}

const ICONS = {
  bed: '<path d="M4 18v-8"/><path d="M4 14h16v4"/><path d="M20 14v-1.5a2 2 0 0 0-2-2h-7V14"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3 3 0 0 1 0 4.8"/><path d="M18.5 19a5.6 5.6 0 0 0-2-4"/>',
  door: '<path d="M6 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"/><path d="M4 21h16"/><circle cx="14" cy="12" r=".6"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h11v3"/><rect x="3" y="7" width="18" height="12" rx="2.5"/><circle cx="16.5" cy="13" r="1"/>',
  rupee: '<circle cx="12" cy="12" r="9"/><path d="M9.5 8h5"/><path d="M9.5 10.5h5"/><path d="M13 10.5a2.5 2.5 0 0 1-2.5 2.5H9.5l4 4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
  receipt: '<path d="M6 3.5h12v17l-2.5-1.5-2.5 1.5-2.5-1.5L8 20.5 6 20.5Z"/><path d="M9.5 8.5h5"/><path d="M9.5 12h5"/>',
  chart: '<path d="M4.5 20V11"/><path d="M10 20V4.5"/><path d="M15.5 20v-6"/><path d="M20.5 20V8"/>'
};

/* ---------- expenses ---------- */

const EXPENSE_CATS = [
  "Electricity", "Water", "Staff salary", "Groceries",
  "Maintenance", "Internet", "Gas", "Rent to owner", "Other"
];

/* yyyy-mm for the month we are in, to match against an expense date. */
function monthKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}

function expenseSummary() {
  const list = PGStore.state().expenses || [];
  const mk = monthKey();
  const month = list.filter((x) => String(x.date).slice(0, 7) === mk);
  const byCat = {};
  month.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
  const top = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a])[0] || "";
  return {
    list,
    month,
    monthTotal: month.reduce((s, x) => s + x.amount, 0),
    allTotal: list.reduce((s, x) => s + x.amount, 0),
    byCat,
    top,
    topAmount: top ? byCat[top] : 0
  };
}

/* money() has no sign handling, so negatives are built by hand. */
function signedMoney(n) {
  return (n < 0 ? "\u2212" : "") + money(Math.abs(n));
}

function statCard(s) {
  return `
    <div class="stat">
      <div class="stat-top">
        <span class="stat-label">${s.label}</span>
        <span class="stat-ico ico-${s.tone}">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[s.icon]}</svg>
        </span>
      </div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-note ${s.cls || ""}">${s.note}</div>
    </div>`;
}

function emptyState(title, note, action) {
  return `
    <div class="empty">
      <span class="empty-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS.bed}</svg>
      </span>
      <b>${title}</b>
      <p>${note}</p>
      ${action || ""}
    </div>`;
}

/* ---------- render ---------- */

function renderStats() {
  const t = totals();
  el("stats").innerHTML = [
    { label: "Total beds", value: t.beds, note: t.rooms === 1 ? "1 room" : t.rooms + " rooms", icon: "bed", tone: "brand" },
    { label: "Occupied", value: t.occupied, note: t.beds ? t.rate + "% occupancy" : "No beds yet", cls: "up", icon: "users", tone: "green" },
    { label: "Vacant", value: t.vacant, note: t.onNotice + " on notice", cls: "warn", icon: "door", tone: "amber" },
    { label: "Collected", value: money(t.collected), note: money(t.pending) + " pending", cls: "warn", icon: "wallet", tone: "brand" }
  ].map(statCard).join("");
}

function occBar(name, filled, total) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  return `
    <div>
      <div class="bar-row-top"><span>${esc(name)}</span><b>${filled}/${total} · ${pct}%</b></div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>`;
}

/* An owner with floors switched off gets the same bars counted by room. */
function renderFloors() {
  const state = PGStore.state();
  const rooms = state.rooms;
  const t = totals();
  const useFloors = state.settings.floors !== false;

  el("occ-head").textContent = useFloors ? "Occupancy by floor" : "Occupancy by room";
  el("occ-total").textContent = t.beds ? t.occupied + " of " + t.beds + " beds filled" : "";

  if (!rooms.length) {
    el("floor-bars").innerHTML = '<p class="muted-sm">Add a room to see occupancy here.</p>';
    return;
  }

  if (!useFloors) {
    el("floor-bars").innerHTML = rooms
      .map((r) => occBar("Room " + r.no, r.beds.filter(Boolean).length, r.beds.length))
      .join("");
    return;
  }

  const floors = [];
  rooms.forEach((r) => { if (floors.indexOf(r.floor) === -1) { floors.push(r.floor); } });
  floors.sort((a, b) => a - b);

  el("floor-bars").innerHTML = floors.map((f) => {
    const on = rooms.filter((r) => r.floor === f);
    const total = on.reduce((sum, r) => sum + r.beds.length, 0);
    const filled = on.reduce((sum, r) => sum + r.beds.filter(Boolean).length, 0);
    return occBar("Floor " + f, filled, total);
  }).join("");
}

var _feedExpanded = false;
var _FEED_INITIAL = 5;

function renderFeed() {
  const items = PGStore.state().activity;
  const glyph = { pay: "\u20b9", in: "\u2192", out: "\u2190" };

  if (!items.length) {
    el("feed").innerHTML = '<li class="feed-blank">Nothing yet. Adding rooms, tenants and payments will show up here.</li>';
    return;
  }

  var showItems = _feedExpanded ? items : items.slice(0, _FEED_INITIAL);
  var hasMore = items.length > _FEED_INITIAL;

  var html = showItems.map((a) => {
    const meta = [a.meta, sinceLabel(a.at)].filter(Boolean).join(" · ");
    return `
    <li>
      <span class="ico ico-${esc(a.type)}" aria-hidden="true">${glyph[a.type] || "\u2022"}</span>
      <span class="feed-body">${esc(a.text)}<span>${esc(meta)}</span></span>
    </li>`;
  }).join("");

  if (hasMore) {
    if (_feedExpanded) {
      html += '<li class="feed-see-more"><button class="link-btn" type="button" onclick="_feedExpanded=false;renderFeed()">Show less</button></li>';
    } else {
      html += '<li class="feed-see-more"><button class="link-btn" type="button" onclick="_feedExpanded=true;renderFeed()">See ' + (items.length - _FEED_INITIAL) + ' more updates</button></li>';
    }
  }

  el("feed").innerHTML = html;
}

/* ---------- dashboard graphs ---------- */

function renderGraph() {
  const rooms = PGStore.state().rooms;
  const expenses = PGStore.state().expenses || [];
  const mk = monthKey();

  /* Build last 6 months of data */
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    const label = d.toLocaleDateString("en-IN", { month: "short" });

    /* Count collected rent for this month */
    let collected = 0;
    let expected = 0;
    rooms.forEach((room) => {
      room.beds.forEach((bed) => {
        if (!bed || !bed.joined) return;
        const rent = PGStore.effectiveRent(room, bed);
        const joinedKey = bed.joined.slice(0, 7);
        if (joinedKey <= key) {
          expected += rent;
          if (isArray(bed.paidMonths) && bed.paidMonths.indexOf(key) !== -1) {
            collected += rent;
          }
        }
      });
    });

    /* Count expenses for this month */
    const exp = expenses.filter((x) => String(x.date).slice(0, 7) === key)
      .reduce((s, x) => s + x.amount, 0);

    months.push({ key, label, collected, expected, expenses: exp });
  }

  const maxVal = Math.max(...months.map((m) => Math.max(m.collected, m.expected, m.expenses)), 1);
  const barW = 32;
  const gap = 16;
  const chartH = 140;
  const chartW = months.length * (barW * 2 + gap + 8) + 40;
  const totalCollected = months.reduce((s, m) => s + m.collected, 0);

  el("graph-total").textContent = totalCollected > 0
    ? "Total: " + money(totalCollected) + " (6 months)"
    : "Last 6 months";

  el("chart-container").innerHTML = `
    <svg viewBox="0 0 ${chartW} ${chartH + 30}" width="100%" style="min-width:${chartW}px;display:block">
      <!-- Grid lines -->
      ${[0, 0.25, 0.5, 0.75, 1].map((pct) => {
        const y = chartH - pct * chartH;
        return `<line x1="30" y1="${y}" x2="${chartW - 10}" y2="${y}" stroke="var(--border)" stroke-width="0.5" />
                <text x="26" y="${y + 4}" text-anchor="end" fill="var(--faint)" font-size="9">${pct === 0 ? "" : money(maxVal * pct)}</text>`;
      }).join("")}
      ${months.map((m, i) => {
        const x = 36 + i * (barW * 2 + gap + 8);
        const collectedH = (m.collected / maxVal) * chartH;
        const expectedH = (m.expected / maxVal) * chartH;
        const expH = (m.expenses / maxVal) * chartH;
        return `
          <!-- Expected (gray) -->
          <rect x="${x}" y="${chartH - expectedH}" width="${barW}" height="${expectedH}" rx="4" fill="var(--surface-3)" />
          <!-- Collected (blue) -->
          <rect x="${x}" y="${chartH - collectedH}" width="${barW}" height="${collectedH}" rx="4" fill="var(--brand)" opacity="0.9" />
          <!-- Expenses (amber) -->
          <rect x="${x + barW + 4}" y="${chartH - expH}" width="${barW}" height="${expH}" rx="4" fill="var(--amber)" opacity="0.8" />
          <!-- Month label -->
          <text x="${x + barW + 2}" y="${chartH + 18}" text-anchor="middle" fill="var(--muted)" font-size="11" font-weight="500">${esc(m.label)}</text>
          ${m.key === mk ? `<circle cx="${x + barW}" cy="${chartH + 26}" r="2.5" fill="var(--brand)" />` : ""}`;
      }).join("")}
    </svg>
    <div style="display:flex;gap:16px;margin-top:8px;font-size:11px;color:var(--muted)">
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--surface-3);display:inline-block"></span>Expected</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--brand);display:inline-block"></span>Collected</span>
      <span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:3px;background:var(--amber);display:inline-block"></span>Expenses</span>
    </div>`;
}

function renderRentStatus() {
  const list = tenants();
  const paid = list.filter((t) => t.paid).length;
  const overdue = list.filter((t) => !t.paid && new Date().getDate() > 10).length;
  const due = list.length - paid - overdue;
  const total = list.length;
  const expected = list.reduce((s, t) => s + t.rent, 0);
  const collected = list.filter((t) => t.paid).reduce((s, t) => s + t.rent, 0);
  const pending = expected - collected;

  if (!total) {
    el("rent-status-bars").innerHTML = '<p class="muted-sm">No tenants yet.</p>';
    return;
  }

  const barH = 8;
  const segments = [
    { label: "Paid", count: paid, color: "var(--green)", pct: (paid / total) * 100 },
    { label: "Due", count: due, color: "var(--amber)", pct: (due / total) * 100 },
    { label: "Overdue", count: overdue, color: "var(--red)", pct: (overdue / total) * 100 }
  ].filter((s) => s.count > 0);

  el("rent-status-bars").innerHTML = `
    <div style="margin-bottom:16px">
      <div style="display:flex;height:${barH}px;border-radius:99px;overflow:hidden;background:var(--surface-3)">
        ${segments.map((s) => `<div style="width:${s.pct}%;background:${s.color}"></div>`).join("")}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px">
      ${segments.map((s) => `
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500">
            <span style="width:8px;height:8px;border-radius:50%;background:${s.color};flex-shrink:0"></span>
            ${s.label}
          </span>
          <span style="font-size:13px;font-weight:600">${s.count} tenant${s.count !== 1 ? "s" : ""}</span>
        </div>`).join("")}
    </div>
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px">
      <span style="color:var(--muted)">Expected this month</span>
      <span style="font-weight:600">${money(expected)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px">
      <span style="color:var(--muted)">Collected</span>
      <span style="font-weight:600;color:var(--green)">${money(collected)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px">
      <span style="color:var(--muted)">Pending</span>
      <span style="font-weight:600;color:${pending > 0 ? "var(--amber)" : "var(--green)"}">${money(pending)}</span>
    </div>`;
}

function renderExpDashboard() {
  const x = expenseSummary();
  if (!x.list.length) {
    el("exp-dashboard").innerHTML = '<p class="muted-sm">No expenses logged yet.</p>';
    el("exp-summary").textContent = "";
    return;
  }
  el("exp-summary").textContent = x.monthTotal > 0 ? "This month: " + money(x.monthTotal) : "";
  const topCats = Object.keys(x.byCat || {}).length > 0
    ? Object.entries(x.byCat).sort((a, b) => b[1] - a[1]).slice(0, 4)
    : [];
  /* Build a simple breakdown */
  const allByCat = {};
  x.list.forEach((e) => { allByCat[e.category] = (allByCat[e.category] || 0) + e.amount; });
  const sorted = Object.entries(allByCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = sorted.length ? sorted[0][1] : 1;

  el("exp-dashboard").innerHTML = sorted.map(([cat, amt]) => `
    <div style="margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px">
        <span style="color:var(--muted);font-weight:500">${esc(cat)}</span>
        <span style="font-weight:600">${money(amt)}</span>
      </div>
      <div style="height:5px;border-radius:99px;background:var(--surface-3);overflow:hidden">
        <div style="height:100%;width:${(amt / maxCat) * 100}%;border-radius:99px;background:var(--amber);opacity:0.7"></div>
      </div>
    </div>`).join("") + `
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:12.5px">
      <span style="color:var(--muted)">Total all time</span>
      <span style="font-weight:600">${money(x.allTotal)}</span>
    </div>`;
}

function renderRooms() {
  const rooms = PGStore.state().rooms;

  if (!rooms.length) {
    el("rooms").innerHTML = emptyState(
      "No rooms yet",
      "Add your first room and the beds inside it. Everything else builds on this.",
      '<button class="btn-primary btn-sm" data-act="add-room" type="button">Add a room</button>'
    );
    return;
  }

  el("rooms").innerHTML = rooms.map((room) => {
    const filled = room.beds.filter(Boolean).length;

    const beds = room.beds.map((bed, i) => {
      const label = PGStore.bedLabel(i, room.id);
      if (!bed) {
        return `<button class="bed bed-add" type="button" data-act="fill-bed" data-room="${esc(room.id)}" data-bed="${i}">
          <b>Bed ${label}</b><span>+ Add tenant</span>
        </button>`;
      }
      const cls = bed.onNotice ? "bed bed-notice" : "bed bed-occupied";
      return `<button class="${cls}" type="button" data-act="profile" data-room="${esc(room.id)}" data-bed="${i}">
        <b>Bed ${label}</b><span>${esc(bed.name)}</span>
      </button>`;
    }).join("");

    return `
      <div class="room">
        <div class="room-head">
          <b>Room ${esc(room.no)}</b>
          <span class="room-head-right">
            <span class="muted-sm">${filled}/${room.beds.length} · ${money(room.rent)}</span>
            <button class="x-btn" type="button" data-act="edit-room" data-room="${esc(room.id)}" title="Edit room ${esc(room.no)}" aria-label="Edit room ${esc(room.no)}">✎</button>
            <button class="x-btn" type="button" data-act="del-room" data-room="${esc(room.id)}" title="Remove room ${esc(room.no)}" aria-label="Remove room ${esc(room.no)}">×</button>
          </span>
        </div>
        <div class="room-beds">${beds}</div>
      </div>`;
  }).join("");
}

var _tenantsExpanded = false;

function renderTenants() {
  const list = tenants();
  const table = document.querySelector(".table-card");
  const blank = el("tenants-empty");
  const tableWrap = el("tenant-table-wrap");
  const toggleBtn = el("tenant-toggle");
  const toggleText = el("tenant-toggle-text");

  if (!list.length) {
    table.hidden = true;
    el("tenant-cards").innerHTML = "";
    blank.hidden = false;
    blank.innerHTML = emptyState(
      "No tenants yet",
      PGStore.isEmpty()
        ? "Add a room first, then move tenants into its beds."
        : "Move someone into a vacant bed to see them listed here.",
      PGStore.isEmpty()
        ? '<button class="btn-primary btn-sm" data-act="add-room" type="button">Add a room</button>'
        : '<button class="btn-primary btn-sm" data-act="add-tenant" type="button">Add a tenant</button>'
    );
    return;
  }

  table.hidden = false;
  blank.hidden = true;
  blank.innerHTML = "";

  /* Toggle button shows count */
  if (toggleText) {
    toggleText.textContent = _tenantsExpanded
      ? "Hide " + list.length + " tenant" + (list.length !== 1 ? "s" : "")
      : "Show " + list.length + " tenant" + (list.length !== 1 ? "s" : "");
  }
  if (toggleBtn) {
    toggleBtn.setAttribute("aria-expanded", String(_tenantsExpanded));
  }
  if (tableWrap) {
    tableWrap.hidden = !_tenantsExpanded;
  }

  const actions = (t, prefix) => {
    const id = `${prefix}dd-${t.roomId}-${t.bedIndex}`;
    return `<span class="dd-wrap">
      <button class="dd-trigger" type="button" data-dd="${id}" aria-haspopup="true" aria-expanded="false">\u22ee</button>
      <span class="dd-menu" id="${id}" role="menu" hidden>
        <button class="dd-item" role="menuitem" data-act="profile" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">Profile</button>
        <button class="dd-item" role="menuitem" data-act="transfer" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">Transfer bed</button>
        <button class="dd-item" role="menuitem" data-act="backfill" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">Payment history</button>
        <button class="dd-item" role="menuitem" data-act="receipt" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">Receipt</button>
        ${!t.paid ? `<button class="dd-item" role="menuitem" data-act="wa-remind" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">WhatsApp reminder</button>` : ""}
        <button class="dd-item" role="menuitem" data-act="notice" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">${t.onNotice ? "Cancel notice" : "Put on notice"}</button>
        <span class="dd-divider"></span>
        <button class="dd-item dd-danger" role="menuitem" data-act="checkout" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}">Check out</button>
      </span>
    </span>`;
  };

  el("tenant-rows").innerHTML = list.map((t) => `
    <tr>
      <td><button class="who who-btn" type="button" data-act="profile" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}"><span class="av">${esc(initials(t.name))}</span><span class="who-name">${esc(t.name)}</span>${t.onNotice ? ' <span class="tag-notice">notice</span>' : ""}</button></td>
      <td class="mono">${esc(t.roomNo)} · ${t.bed}</td>
      <td class="mono">${esc(t.phone) || "\u2014"}</td>
      <td>${prettyDate(t.joined)}</td>
      <td class="mono">${money(t.rent)}${t.hasCustomRent ? ' <span class="tag-custom">custom</span>' : ""}</td>
      <td><span class="badge badge-${t.status}">${BADGE[t.status]}</span></td>
      <td class="row-actions">${actions(t, 'tbl-')}</td>
    </tr>`).join("");

  el("tenant-cards").innerHTML = list.map((t) => `
    <div class="tcard">
      <div class="tcard-top">
        <button class="who who-btn" type="button" data-act="profile" data-room="${esc(t.roomId)}" data-bed="${t.bedIndex}"><span class="av">${esc(initials(t.name))}</span><span class="who-name">${esc(t.name)}</span></button>
        <span class="badge badge-${t.status}">${BADGE[t.status]}</span>
      </div>
      <div class="tcard-grid">
        <div><b>Bed</b>${esc(t.roomNo)} · ${t.bed}</div>
        <div><b>Rent</b>${money(t.rent)}${t.hasCustomRent ? ' <span class="tag-custom">custom</span>' : ""}</div>
        <div><b>Phone</b>${esc(t.phone) || "\u2014"}</div>
        <div><b>Joined</b>${prettyDate(t.joined)}</div>
      </div>
      <div class="row-actions">${actions(t, 'c-')}</div>
    </div>`).join("");
}

function renderRent() {
  const list = tenants();
  const t = totals();
  const paid = list.filter((x) => x.paid).length;

  el("rent-title").textContent =
    "Rent \u2014 " + new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  el("rent-stats").innerHTML = [
    { label: "Expected", value: money(t.expected), note: list.length === 1 ? "1 tenant" : list.length + " tenants", icon: "rupee", tone: "brand" },
    { label: "Collected", value: money(t.collected), note: paid + (paid === 1 ? " payment received" : " payments received"), cls: "up", icon: "wallet", tone: "green" },
    { label: "Pending", value: money(t.pending), note: (list.length - paid) + " still to pay", cls: "warn", icon: "clock", tone: "red" }
  ].map(statCard).join("");

  if (!list.length) {
    el("paylist").innerHTML = '<li class="feed-blank">Rent appears here once tenants move in.</li>';
    return;
  }

  const order = { late: 0, due: 1, paid: 2 };
  el("paylist").innerHTML = list
    .slice()
    .sort((a, b) => order[a.status] - order[b.status])
    .map((x) => `
      <li>
        <span class="pay-left">
          <span class="av">${esc(initials(x.name))}</span>
          <span class="pay-name">${esc(x.name)}<span>Room ${esc(x.roomNo)} · Bed ${x.bed}</span></span>
        </span>
        <span class="pay-right">
          <span class="amount">${money(x.rent)}</span>
          <span class="badge badge-${x.status}">${BADGE[x.status]}</span>
          <button class="link-btn" type="button" data-act="pay" data-room="${esc(x.roomId)}" data-bed="${x.bedIndex}" data-paid="${x.paid ? "0" : "1"}">${x.paid ? "Undo" : "Mark paid"}</button>
        </span>
      </li>`).join("");
}

function renderExpenses() {
  const x = expenseSummary();
  const t = totals();
  const net = t.collected - x.monthTotal;

  el("exp-title").textContent =
    "Expenses \u2014 " + new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  el("exp-count").textContent = x.list.length
    ? (x.list.length === 1 ? "1 entry" : x.list.length + " entries")
    : "";

  el("exp-stats").innerHTML = [
    {
      label: "Spent this month", value: money(x.monthTotal),
      note: x.month.length === 1 ? "1 entry" : x.month.length + " entries",
      cls: "warn", icon: "receipt", tone: "amber"
    },
    {
      label: "Biggest cost", value: x.top ? esc(x.top) : "\u2014",
      note: x.top ? money(x.topAmount) + " this month" : "Nothing logged yet",
      icon: "chart", tone: "brand"
    },
    {
      label: "Net this month", value: signedMoney(net),
      note: money(t.collected) + " rent collected",
      cls: net < 0 ? "warn" : "up", icon: "wallet", tone: net < 0 ? "red" : "green"
    }
  ].map(statCard).join("");

  if (!x.list.length) {
    el("exp-list").innerHTML =
      '<li class="feed-blank">Nothing logged yet. Add electricity, water, staff pay and anything else the property costs you.</li>';
    return;
  }

  el("exp-list").innerHTML = x.list.map((e) => {
    const meta = [e.note, prettyDate(e.date)].filter(Boolean).map(esc).join(" \u00b7 ");
    return `
      <li>
        <span class="pay-left">
          <span class="ico ico-out" aria-hidden="true">\u20b9</span>
          <span class="pay-name">${esc(e.category)}<span>${meta}</span></span>
        </span>
        <span class="pay-right">
          <span class="amount">${money(e.amount)}</span>
          <button class="link-btn link-danger" type="button" data-act="del-expense" data-exp="${esc(e.id)}">Remove</button>
        </span>
      </li>`;
  }).join("");
}

/* ---------- complaints / issues ---------- */

function renderComplaints() {
  var complaints = PGStore.complaints();
  var filter = "all";
  var activePill = document.querySelector("#comp-filters .pill.is-active");
  if (activePill) { filter = activePill.dataset.filter || "all"; }

  var filtered = filter === "all" ? complaints : complaints.filter(function (c) { return c.status === filter; });
  var open = complaints.filter(function (c) { return c.status === "open"; }).length;
  var prog = complaints.filter(function (c) { return c.status === "in_progress"; }).length;
  var res = complaints.filter(function (c) { return c.status === "resolved"; }).length;

  var allEl = el("comp-count-all");
  if (allEl) { allEl.textContent = complaints.length; }
  var openEl = el("comp-count-open");
  if (openEl) { openEl.textContent = open; }
  var progEl = el("comp-count-prog");
  if (progEl) { progEl.textContent = prog; }
  var resEl = el("comp-count-res");
  if (resEl) { resEl.textContent = res; }

  var list = el("comp-list");
  var empty = el("comp-empty");
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = "";
    if (empty) { empty.hidden = false; }
    return;
  }
  if (empty) { empty.hidden = true; }

  var statusBadge = function (s) {
    var map = { open: ["Open", "bg-red-soft text-red"], in_progress: ["In Progress", "bg-amber-soft text-amber"], resolved: ["Resolved", "bg-green-soft text-green"] };
    var cfg = map[s] || map.open;
    return '<span class="badge" style="' + cfg[1] + '">' + cfg[0] + '</span>';
  };
  var prioIcon = function (p) {
    if (p === "high") return '<span style="color:var(--red);font-weight:600">⬆ High</span>';
    if (p === "low") return '<span style="color:var(--muted)">⬇ Low</span>';
    return '<span style="color:var(--amber)">● Medium</span>';
  };

  list.innerHTML = filtered.map(function (c) {
    var meta = [c.roomNo ? "Room " + c.roomNo : "", c.category, prettyDate(c.date)].filter(Boolean).join(" \u00b7 ");
    var costLine = c.cost > 0 ? '<span style="margin-left:8px;color:var(--amber)">' + money(c.cost) + '</span>' : "";
    return '<div class="comp-card card" style="margin-bottom:12px;padding:18px 20px">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<b style="font-size:14px">' + esc(c.title) + '</b>'
      + statusBadge(c.status)
      + prioIcon(c.priority)
      + costLine
      + '</div>'
      + '<p style="font-size:12px;color:var(--muted);margin:4px 0 0">' + esc(meta) + '</p>'
      + (c.note ? '<p style="font-size:12.5px;margin:6px 0 0;color:var(--text)">' + esc(c.note) + '</p>' : "")
      + (c.status === "resolved" && c.resolvedAt ? '<p style="font-size:11px;color:var(--green);margin:4px 0 0">\u2713 Resolved ' + prettyDate(c.resolvedAt) + '</p>' : "")
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-shrink:0">'
      + '<button class="link-btn" type="button" data-act="resolve-complaint" data-comp="' + esc(c.id) + '">Update</button>'
      + '<button class="link-btn link-danger" type="button" data-act="del-complaint" data-comp="' + esc(c.id) + '">\u00d7</button>'
      + '</div>'
      + '</div>'
      + '</div>';
  }).join("");
}

/* ---------- owner tab ---------- */

const SETTINGS_ROWS = [
  {
    key: "floors",
    title: "Floors",
    note: "Turn this off for a single-storey PG. Rooms stop asking for a floor, and the overview counts by room instead.",
    opts: [{ v: true, label: "Use floors" }, { v: false, label: "No floors" }]
  },
  {
    key: "bedStyle",
    title: "Bed labels",
    note: "How every bed is named \u2014 on the bed tiles, in the rent list and on each tenant profile.",
    opts: [{ v: "alpha", label: "Letters" }, { v: "number", label: "Numbers" }]
  },
  {
    key: "bedNumbering",
    title: "Beds in a new room",
    note: "Start every room again from the first label, or carry on counting from the room before it.",
    opts: [{ v: "restart", label: "Start again" }, { v: "continue", label: "Carry on" }]
  }
];

function ownerName() {
  const o = PGStore.state().owner || {};
  return o.name || (window.PG_SESSION && PG_SESSION.name) || "Owner";
}

function renderOwner() {
  const s = PGStore.state();
  const o = s.owner || {};
  const t = totals();
  const tel = String(o.phone || "").replace(/[^0-9+]/g, "");
  const name = ownerName();

  el("owner-card").innerHTML = `
    <div class="own-top">
      <span class="av own-av">${esc(initials(name))}</span>
      <span class="own-id">
        <b>${esc(name)}</b>
        <span>${esc(s.property || "Property not named yet")}</span>
      </span>
    </div>
    <div class="own-grid">
      <div class="own-cell"><b>Phone</b><span>${
        tel ? `<a href="tel:${esc(tel)}">${esc(o.phone)}</a>` : "<i>Not added yet</i>"
      }</span></div>
      <div class="own-cell"><b>Address</b><span>${
        o.address ? esc(o.address) : "<i>Not added yet</i>"
      }</span></div>
      <div class="own-cell"><b>Property</b><span>${t.rooms} ${t.rooms === 1 ? "room" : "rooms"} · ${t.beds} beds · ${t.occupied} filled</span></div>
      <div class="own-cell"><b>Rent this month</b><span>${money(t.collected)} of ${money(t.expected)}</span></div>
      ${o.pgStartDate ? `<div class="own-cell"><b>PG Started</b><span>${prettyDate(o.pgStartDate)} · ${pgDuration(o.pgStartDate)}</span></div>` : ""}
    </div>`;

  /* The greeting and the avatar follow whatever name the owner saved. */
  el("greet").textContent = greeting() + ", " + String(name).split(" ")[0];
  el("avatar").textContent = initials(name);
  el("avatar").title = name;

  /* Show PG starting date below the greeting */
  const pgDate = el("pg-start-info");
  if (pgDate) {
    const sd = o.pgStartDate;
    pgDate.textContent = sd ? "Running for " + pgDuration(sd) + " since " + prettyDate(sd) : "";
    pgDate.style.display = sd ? "" : "none";
  }
}

/* Shows the labels the current choices actually produce, using real rooms. */
function bedPreview() {
  const rooms = PGStore.state().rooms;
  if (!rooms.length) { return "Add a room and the labels will preview here."; }

  const a = rooms[0];
  const first = a.beds.map((bed, i) => PGStore.bedLabel(i, a.id)).join(", ");
  if (rooms.length < 2) { return "Beds read " + first + " in room " + a.no + "."; }

  const b = rooms[1];
  return "Beds read " + first + " in room " + a.no +
    ", then " + PGStore.bedLabel(0, b.id) + " in room " + b.no + ".";
}

function renderSettings() {
  const s = PGStore.state().settings;

  el("settings-list").innerHTML = SETTINGS_ROWS.map((row) => {
    const opts = row.opts.map((o) => {
      const on = o.v === s[row.key];
      return `<button class="seg${on ? " is-on" : ""}" type="button" aria-pressed="${on}" data-act="set-opt" data-key="${row.key}" data-val="${String(o.v)}">${o.label}</button>`;
    }).join("");

    return `
      <div class="set-row">
        <div class="set-text"><b>${row.title}</b><span>${row.note}</span></div>
        <div class="seg-group">${opts}</div>
      </div>`;
  }).join("");

  el("set-preview").textContent = bedPreview();
}

/* The rents your rooms are actually set to, so the card can be sanity-checked. */
function roomRates() {
  const map = {};
  PGStore.state().rooms.forEach((r) => {
    const k = String(r.rent);
    if (!map[k]) { map[k] = { amount: r.rent, beds: 0, rooms: [] }; }
    map[k].beds += r.beds.length;
    map[k].rooms.push(r.no);
  });
  return Object.keys(map).map((k) => map[k]).sort((a, b) => b.amount - a.amount);
}

function rateRow(label, sub, amount) {
  return `
    <div class="rc-row">
      <div><b>${esc(label)}</b><span>${esc(sub)}</span></div>
      <span class="rc-amt">${money(amount)}</span>
    </div>`;
}

function renderRates() {
  const rates = PGStore.state().rates;

  el("rate-list").innerHTML = rates.length
    ? rates.map((r) => `
      <div class="rc-row">
        <div><b>${esc(r.label)}</b><span>${esc(r.note || "per bed, per month")}</span></div>
        <span class="pay-right">
          <span class="rc-amt">${money(r.amount)}</span>
          <button class="link-btn link-danger" type="button" data-act="del-rate" data-rate="${esc(r.id)}">Remove</button>
        </span>
      </div>`).join("")
    : '<p class="rate-blank">Nothing on the card yet. Add what you charge for a single, a two sharing, an AC room \u2014 then you can pull it up in front of anyone who asks.</p>';
}

/* ---- Bulk set rents ---- */
function openSetRents() {
  const s = PGStore.state();
  const list = el('setrents-list');
  if (!list) return;
  let html = '';
  s.rooms.forEach(room => {
    const occupied = (room.beds || []).filter(b => b && b.name);
    if (!occupied.length) return;
    html += '<div style="margin-bottom:14px"><b style="font-size:13px;color:var(--muted)">Room ' + esc(room.no) + ' — ₹' + (room.rent || 0).toLocaleString('en-IN') + '/mo base</b></div>';
    occupied.forEach((bed, i) => {
      const idx = room.beds.indexOf(bed);
      const key = room.id + '-' + idx;
      const curRent = (bed.rent != null && bed.rent > 0) ? bed.rent : (room.rent || 0);
      html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">';
      html += '<span style="flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(bed.name) + '</span>';
      html += '<span style="font-size:12px;color:var(--muted);white-space:nowrap">₹</span>';
      html += '<input type="number" min="0" step="100" value="' + curRent + '" data-rent-key="' + key + '" style="width:100px;font-size:13px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);color:var(--text);text-align:right">';
      html += '</div>';
    });
  });
  if (!html) {
    html = '<p style="color:var(--muted);font-size:13px;padding:16px 0">No occupied beds found. Add tenants first.</p>';
  }
  list.innerHTML = html;
  openDlg('dlg-setrents');
}

function saveSetRents() {
  const s = PGStore.state();
  const inputs = document.querySelectorAll('[data-rent-key]');
  inputs.forEach(inp => {
    const parts = inp.dataset.rentKey.split('-');
    const roomId = parts[0];
    const bedIdx = parseInt(parts[1], 10);
    const newRent = Math.round(Number(inp.value) || 0);
    const room = s.rooms.find(r => r.id === roomId);
    if (room && room.beds[bedIdx]) {
      room.beds[bedIdx].rent = newRent > 0 ? newRent : null;
    }
  });
  commit();
  toast('Bed rents updated', 'success');
  closeDlg('dlg-setrents');
  renderAll();
}

function openRateCard() {
  const rates = PGStore.state().rates;
  const rooms = roomRates();

  const mine = '<div class="rc-sec"><h4>What you charge</h4>' + (rates.length
    ? rates.map((r) => rateRow(r.label, r.note || "per bed, per month", r.amount)).join("")
    : '<p class="rate-blank">No rates added yet.</p>') + "</div>";

  const actual = rooms.length
    ? '<div class="rc-sec"><h4>What your rooms are set to</h4>' +
      rooms.map((d) => rateRow(
        d.beds + (d.beds === 1 ? " bed" : " beds"),
        "Room " + d.rooms.join(", "),
        d.amount
      )).join("") + "</div>"
    : "";

  el("rates-body").innerHTML = mine + actual;
  openDlg("dlg-rates");
}

function openOwnerDialog() {
  const o = PGStore.state().owner || {};
  el("o-name").value = o.name || (window.PG_SESSION && PG_SESSION.name) || "";
  el("o-phone").value = o.phone || "";
  if (el("o-upi")) { el("o-upi").value = o.upiId || ""; }
  el("o-address").value = o.address || "";
  if (el("o-pgdate")) { el("o-pgdate").value = o.pgStartDate || ""; }
  openDlg("dlg-owner");
}

/* ---------- backfill payment history ---------- */

let backfillRef = null;

function monthsBetweenJS(from, to) {
  const out = [];
  const a = new Date(from + "-01");
  const b = new Date(to + "-01");
  if (isNaN(a) || isNaN(b)) { return out; }
  let y = a.getFullYear(), m = a.getMonth();
  const ey = b.getFullYear(), em = b.getMonth();
  let guard = 0;
  while ((y < ey || (y === ey && m <= em)) && guard++ < 600) {
    out.push(y + "-" + String(m + 1).padStart(2, "0"));
    m++; if (m > 11) { m = 0; y++; }
  }
  return out;
}

function monthLabelJS(key) {
  const [y, mo] = key.split("-").map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function openBackfillDialog(roomId, bedIndex) {
  const rooms = PGStore.state().rooms;
  const room = rooms.find((r) => r.id === roomId);
  if (!room) { return; }
  const bed = room.beds[bedIndex];
  if (!bed) { return; }

  backfillRef = { roomId, bedIndex };

  /* Collection day: use bed.collect if set, else derive from joining date. */
  const joinedDay = bed.joined ? parseInt(bed.joined.split("-")[2], 10) : null;
  const defaultCollect = bed.collect || joinedDay || 1;

  el("bf-collect").value = bed.collect || "";
  el("bf-collect").placeholder = "e.g. " + defaultCollect + " (auto-detected from joining date)";
  el("bf-who").textContent = bed.name + " · Room " + room.no + " · Joined " + (bed.joined || "unknown");

  /* Build month list from joining month → current month. */
  const fromKey = bed.joined ? bed.joined.slice(0, 7) : new Date().toISOString().slice(0, 7);
  const toKey = new Date().toISOString().slice(0, 7);
  const months = monthsBetweenJS(fromKey, toKey);
  const alreadyPaid = new Set(bed.paidMonths || []);

  el("bf-months").innerHTML = months.map((mk) => {
    const paid = alreadyPaid.has(mk);
    const id = "bf-m-" + mk;
    return `<div class="bf-month-item">
      <input type="checkbox" id="${id}" name="bf-month" value="${mk}" ${!paid ? "checked" : ""} ${paid ? "" : ""} />
      <label for="${id}">${monthLabelJS(mk)}</label>
      ${paid ? '<span class="bf-already">✓ paid</span>' : ""}
    </div>`;
  }).join("") || "<p style='font-size:13px;color:var(--muted)'>No past months to backfill.</p>";

  el("bf-err").hidden = true;
  openDlg("dlg-backfill");
}


/* A PG with floors switched off should never be asked for one. */
function applyFloorSetting() {
  const field = el("r-floor-field");
  if (field) { field.hidden = PGStore.state().settings.floors === false; }
}

/* ---------- owner quick actions, deposits, rules, data management ---------- */

function renderOwnerActions() {
  const t = totals();
  const list = tenants();
  const unpaid = list.filter((x) => !x.paid);
  const paid = list.filter((x) => x.paid);
  const allPaid = list.length > 0 && unpaid.length === 0;
  const noTenants = list.length === 0;

  el("owner-actions").innerHTML = `
    <div class="oa-grid">
      <button class="oa-card" type="button" data-act="bulk-mark-paid" ${allPaid ? 'disabled title="All tenants already paid"' : noTenants ? 'disabled title="No tenants to mark"' : ''}>
        <span class="oa-icon oa-green">\u2713</span>
        <span class="oa-text"><b>Mark all rent paid</b><span>${allPaid ? 'All tenants are already paid for this month' : noTenants ? 'Add tenants first' : 'Mark every tenant as paid for this month'}</span></span>
      </button>
      <button class="oa-card" type="button" data-act="bulk-whatsapp" ${!unpaid.length ? 'disabled title="No unpaid tenants"' : ''}>
        <span class="oa-icon oa-blue">\ud83d\udcac</span>
        <span class="oa-text"><b>Broadcast WhatsApp</b><span>${unpaid.length ? 'Send rent reminder to ' + unpaid.length + ' unpaid tenant' + (unpaid.length !== 1 ? 's' : '') : 'All tenants have paid'}</span></span>
      </button>
      <button class="oa-card" type="button" data-act="export-all">
        <span class="oa-icon oa-amber">\u2b07</span>
        <span class="oa-text"><b>Export all data</b><span>Download complete backup as JSON file</span></span>
      </button>
      <button class="oa-card" type="button" data-act="send-receipt-all" ${!t.collected ? 'disabled title="No rent collected yet"' : ''}>
        <span class="oa-icon oa-purple">\ud83d\udcc4</span>
        <span class="oa-text"><b>Send receipts</b><span>${t.collected ? 'Send receipts to ' + paid.length + ' paid tenant' + (paid.length !== 1 ? 's' : '') : 'No rent collected this month'}</span></span>
      </button>
    </div>`;
}

function renderDeposits() {
  const list = tenants();
  const withDeposit = list.filter((t) => t.deposit > 0);
  const totalDeposits = withDeposit.reduce((s, t) => s + t.deposit, 0);

  el("deposit-summary").textContent = withDeposit.length
    ? money(totalDeposits) + " from " + withDeposit.length + " tenant" + (withDeposit.length !== 1 ? "s" : "")
    : "No deposits recorded";

  if (!withDeposit.length) {
    el("deposit-list").innerHTML = '<p class="feed-blank">No security deposits recorded. Deposits are saved when you add or edit a tenant.</p>';
    return;
  }

  el("deposit-list").innerHTML = '<ul class="paylist">' + withDeposit.map((t) => `
    <li>
      <span class="pay-left">
        <span class="av">${esc(initials(t.name))}</span>
        <span class="pay-name">${esc(t.name)}<span>Room ${esc(t.roomNo)} \u00b7 Bed ${t.bed}</span></span>
      </span>
      <span class="pay-right">
        <span class="amount">${money(t.deposit)}</span>
        <span class="badge badge-paid">Held</span>
      </span>
    </li>`).join('') + '</ul>' + `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-size:13px">
      <span style="color:var(--muted)">Total deposits held</span>
      <span style="font-weight:700;color:var(--green)">${money(totalDeposits)}</span>
    </div>`;
}

function renderRules() {
  const s = PGStore.state();
  const rules = s.rules || {};
  const items = [];
  if (rules.visiting) { items.push({ label: "Visiting hours", value: rules.visiting }); }
  if (rules.quiet) { items.push({ label: "Quiet hours", value: rules.quiet }); }
  if (rules.guests) { items.push({ label: "Guest policy", value: rules.guests }); }
  if (rules.lockout) { items.push({ label: "Lockout time", value: rules.lockout }); }
  if (rules.other) { items.push({ label: "Other rules", value: rules.other }); }

  /* Update accordion summary */
  var rulesSummary = el("rules-summary");
  if (rulesSummary) {
    rulesSummary.textContent = items.length ? items.length + " rule" + (items.length !== 1 ? "s" : "") + " set" : "Not configured";
  }

  if (!items.length) {
    el("rules-display").innerHTML = '<p class="feed-blank">No rules set yet. Click "Edit rules" to add house rules for your PG.</p>';
    return;
  }

  el("rules-display").innerHTML = items.map((r) => `
    <div class="rules-item">
      <b>${esc(r.label)}</b>
      <span>${esc(r.value)}</span>
    </div>`).join("");
}

function renderDataActions() {
  const t = totals();
  const list = tenants();
  const s = PGStore.state();
  const totalExpenses = (s.expenses || []).reduce((sum, e) => sum + e.amount, 0);
  const totalDeposits = list.filter((t) => t.deposit > 0).reduce((sum, t) => sum + t.deposit, 0);
  const dataSizeKB = Math.round(JSON.stringify(s).length / 1024);
  const hasData = t.rooms > 0 || t.occupied > 0 || (s.expenses || []).length > 0;
  const hasExpenses = (s.expenses || []).length > 0;
  const hasRooms = t.rooms > 0;

  /* Update accordion summary */
  var dataSummary = el("data-summary");
  if (dataSummary) {
    dataSummary.textContent = dataSizeKB + " KB · " + t.rooms + " rooms · " + t.occupied + " tenants";
  }

  el("data-actions").innerHTML = `
    <div class="oa-grid">
      <div class="data-stat-card">
        <b>Data summary</b>
        <div class="data-stat-row"><span>Rooms</span><span>${t.rooms}</span></div>
        <div class="data-stat-row"><span>Tenants</span><span>${t.occupied}</span></div>
        <div class="data-stat-row"><span>Expenses</span><span>${(s.expenses || []).length} entries</span></div>
        <div class="data-stat-row"><span>Total collected</span><span>${money(t.collected)}</span></div>
        <div class="data-stat-row"><span>Total expenses</span><span>${money(totalExpenses)}</span></div>
        <div class="data-stat-row"><span>Deposits held</span><span>${money(totalDeposits)}</span></div>
        <div class="data-stat-row"><span>Data size</span><span>${dataSizeKB} KB</span></div>
      </div>
      <div class="data-btn-col">
        <button class="oa-card" type="button" data-act="download-backup" ${!hasData ? 'disabled title="No data to back up"' : ''}>
          <span class="oa-icon oa-green">\u2b07</span>
          <span class="oa-text"><b>Download backup</b><span>${hasData ? 'Save all your data as a JSON file' : 'Add rooms or tenants first'}</span></span>
        </button>
        <button class="oa-card" type="button" data-act="import-backup">
          <span class="oa-icon oa-blue">\u2b06</span>
          <span class="oa-text"><b>Restore from backup</b><span>Import a previously saved JSON backup</span></span>
        </button>
        <button class="oa-card oa-danger" type="button" data-act="reset-all" ${!hasData ? 'disabled title="Nothing to reset"' : ''}>
          <span class="oa-icon oa-red">\u2716</span>
          <span class="oa-text"><b>Reset all data</b><span>${hasData ? 'Clear everything and start fresh (cannot be undone)' : 'No data to clear'}</span></span>
        </button>
      </div>
    </div>`;
}

function openRulesDialog() {
  const rules = PGStore.state().rules || {};
  el("ru-visit").value = rules.visiting || "";
  el("ru-quiet").value = rules.quiet || "";
  el("ru-guest").value = rules.guests || "";
  el("ru-lock").value = rules.lockout || "";
  el("ru-other").value = rules.other || "";
  openDlg("dlg-rules");
}

function downloadJsonBackup() {
  const s = PGStore.state();
  const blob = new Blob([JSON.stringify(s, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pg-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup downloaded!", "success");
}

async function importJsonBackup() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (ev) {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data || !data.rooms) { toast("This does not look like a valid PG Manager backup.", "error"); return; }
        var ok = await confirmAsync({ type: 'danger', title: 'Restore backup?', message: 'This will replace ALL current data with the backup. Continue?', okText: 'Restore', icon: '⚠' });
        if (!ok) return;
        PGStore.replaceAll(data);
        commit();
        toast("Backup restored successfully!", "success");
      } catch (err) {
        toast("Could not read the backup file: " + err.message, "error");
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

function exportAllCsv() {
  exportTenantsCsv();
  setTimeout(exportLedgerCsv, 500);
  setTimeout(exportExpensesCsv, 1000);
  toast("Exporting all data as CSV…", "info");
}

async function broadcastWhatsAppReminders() {
  const list = tenants();
  const unpaid = list.filter((t) => !t.paid && t.phone);
  if (!unpaid.length) { toast("No unpaid tenants with phone numbers.", "info"); return; }
  const count = unpaid.length;
  var ok = await confirmAsync({ type: 'info', title: 'Send reminders?', message: 'Send WhatsApp rent reminders to ' + count + ' unpaid tenant' + (count !== 1 ? 's' : '') + '. Continue?', okText: 'Send', icon: '💬' });
  if (!ok) return;
  unpaid.forEach((t, i) => {
    setTimeout(function () { sendWhatsAppReminder(t.roomId, t.bedIndex); }, i * 1000);
  });
  toast('Sending reminders to ' + count + ' tenant' + (count !== 1 ? 's' : '') + '…', 'info');
}

async function sendReceiptsToAllPaid() {
  const list = tenants();
  const paid = list.filter((t) => t.paid && t.phone);
  if (!paid.length) { toast("No paid tenants with phone numbers.", "info"); return; }
  const count = paid.length;
  var ok = await confirmAsync({ type: 'info', title: 'Send receipts?', message: 'Send WhatsApp receipts to ' + count + ' paid tenant' + (count !== 1 ? 's' : '') + '. Continue?', okText: 'Send', icon: '📄' });
  if (!ok) return;
  paid.forEach((t, i) => {
    setTimeout(function () { sendWhatsAppReminder(t.roomId, t.bedIndex); }, i * 1000);
  });
  toast('Sending receipts to ' + count + ' tenant' + (count !== 1 ? 's' : '') + '…', 'info');
}

async function bulkMarkAllPaid() {
  const list = tenants();
  const unpaid = list.filter((t) => !t.paid);
  if (!unpaid.length) { toast("All tenants are already marked as paid!", "info"); return; }
  var ok = await confirmAsync({ type: 'success', title: 'Mark all paid?', message: 'Mark ' + unpaid.length + ' tenant' + (unpaid.length !== 1 ? 's' : '') + ' as paid for this month?', okText: 'Mark paid', icon: '✓' });
  if (!ok) return;
  var payDate = new Date().toISOString().slice(0, 10);
  unpaid.forEach((t) => {
    PGStore.setPaid(t.roomId, t.bedIndex, true, payDate, '');
  });
  commit();
  toast("Marked " + unpaid.length + " tenant" + (unpaid.length !== 1 ? "s" : "") + " as paid.", "success");
}

async function resetAllData() {
  var ok1 = await confirmAsync({ type: 'danger', title: 'Delete all data?', message: 'This will DELETE ALL your rooms, tenants, expenses, and settings. This cannot be undone!', okText: 'Delete everything', icon: '⚠' });
  if (!ok1) return;
  var ok2 = await confirmAsync({ type: 'danger', title: 'Are you absolutely sure?', message: 'Last chance — all your data will be permanently deleted.', okText: 'Yes, delete it all', icon: '🗑' });
  if (!ok2) return;
  PGStore.replaceAll({ property: "", rooms: [], activity: [], expenses: [], rates: [], complaints: [], rules: {}, owner: { name: "", phone: "", address: "", upiId: "", pgStartDate: "" }, settings: { floors: true, bedStyle: "alpha", bedNumbering: "restart" }, cycle: "" });
  commit();
  toast("All data has been cleared.", "success");
}

/* ---------- owner tab render ---------- */

function renderAll() {
  const s = PGStore.state();
  const t = totals();
  const list = tenants();
  el("brand-prop").textContent = s.property || "Name your property";
  const bpMobile = document.getElementById("brand-prop-mobile");
  if (bpMobile) { bpMobile.textContent = s.property || "Name your property"; }
  /* Topbar — show property name on the button when set */
  var nameBtn = document.querySelector('[data-act="name-property"]');
  if (nameBtn && nameBtn.closest('.topbar-right')) {
    nameBtn.textContent = s.property || 'Name property';
  }
  
  /* Setup card: only show when property is NOT named AND no rooms exist */
  var hasRooms = s.rooms && s.rooms.length > 0;
  var hasProperty = !!(s.property && s.property.trim());
  var setupCard = el("setup");
  if (hasProperty && hasRooms) {
    /* User is set up — hide the card permanently */
    setupCard.hidden = true;
  } else {
    setupCard.hidden = false;
    /* Update setup card message based on progress */
    var setupMsg = setupCard.querySelector('.sub');
    if (setupMsg) {
      if (hasProperty) {
        setupMsg.textContent = 'Property named! Add your rooms next, then move tenants into beds.';
      } else if (hasRooms) {
        setupMsg.textContent = 'Rooms added — name your property to get started.';
      } else {
        setupMsg.textContent = 'This account is empty. Name the property, add your rooms, then move tenants into beds.';
      }
    }
    /* Show/hide individual setup actions based on state */
    var setupBtns = setupCard.querySelectorAll('[data-act]');
    setupBtns.forEach(function(btn) {
      var act = btn.getAttribute('data-act');
      if (act === 'name-property') {
        btn.style.display = hasProperty ? 'none' : '';
      } else if (act === 'add-room') {
        btn.style.display = hasRooms ? 'none' : '';
      } else {
        btn.style.display = '';
      }
    });
  }
  
  /* --- Smart button states across all tabs --- */
  var hasExpenses = (s.expenses || []).length > 0;
  var hasLedger = (s.ledger || []).length > 0;
  var hasVacant = t.vacant > 0;
  var hasTenants = list.length > 0;
  
  /* Add tenant — disable if no vacant beds */
  var addTenantBtn = document.querySelector('#view-tenants [data-act="add-tenant"]');
  if (addTenantBtn) {
    addTenantBtn.disabled = !hasVacant;
    addTenantBtn.title = hasVacant ? 'Add a new tenant' : 'No vacant beds — add a room first';
  }
  
  /* Export buttons — disable when no data */
  var exportLedger = document.querySelector('[data-act="export-ledger"]');
  if (exportLedger) {
    exportLedger.disabled = !hasLedger;
    exportLedger.title = hasLedger ? 'Export rent ledger' : 'No payment history yet';
  }
  var exportTenants = document.querySelector('[data-act="export-tenants"]');
  if (exportTenants) {
    exportTenants.disabled = !hasTenants;
    exportTenants.title = hasTenants ? 'Export tenant list' : 'No tenants yet';
  }
  var exportExpenses = document.querySelector('[data-act="export-expenses"]');
  if (exportExpenses) {
    exportExpenses.disabled = !hasExpenses;
    exportExpenses.title = hasExpenses ? 'Export expenses' : 'No expenses logged yet';
  }
  /* --- Lazy rendering: active tab first, others deferred --- */
  var activeView = location.hash.slice(1) || 'dashboard';
  
  /* Always render dashboard stats (shown in header area) */
  var alwaysFns = [renderStats];
  
  /* Map views to their render functions */
  var viewFns = {
    dashboard: [renderGraph, renderRentStatus, renderFloors, renderFeed, renderExpDashboard,
                PGAnalytics.renderHeatmap, PGAnalytics.renderRevenuePerRoom,
                PGAnalytics.renderPaymentBehavior, PGAnalytics.renderPnL],
    beds:      [renderRooms],
    tenants:   [renderTenants],
    rent:      [renderRent, PGAnalytics.renderPaymentHistory],
    expenses:  [renderExpenses],
    complaints:[renderComplaints],
    owner:     [renderOwner, renderSettings, renderRates, applyFloorSetting,
                renderOwnerActions, renderDeposits, renderRules, renderDataActions,
                PGAnalytics.renderStaffAttendance]
  };
  
  /* Render active tab immediately */
  var activeFns = viewFns[activeView] || viewFns.dashboard;
  var deferredFns = [];
  Object.keys(viewFns).forEach(function (key) {
    if (key !== activeView) {
      viewFns[key].forEach(function (fn) { deferredFns.push(fn); });
    }
  });
  
  function runFns(fns) {
    fns.forEach(function (fn) { try { fn(); } catch (err) { console.error(err); } });
  }
  
  runFns(alwaysFns.concat(activeFns));
  
  /* Defer non-active tabs to next frame so the active tab paints first */
  if (deferredFns.length) {
    requestAnimationFrame(function () { runFns(deferredFns); });
  }
}

/* ---------- backup ---------- */

function backupLabel(s) {
  if (s.state === "off") { return "Sheet backup is not set up yet."; }
  if (s.state === "saving") { return "Auto-syncing to Google Sheets\u2026"; }
  if (s.state === "error") { return "Auto-sync error: " + (s.error || ""); }
  if (s.at) { return "Auto-saved \u00b7 Synced with Google Sheets " + sinceLabel(s.at) + "."; }
  return "Auto-sync active. Every change is saved to Google Sheets automatically.";
}

function renderBackup(s) {
  const bar = el("backup");
  if (!bar) { return; }
  bar.className = "backup is-" + s.state;
  el("backup-text").textContent = backupLabel(s);
  el("backup-actions").hidden = !(window.PGSheets && PGSheets.enabled);
}

/* ================================================================
   DATA SAFETY PIPELINE
   Directive 1: deep snapshot before every async save
   Directive 2: retries with exponential backoff (in supabase-storage.js)
   Directive 3: beforeunload lock + blocking modal with Retry Now
   Directive 4: permanent failure → email alert via Apps Script
   Directive 5: every failure surfaces as a toast — no silent catches
   ================================================================ */
var _commitTimer = null;
var _criticalFailure = false;  /* at least one save has failed permanently (drives toasts + auto-retry) */
var _consecutiveFails = 0;

function dbSyncBusy() {
  /* Busy while a debounced commit is pending, a retry loop is sleeping,
     or any save request is in flight. Drives the beforeunload trap. */
  if (_commitTimer) { return true; }
  if (window.SupabaseStorage && SupabaseStorage.isAvailable && SupabaseStorage.isAvailable()) {
    if (SupabaseStorage.isRetryActive && SupabaseStorage.isRetryActive()) { return true; }
    if (SupabaseStorage.inflightCount && SupabaseStorage.inflightCount() > 0) { return true; }
  }
  return false;
}

/* ---- Directive 3: unload protection ---- */
window.addEventListener("beforeunload", function (e) {
  if (dbSyncBusy() || _criticalFailure) {
    var msg = _criticalFailure
      ? "A database save FAILED. Closing now may LOSE your latest changes."
      : "Your latest changes are still being saved.";    e.preventDefault();
    e.returnValue = msg; /* Chrome/Edge */
    return msg;          /* Firefox/Safari */
  }
});

/* ---- The single save pipeline. Takes an immutable snapshot and fans out. */
function dispatchSave() {
  /* Directive 1: immutable snapshot — live edits mid-upload cannot corrupt it */
  var snapshot = (PGStore.snapshot)
    ? PGStore.snapshot()
    : JSON.parse(JSON.stringify(PGStore.state()));

  if (window.PGSheets) { PGSheets.schedule(snapshot); }

  if (window.SupabaseStorage && SupabaseStorage.isAvailable()) {
    SupabaseStorage.save(snapshot).then(function () {
      _consecutiveFails = 0;
      if (_criticalFailure) {
        /* A previously failing save finally went through — stand down. */
        _criticalFailure = false;
        toast("Database connection restored — all data is synced.", "success", 5000);
      }
    }).catch(function (e) {
      onPermanentSaveFailure(e);
    });
  }
}

function commit() {
  /* Debounce: if multiple changes happen within 30ms, only render once. */
  if (_commitTimer) { clearTimeout(_commitTimer); }
  _commitTimer = setTimeout(function () {
    _commitTimer = null;
    renderAll();
    dispatchSave();
  }, 30);
}

/* Immediate commit — bypasses debounce, used for critical saves. */
function commitNow() {
  if (_commitTimer) { clearTimeout(_commitTimer); _commitTimer = null; }
  renderAll();
  dispatchSave();
}

/* ---- Directive 4: permanent failure → surface + email alert ----
   Blocking modals are RESERVED for data-threatening failures. Recoverable
   schema gaps (42703 — adaptive stripping already saved the row minus the
   unknown columns) and ordinary network outages must NEVER block the owner:
   they route to toasts/banner and the sync retry engine instead. */
function onPermanentSaveFailure(e) {
  _consecutiveFails += 1;
  var msg = e && e.message ? e.message : "Unknown database error";
  var isSchemaGap = /column .* does not exist|42703/i.test(msg) ||
    (e && e.failedTables && e.failedTables.length && /schema/i.test(msg));
  var isNetworkish = !/column |schema|RLS|permission|duplicate|violates/i.test(msg);

  if (isSchemaGap) {
    /* Non-fatal: row saved minus unknown fields; the banner (already up)
       carries the fix instruction. Keep the owner editing. */
    toast("Saved with reduced fields — run supabase/migrate-schema.sql to sync 100%.", "warn", 6000);
    _consecutiveFails = 0;            /* do not escalate toward the modal */
    return;
  }
  if (isNetworkish && _criticalFailure) {
    /* Already modal'ed once — do not re-block on every subsequent network
       blip; the online/focus auto-retry resumes the sync. */
    toast("Still offline — changes are safe locally and will sync automatically.", "warn", 5000);
    return;
  }

  /* Every permanent failure is visible (Directive 5)... */
  toast("Save failed after all retries: " + msg, "error", 8000);

  if (_consecutiveFails >= 3 || (e && e.isPermanentSaveFailure)) {
    _criticalFailure = true;
    /* No blocking modal, no edit lock: changes stay safe locally and auto-retry
       when connectivity returns; the user just sees a toast. */
    toast("Database save failed — changes are saved locally and will retry automatically. Keep this tab open if possible.", "warn", 8000);
    /* Directive 4: emergency email dispatch through the Apps Script endpoint */
    if (window.PGSheets && typeof PGSheets.criticalErrorLog === "function") {
      PGSheets.criticalErrorLog({
        error: msg,
        tables: (e && e.failedTables) || [],
        attempts: (e && e.attempts) || null
      });
    } else {
      console.error("[CRITICAL] Database save failed and no alert channel exists:", msg);
    }
  }
}

/* Auto-resume: when connectivity returns (or the tab regains focus after a
   suspected outage), retry the failed save automatically. */
window.addEventListener("online", function () {
  if (_criticalFailure) {
    toast("Connection back — retrying database save\u2026", "info", 3000);
    manualRetrySave();
  }
});
window.addEventListener("focus", function () {
  if (_criticalFailure) { manualRetrySave(); }
});

function manualRetrySave() {
  toast("Retrying database save\u2026", "info", 3000);
  _consecutiveFails = 0;
  commitNow();
}

/* ---- Directive 2 telemetry: retry chatter surfaces as soft toasts ---- */
window.addEventListener("pg:storage-retrying", function (ev) {
  var d = ev.detail || {};
  toast("Save retry " + (d.attempt || "?") + "/" + (d.maxAttempts || "?") +
    " for " + (d.label || "data") + " — waiting " + Math.round((d.delayMs || 0) / 1000) + "s\u2026",
    "warn", 2500);
});

window.addEventListener("pg:storage-recovered", function () {
  toast("Database save recovered.", "success", 3000);
});

window.addEventListener("pg:storage-error", function (ev) {
  var d = ev.detail || {};
  console.error("[Storage]", d.table, d.message);
  /* Per-table errors are logged here; the full save rejection raises the
     blocking UI via onPermanentSaveFailure, so no extra toast is needed. */
});

/* Schema-drift fallback: the save went through but without one column. */
window.addEventListener("pg:storage-schema-fallback", function (ev) {
  var d = ev.detail || {};
  console.warn("[Storage] schema fallback:", d.table, d.message);
  toast("Saved with reduced fields — run supabase/migrate-schema.sql to fix the database.", "warn", 7000);
});

/* Directive 5: sheets failures warn but never lock (Supabase is primary) */
window.addEventListener("pg:sheets-error", function (ev) {
  toast((ev.detail && ev.detail.message) || "Sheet backup failed.", "warn", 6000);
});

/* ---- Directive 2: Syncing / Synced / Sync_Failed status indicator ---- */
var SYNC_LABELS = {
  idle: "Not synced yet",
  syncing: "Syncing\u2026",
  synced: "Synced",
  sync_failed: "Sync failed"
};

function renderSyncStatus(state, detail) {
  var pill = el("sync-status-pill");
  if (!pill) { return; }
  pill.dataset.state = state;
  pill.textContent = SYNC_LABELS[state] || state;
  pill.title = detail || SYNC_LABELS[state] || "";
}

window.addEventListener("pg:sync-status", function (ev) {
  var d = ev.detail || {};
  renderSyncStatus(d.state, d.detail);
  /* Mirror into the bottom-left Live Sync Ping (v2 event channel) so the
     legacy app drives the same non-blocking indicator. */
  try {
    var mapped = { syncing: "draining", synced: "synced", sync_failed: "error", saving: "draining" }[d.state] || null;
    if (mapped) { window.dispatchEvent(new CustomEvent("pgv2:sync", { detail: { status: mapped, detail: null } })); }
  } catch (e2) { /* indicator is optional */ }
});

/* Schema-fallback events (adaptive stripping) -> subtle toast + ping,
   NEVER a modal. The row IS saved; only unknown fields were dropped. */
window.addEventListener("pg:storage-schema-fallback", function (ev) {
  var d = ev.detail || {};
  toast("Saved minus " + (d.column || "a missing field") + " — run supabase/migrate-schema.sql for full sync.", "warn", 6000);
});

/* ---- Warning banners removed ----
   The old top-of-page strips (db-error-banner / schema-drift-banner) are
   gone; sync state lives in the bottom-left Live Sync Ping badge and
   toasts only. Schema drift still surfaces as a one-time toast. */
window.addEventListener("pg:storage-schema-drift", function () {
  toast("Database schema out of date — some fields will not save until the migration runs.", "warn", 8000);
});

/* Expose for other files (rent.js) that need to trigger a full save. */
window.PGRender = {
  commit: commit,
  commitNow: commitNow,
  isDbLocked: function () { return false; },
  isSyncBusy: dbSyncBusy,
  manualRetrySave: manualRetrySave
};

/* ---------- dialogs ---------- */

function openDlg(id) {
  const d = el(id);
  const err = d.querySelector(".auth-error");
  if (err) { err.hidden = true; }
  if (d.showModal) { d.showModal(); } else { d.setAttribute("open", ""); }
  const first = d.querySelector("input, select");
  if (first) { setTimeout(() => first.focus(), 30); }
}

function closeDlg(id) {
  const d = el(id);
  if (d.close) { d.close(); } else { d.removeAttribute("open"); }
}

function showErr(id, message) {
  const p = el(id);
  p.textContent = message;
  p.hidden = false;
}

/* Fill the bed picker with every vacant bed, optionally preselecting one. */
function fillBedPicker(roomId, bedIndex) {
  const picker = el("t-bed");
  const free = PGStore.vacantBeds();

  picker.innerHTML = free.map((b) =>
    `<option value="${esc(b.roomId)}|${b.bedIndex}">Room ${esc(b.roomNo)} · Bed ${b.bed} — ${money(b.rent)}</option>`
  ).join("");

  if (roomId != null) { picker.value = roomId + "|" + bedIndex; }
  return free.length;
}

function openTenantDialog(roomId, bedIndex) {
  if (!PGStore.vacantBeds().length) {
    toast(PGStore.isEmpty()
      ? "Add a room first, then you can move tenants in."
      : "Every bed is taken. Add another room to make space.", "warn");
    return;
  }
  fillBedPicker(roomId, bedIndex);
  el("t-joined").value = new Date().toISOString().slice(0, 10);
  if (el("t-rent")) { el("t-rent").value = ""; }
  openDlg("dlg-tenant");
}

function openExpenseDialog() {
  const sel = el("x-cat");
  sel.innerHTML = EXPENSE_CATS.map((c) => `<option value="${c}">${c}</option>`).join("");
  el("x-date").value = new Date().toISOString().slice(0, 10);
  openDlg("dlg-expense");
}

/* ---------- early termination & offboarding ---------- */

let offboardingRef = null;

function updateOffboardCalculation() {
  if (!offboardingRef) { return; }
  const exitDate = el("ob-date").value;
  const deposit = el("ob-deposit").value;
  const charges = el("ob-charges").value;

  const s = PGStore.calculateExitSettlement(offboardingRef.roomId, offboardingRef.bedIndex, exitDate, {
    deposit: deposit,
    charges: charges
  });

  if (!s) { return; }

  const netCls = s.isRefund ? "ob-net-refund" : "ob-net-due";
  const netLabel = s.isRefund ? "Refund to tenant on exit:" : "Balance to collect from tenant:";

  el("ob-calc-card").innerHTML = `
    <div class="ob-calc-grid">
      <div class="ob-cell">
        <b>Monthly Rent Rate</b>
        <span>${money(s.monthlyRent)} ${s.hasCustomRent ? '<span class="tag-custom">custom</span>' : '<span class="muted-sm">(room default)</span>'}</span>
      </div>
      <div class="ob-cell">
        <b>Daily Pro-rated Rate</b>
        <span>${money(s.dailyRate)} / day (${s.daysInMonth} days in ${esc(s.exitMonthLabel)})</span>
      </div>
      <div class="ob-cell">
        <b>Stayed in ${esc(s.exitMonthLabel)}</b>
        <span>${s.daysOccupied} of ${s.daysInMonth} days &rarr; <b>${money(s.proRatedRent)}</b></span>
      </div>
      <div class="ob-cell">
        <b>${esc(s.exitMonthLabel)} Rent Status</b>
        <span>${s.isExitMonthPaid ? '<span class="badge badge-paid">Paid in full</span> &rarr; ' + money(s.exitMonthRefundCredit) + ' refund credit' : '<span class="badge badge-due">Unpaid</span> &rarr; ' + money(s.exitMonthUnpaidLiability) + ' liability'}</span>
      </div>
      ${s.priorDues > 0 ? `
        <div class="ob-cell span-2">
          <b>Prior Unpaid Months (${s.priorMonthsCount})</b>
          <span style="color:var(--red);font-weight:600">${money(s.priorDues)} (${s.priorMonths.map(esc).join(", ")})</span>
        </div>` : ""}
      ${s.deposit > 0 ? `
        <div class="ob-cell">
          <b>Security Deposit Credit</b>
          <span style="color:var(--green);font-weight:600">&minus; ${money(s.deposit)}</span>
        </div>` : ""}
      ${s.charges > 0 ? `
        <div class="ob-cell">
          <b>Extra Charges / Damages</b>
          <span style="color:var(--red);font-weight:600">+ ${money(s.charges)}</span>
        </div>` : ""}
    </div>
    <div class="ob-net-banner ${netCls}">
      <span>${netLabel}</span>
      <strong>${money(Math.abs(s.netBalance))}</strong>
    </div>`;
}

function openOffboardDialog(roomId, bedIndex) {
  const room = PGStore.state().rooms.find((r) => r.id === roomId);
  const bed = room && room.beds[bedIndex];
  if (!bed) { return; }

  offboardingRef = { roomId, bedIndex };
  el("ob-who").textContent = `${bed.name} · Room ${room.no} · Bed ${PGStore.bedLabel(bedIndex, roomId)}`;
  el("ob-date").value = new Date().toISOString().slice(0, 10);
  el("ob-deposit").value = "0";
  el("ob-charges").value = "0";
  el("ob-note").value = "";
  el("ob-err").hidden = true;

  updateOffboardCalculation();
  openDlg("dlg-offboard");
}

window.openOffboardDialog = openOffboardDialog;

["input", "change"].forEach((evt) => {
  ["ob-date", "ob-deposit", "ob-charges"].forEach((id) => {
    const node = el(id);
    if (node) { node.addEventListener(evt, updateOffboardCalculation); }
  });
});

el("form-offboard").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!offboardingRef) { return; }

  const s = PGStore.calculateExitSettlement(offboardingRef.roomId, offboardingRef.bedIndex, el("ob-date").value, {
    deposit: el("ob-deposit").value,
    charges: el("ob-charges").value
  });

  const res = PGStore.checkoutTenantWithSettlement(offboardingRef.roomId, offboardingRef.bedIndex, s);
  if (!res.ok) { showErr("ob-err", res.error); return; }

  closeDlg("dlg-offboard");
  offboardingRef = null;
  toast("Tenant checked out & settled!", "success");
  commit();
});

/* ---------- receipt & whatsapp ---------- */

let receiptRef = null;

function openReceiptDialog(roomId, bedIndex) {
  const rooms = PGStore.state().rooms;
  const room = rooms.find((r) => r.id === roomId);
  if (!room) { return; }
  const bed = room.beds[bedIndex];
  if (!bed) { return; }

  receiptRef = { roomId, bedIndex };
  const owner = PGStore.state().owner || {};
  const rent = PGStore.effectiveRent(room, bed);
  const now = new Date();
  const monthLabel = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const receiptNo = "RCP-" + now.getFullYear() + String(now.getMonth() + 1).padStart(2, "0") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const isPaid = bed.paid;

  el("receipt-paper").innerHTML = `
    <div class="receipt-brand">
      <div>
        <h2>${esc(owner.name || "PG Manager")}</h2>
        <p>${esc(owner.address || "")}</p>
      </div>
      <span class="receipt-tag">${isPaid ? "PAID" : "PENDING"}</span>
    </div>
    <div class="receipt-grid">
      <div class="receipt-cell"><b>Receipt No.</b><span>${receiptNo}</span></div>
      <div class="receipt-cell"><b>Date</b><span>${now.toLocaleDateString("en-IN")}</span></div>
      <div class="receipt-cell"><b>Tenant</b><span>${esc(bed.name)}</span></div>
      <div class="receipt-cell"><b>Room / Bed</b><span>Room ${esc(room.no)} · Bed ${PGStore.bedLabel(bedIndex, roomId)}</span></div>
      <div class="receipt-cell"><b>Period</b><span>${monthLabel}</span></div>
      <div class="receipt-cell"><b>Status</b><span>${isPaid ? "✅ Paid" : "⏳ Due"}</span></div>
    </div>
    <div class="receipt-amount-box">
      <span>Rent for ${monthLabel}</span>
      <strong>${money(rent)}</strong>
    </div>
    ${owner.upiId ? `<p style="font-size:12px;text-align:center;margin-bottom:12px;color:#6b7280">Pay via UPI: <b>${esc(owner.upiId)}</b></p>` : ""}
    <div class="receipt-foot">This is a computer-generated receipt. · ${esc(owner.name || "PG Manager")}</div>`;

  openDlg("dlg-receipt");
}

function sendWhatsAppReminder(roomId, bedIndex) {
  const rooms = PGStore.state().rooms;
  const room = rooms.find((r) => r.id === roomId);
  if (!room) { return; }
  const bed = room.beds[bedIndex];
  if (!bed || !bed.phone) {
    toast("No phone number saved for this tenant. Add one in their profile first.", "warn");
    return;
  }
  const owner = PGStore.state().owner || {};
  const rent = PGStore.effectiveRent(room, bed);
  const month = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const upiLine = owner.upiId ? `\n💳 UPI: ${owner.upiId}` : "";
  const msg = `Hi ${bed.name.split(" ")[0]}, this is a friendly reminder that your rent of ${money(rent)} for ${month} is due.${upiLine}\n\n— ${owner.name || "Your PG Owner"}`;
  const phone = bed.phone.replace(/\D/g, "");
  window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
}

/* ---------- transfer form ---------- */

el("form-transfer").addEventListener("submit", (e) => {
  e.preventDefault();
  const dest = el("tr-dest").value.split("|");
  const fromRoom = el("tr-dest").dataset.fromRoom;
  const fromBed = Number(el("tr-dest").dataset.fromBed);
  const res = PGStore.transferTenant(fromRoom, fromBed, dest[0], Number(dest[1]));
  if (!res.ok) { showErr("tr-err", res.error); return; }
  closeDlg("dlg-transfer");
  toast("Tenant transferred!", "success");
  commit();
});

/* ---------- complaint forms ---------- */

el("form-complaint").addEventListener("submit", (e) => {
  e.preventDefault();
  const roomSel = el("co-room").value;
  const roomData = PGStore.state().rooms.find((r) => r.id === roomSel);
  const res = PGStore.addComplaint({
    title: el("co-title").value,
    roomId: roomSel || "",
    roomNo: roomData ? roomData.no : "",
    category: el("co-cat").value,
    priority: el("co-priority").value,
    date: el("co-date").value,
    note: el("co-note").value,
    status: "open",
    cost: 0
  });
  if (!res.ok) { showErr("co-err", res.error); return; }
  closeDlg("dlg-complaint");
  toast("Issue logged!", "success");
  commit();
});

el("form-resolve-complaint").addEventListener("submit", (e) => {
  e.preventDefault();
  var id = el("form-resolve-complaint").dataset.compId;
  if (!id) return;
  var syncExp = el("rco-sync-exp").checked;
  var res = PGStore.updateComplaint(id, {
    status: el("rco-status").value,
    cost: Number(el("rco-cost").value) || 0,
    syncExpense: syncExp
  });
  if (!res.ok) { showErr("rco-err", res.error); return; }
  closeDlg("dlg-resolve-complaint");
  toast("Issue updated!", "success");
  commit();
});

/* ---------- CSV exporters ---------- */

function csvDownload(filename, rows) {
  const csv = "\uFEFF" + rows.map((r) => r.map((c) => '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"').join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  a.download = filename;
  a.click();
}

function exportTenantsCsv() {
  const list = tenants();
  const rows = [["Name", "Phone", "Room", "Bed", "Rent", "Deposit", "Joined", "Leaving", "Status", "ID Type", "ID No.", "Emergency", "Workplace", "Note"]];
  list.forEach((t) => rows.push([t.name, t.phone, t.roomNo, t.bed, t.rent, t.deposit, t.joined, t.leaving || "", t.status, t.idType, t.idNumber, t.emergencyContact, t.workplace, t.note]));
  csvDownload("tenants-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
  toast("Tenants exported!", "success");
}

function exportLedgerCsv() {
  const rows = [["Tenant", "Room", "Bed", "Month", "Paid"]];
  PGStore.state().rooms.forEach((room) => {
    room.beds.forEach((bed, i) => {
      if (!bed) { return; }
      const label = PGStore.bedLabel(i, room.id);
      const months = monthsBetweenJS(
        bed.joined ? bed.joined.slice(0, 7) : new Date().toISOString().slice(0, 7),
        new Date().toISOString().slice(0, 7)
      );
      months.forEach((m) => {
        rows.push([bed.name, room.no, label, m, (bed.paidMonths || []).includes(m) ? "Yes" : "No"]);
      });
    });
  });
  csvDownload("ledger-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
  toast("Ledger exported!", "success");
}

function exportExpensesCsv() {
  const rows = [["Date", "Category", "Amount", "Note"]];
  PGStore.state().expenses.forEach((x) => rows.push([x.date, x.category, x.amount, x.note || ""]));
  csvDownload("expenses-" + new Date().toISOString().slice(0, 10) + ".csv", rows);
  toast("Expenses exported!", "success");
}

/* ---------- actions ---------- */

/* ---------- dropdown menus ---------- */
/* Portal: move dd-menu to body to escape overflow containers */
function ddPortalOpen(menu, trigger) {
  if (!menu._ported) {
    menu._originalParent = menu.parentNode;
    document.body.appendChild(menu);
    menu._ported = true;
  }
  /* Ensure a backdrop exists */
  let bd = document.getElementById("dd-backdrop");
  if (!bd) {
    bd = document.createElement("div");
    bd.id = "dd-backdrop";
    bd.style.cssText = "position:fixed;inset:0;z-index:999;background:transparent;";
    bd.addEventListener("click", ddCloseAll);
    bd.addEventListener("touchstart", ddCloseAll, { passive: true });
    document.body.appendChild(bd);
  }
  bd.hidden = false;
}
function ddCloseAll() {
  document.querySelectorAll(".dd-menu:not([hidden])").forEach((m) => {
    m.hidden = true;
    /* Return to original position */
    if (m._ported && m._originalParent) {
      m._originalParent.appendChild(m);
      m._ported = false;
    }
    m.style.cssText = "";
  });
  document.querySelectorAll("[aria-expanded]").forEach((b) => { b.setAttribute("aria-expanded", "false"); });
  const bd = document.getElementById("dd-backdrop");
  if (bd) bd.hidden = true;
}
document.addEventListener("click", (e) => {
  /* Toggle dropdown on trigger click */
  const trigger = e.target.closest("[data-dd]");
  if (trigger) {
    e.stopPropagation();
    const menu = el(trigger.dataset.dd);
    const open = menu.hidden;
    /* Close all other open menus first */
    ddCloseAll();
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      ddPortalOpen(menu, trigger);
      /* Position the fixed menu relative to the trigger button */
      const rect = trigger.getBoundingClientRect();
      const menuW = 180;
      let left = rect.right - menuW;
      let top = rect.bottom + 4;
      if (left < 8) left = 8;
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
      if (top + 220 > window.innerHeight) { top = rect.top - 4; menu.style.transform = 'translateY(-100%)'; }
      else { menu.style.transform = 'none'; }
      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
      menu.style.right = 'auto';
    }
    return;
  }
  /* Close any open menu when clicking elsewhere */
  if (!e.target.closest(".dd-menu")) {
    ddCloseAll();
  }

  const btn = e.target.closest("[data-act]");
  if (!btn) { return; }
  /* Ignore clicks on disabled buttons */
  if (btn.disabled) { return; }
  /* Close the parent dropdown if this action came from one */
  const parentMenu = btn.closest(".dd-menu");
  if (parentMenu) { parentMenu.hidden = true; }

  const act = btn.dataset.act;
  const roomId = btn.dataset.room;
  const bedIndex = btn.dataset.bed;

  if (act === "add-room") {
    el("form-room").reset();
    openDlg("dlg-room");
  } else if (act === "add-tenant") {
    el("form-tenant").reset();
    openTenantDialog(null, null);
  } else if (act === "fill-bed") {
    el("form-tenant").reset();
    openTenantDialog(roomId, bedIndex);
  } else if (act === "name-property") {
    el("p-name").value = PGStore.state().property;
    openDlg("dlg-property");
  } else if (act === "del-room") {
    confirmAsync({ type: 'danger', title: 'Remove room?', message: 'Remove this room? Any tenants in it are removed too.', okText: 'Remove', icon: '🗑' }).then(function (ok) {
      if (ok) { PGStore.removeRoom(roomId); commit(); }
    });
  } else if (act === "edit-room") {
    openEditRoomDialog(roomId);
  } else if (act === "notice") {
    PGStore.toggleNotice(roomId, Number(bedIndex));
    commit();
    toast('Notice period toggled', 'info');
  } else if (act === "checkout") {
    openOffboardDialog(roomId, Number(bedIndex));
  } else if (act === "pay") {
    var isPaid = btn.dataset.paid === "1";
    PGStore.setPaid(roomId, Number(bedIndex), isPaid);
    commit();
    toast(isPaid ? 'Marked as paid ✓' : 'Payment undone', 'success');
  } else if (act === "add-expense") {
    el("form-expense").reset();
    openExpenseDialog();
  } else if (act === "del-expense") {
    confirmAsync({ type: 'danger', title: 'Remove expense?', message: 'Remove this expense?', okText: 'Remove', icon: '🗑' }).then(function (ok) {
      if (ok) { PGStore.removeExpense(btn.dataset.exp); commit(); }
    });
  } else if (act === "backup-restore") {
    confirmAsync({ type: 'info', title: 'Restore from sheet?', message: 'Replace everything on this account with the last backup from the sheet?', okText: 'Restore', icon: '📥' }).then(function (ok) {
      if (!ok) return;
      PGSheets.restore().then((data) => {
        PGStore.replaceAll(data);
        renderAll();
        toast('Restored from Google Sheets', 'success');
      }, (err) => {
        toast(err && err.message ? err.message : "Could not restore from the sheet.", "error");
      });
    });
  } else if (act === "whatsapp-bulk") {
    var s = PGStore.state();
    var tenantsWithPhone = [];
    (s.rooms || []).forEach(function (room) {
      (room.beds || []).forEach(function (bed) {
        if (bed && bed.phone) {
          tenantsWithPhone.push({ name: bed.name, phone: bed.phone, rent: bed.rent || room.rent, room: room.no });
        }
      });
    });
    if (!tenantsWithPhone.length) {
      toast("No tenants with phone numbers found", "error");
    } else {
      var msg = "Send rent reminders to " + tenantsWithPhone.length + " tenants via WhatsApp?";
      confirmAsync({ type: 'info', title: 'WhatsApp Reminders', message: msg, okText: 'Send All', icon: '📱' }).then(function (ok) {
        if (!ok) return;
        tenantsWithPhone.forEach(function (t, i) {
          setTimeout(function () {
            PGAnalytics.sendWhatsAppReminder(t.phone, t.name, t.rent, t.room);
          }, i * 800);
        });
        toast("Opening WhatsApp for " + tenantsWithPhone.length + " tenants", "success");
      });
    }
  } else if (act === "set-rents") {
    openSetRents();
  } else if (act === "rate-card") {
    openRateCard();
  } else if (act === "view-payment-history") {
    location.hash = "#rent";
    setTimeout(function () { window.PGAnalytics && window.PGAnalytics.renderPaymentHistory && window.PGAnalytics.renderPaymentHistory(); }, 100);
  } else if (act === "add-rate") {
    closeDlg("dlg-rates");
    el("ra-label").value = "";
    el("ra-amt").value = "";
    el("ra-note").value = "";
    openDlg("dlg-rate");
  } else if (act === "del-rate") {
    PGStore.removeRate(btn.dataset.rate);
    commit();
  } else if (act === "edit-owner") {
    openOwnerDialog();
  } else if (act === "backfill") {
    openBackfillDialog(roomId, Number(bedIndex));
  } else if (act === "bf-all") {
    el("dlg-backfill").querySelectorAll("input[name=bf-month]").forEach((cb) => { cb.checked = true; });
  } else if (act === "bf-none") {
    el("dlg-backfill").querySelectorAll("input[name=bf-month]").forEach((cb) => { cb.checked = false; });
  } else if (act === "transfer") {
    /* Open the transfer dialog — populate destination picker with vacant beds. */
    const src = tenants().find((t) => t.roomId === roomId && t.bedIndex === Number(bedIndex));
    if (!src) { return; }
    el("tr-who").textContent = src.name + " — currently Room " + src.roomNo + " Bed " + src.bed;
    const vacant = PGStore.vacantBeds();
    if (!vacant.length) { toast("No vacant beds to transfer to.", "info"); return; }
    el("tr-dest").innerHTML = vacant.map((b) =>
      `<option value="${esc(b.roomId)}|${b.bedIndex}">Room ${esc(b.roomNo)} · Bed ${b.bed} — ${money(b.rent)}</option>`
    ).join("");
    el("tr-dest").dataset.fromRoom = roomId;
    el("tr-dest").dataset.fromBed = bedIndex;
    el("tr-err").hidden = true;
    openDlg("dlg-transfer");
  } else if (act === "receipt") {
    openReceiptDialog(roomId, Number(bedIndex));
  } else if (act === "wa-remind") {
    sendWhatsAppReminder(roomId, Number(bedIndex));
  } else if (act === "print-receipt") {
    window.print();
  } else if (act === "share-receipt") {
    if (receiptRef) { sendWhatsAppReminder(receiptRef.roomId, receiptRef.bedIndex); }
  } else if (act === "add-complaint") {
    el("form-complaint").reset();
    el("co-date").value = new Date().toISOString().slice(0, 10);
    /* Populate room picker. */
    el("co-room").innerHTML = '<option value="">— General / Common area —</option>' +
      PGStore.state().rooms.map((r) => `<option value="${esc(r.id)}">${esc(r.no)}</option>`).join("");
    el("co-err").hidden = true;
    openDlg("dlg-complaint");
  } else if (act === "resolve-complaint") {
    var comp = PGStore.complaints().find((c) => c.id === btn.dataset.comp);
    if (!comp) return;
    el("rco-title").textContent = comp.title;
    el("rco-status").value = comp.status;
    el("rco-cost").value = comp.cost || 0;
    el("rco-sync-exp").checked = true;
    el("rco-err").hidden = true;
    /* Store the id for the form submit */
    el("form-resolve-complaint").dataset.compId = comp.id;
    openDlg("dlg-resolve-complaint");
  } else if (act === "del-complaint") {
    confirmAsync({ type: 'danger', title: 'Remove issue?', message: 'Remove this issue?', okText: 'Remove', icon: '🗑' }).then(function (ok) {
      if (ok) { PGStore.removeComplaint(btn.dataset.comp); commit(); }
    });
  } else if (act === "export-tenants") {
    exportTenantsCsv();
  } else if (act === "export-ledger") {
    exportLedgerCsv();
  } else if (act === "export-expenses") {
    exportExpensesCsv();
  } else if (act === "bulk-mark-paid") {
    bulkMarkAllPaid();
  } else if (act === "bulk-whatsapp") {
    broadcastWhatsAppReminders();
  } else if (act === "export-all") {
    exportAllCsv();
  } else if (act === "send-receipt-all") {
    sendReceiptsToAllPaid();
  } else if (act === "download-backup") {
    downloadJsonBackup();
  } else if (act === "import-backup") {
    importJsonBackup();
  } else if (act === "reset-all") {
    resetAllData();
  } else if (act === "edit-rules") {
    openRulesDialog();
  } else if (act === "set-opt") {
    const raw = btn.dataset.val;
    const patch = {};
    patch[btn.dataset.key] = raw === "true" ? true : raw === "false" ? false : raw;
    PGStore.setSettings(patch);
    commit();
  } else if (act === "close") {
    closeDlg(btn.dataset.dlg);
  }
});

el("form-room").addEventListener("submit", (e) => {
  e.preventDefault();
  const res = PGStore.addRoom({
    no: el("r-no").value,
    floor: PGStore.settings().floors === false ? 0 : el("r-floor").value,
    beds: el("r-beds").value,
    rent: el("r-rent").value
  });
  if (!res.ok) { showErr("r-err", res.error); return; }
  closeDlg("dlg-room");
  toast("Room added!", "success");
  commit();
});

/* ---------- Edit Room dialog ---------- */
let editRoomRef = null;

function openEditRoomDialog(roomId) {
  const s = PGStore.state();
  const room = s.rooms.find(r => r.id === roomId);
  if (!room) return;

  editRoomRef = roomId;
  el("er-id").value = roomId;
  el("er-no").value = room.no;
  el("er-floor").value = room.floor;
  el("er-beds").value = room.beds.length;
  el("er-rent").value = room.rent;
  el("er-err").hidden = true;

  const filled = room.beds.filter(Boolean).length;
  const hint = el("er-beds-hint");
  hint.textContent = `${filled} occupied · ${room.beds.length - filled} vacant`;
  hint.style.display = filled > 0 ? 'block' : 'none';

  /* Show warning if trying to reduce beds below occupied count */
  el("er-beds").addEventListener("input", function () {
    const newCount = Number(this.value) || 0;
    const h = el("er-beds-hint");
    if (newCount < filled) {
      h.textContent = `⚠ Can't go below ${filled} (occupied beds)`;
      h.style.color = 'var(--red)';
    } else {
      h.textContent = `${filled} occupied · ${newCount - filled} vacant`;
      h.style.color = '';
    }
  });

  openDlg("dlg-edit-room");
}

window.openEditRoomDialog = openEditRoomDialog;

el("form-edit-room").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!editRoomRef) return;

  const roomId = editRoomRef;
  const s = PGStore.state();
  const room = s.rooms.find(r => r.id === roomId);
  if (!room) return;

  const newNo = el("er-no").value.trim();
  const newFloor = el("er-floor").value;
  const newRent = el("er-rent").value;
  const newBedCount = Number(el("er-beds").value) || room.beds.length;
  const filled = room.beds.filter(Boolean).length;

  /* Validate bed count */
  if (newBedCount < filled) {
    showErr("er-err", `Can't reduce to ${newBedCount} beds — ${filled} are occupied.`);
    return;
  }
  if (newBedCount < 1) {
    showErr("er-err", "A room needs at least 1 bed.");
    return;
  }
  if (newBedCount > 12) {
    showErr("er-err", "Maximum 12 beds per room.");
    return;
  }

  /* Adjust bed count BEFORE updating room (updateRoom calls save()) */
  const oldBedCount = room.beds.length;
  if (newBedCount > room.beds.length) {
    for (let i = room.beds.length; i < newBedCount; i++) {
      room.beds.push(null);
    }
  } else if (newBedCount < room.beds.length) {
    room.beds.length = newBedCount;
  }

  /* Update room properties (rent, number, floor) */
  const res = PGStore.updateRoom(roomId, {
    no: newNo,
    floor: PGStore.settings().floors === false ? 0 : newFloor,
    rent: newRent
  });
  if (!res.ok) { showErr("er-err", res.error); return; }

  if (newBedCount > oldBedCount) {
    toast(`Room ${newNo} — now has ${newBedCount} beds`, "success");
  } else if (newBedCount < oldBedCount) {
    toast(`Room ${newNo} — reduced to ${newBedCount} beds`, "success");
  } else {
    toast(`Room ${newNo} updated`, "success");
  }

  closeDlg("dlg-edit-room");
  editRoomRef = null;
  commit();
});

el("form-tenant").addEventListener("submit", (e) => {
  e.preventDefault();
  const picked = String(el("t-bed").value || "").split("|");
  const customRentInput = el("t-rent") ? el("t-rent").value.trim() : "";
  const res = PGStore.addTenant(picked[0], picked[1], {
    name: el("t-name").value,
    phone: el("t-phone").value,
    joined: el("t-joined").value,
    leaving: el("t-leaving").value,
    rent: customRentInput === "" ? null : customRentInput,
    note: el("t-note").value
  });
  if (!res.ok) { showErr("t-err", res.error); return; }
  closeDlg("dlg-tenant");
  toast("Tenant added!", "success");
  commit();
});

el("form-expense").addEventListener("submit", (e) => {
  e.preventDefault();
  const res = PGStore.addExpense({
    category: el("x-cat").value,
    amount: el("x-amt").value,
    date: el("x-date").value,
    note: el("x-note").value
  });
  if (!res.ok) { showErr("x-err", res.error); return; }
  closeDlg("dlg-expense");
  toast("Expense logged!", "success");
  commit();
});

el("form-rate").addEventListener("submit", (e) => {
  e.preventDefault();
  const res = PGStore.addRate({
    label: el("ra-label").value,
    amount: el("ra-amt").value,
    note: el("ra-note").value
  });
  if (!res.ok) { showErr("ra-err", res.error); return; }
  closeDlg("dlg-rate");
  toast("Rate added!", "success");
  commit();
});

el("form-owner").addEventListener("submit", (e) => {
  e.preventDefault();
  const res = PGStore.setOwner({
    name: el("o-name").value,
    phone: el("o-phone").value,
    upiId: el("o-upi") ? el("o-upi").value : "",
    address: el("o-address").value,
    pgStartDate: el("o-pgdate") ? el("o-pgdate").value : ""
  });
  if (!res.ok) { showErr("o-err", res.error); return; }
  closeDlg("dlg-owner");
  toast("Details saved!", "success");
  commit();
});

el("form-rules").addEventListener("submit", (e) => {
  e.preventDefault();
  PGStore.setRules({
    visiting: el("ru-visit").value,
    quiet: el("ru-quiet").value,
    guests: el("ru-guest").value,
    lockout: el("ru-lock").value,
    other: el("ru-other").value
  });
  closeDlg("dlg-rules");
  toast("Rules saved!", "success");
  commit();
});

el("form-property").addEventListener("submit", (e) => {
  e.preventDefault();
  const val = el("p-name").value.trim();
  const result = PGStore.setProperty(val);
  if (!result || result.ok !== true) {
    toast("Could not save property name. Storage may be full.", "error", 6000);
    return;
  }
  renderAll();
  closeDlg("dlg-property");
  toast(val ? "Property name saved!" : "Property name cleared.", "success");
  commit();
});

/* Save on Enter key in the property name input */
el("p-name").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    el("form-property").dispatchEvent(new Event("submit"));
  }
});

/* Save on blur as a safety net */
el("p-name").addEventListener("blur", () => {
  const val = el("p-name").value.trim();
  if (val !== PGStore.state().property) {
    PGStore.setProperty(val);
    renderAll();
  }
});

el("form-backfill").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!backfillRef) { return; }

  /* Collect all checked months. */
  const checked = Array.from(
    el("dlg-backfill").querySelectorAll("input[name=bf-month]:checked")
  ).map((cb) => cb.value);

  if (!checked.length) {
    showErr("bf-err", "Check at least one month, or cancel.");
    return;
  }

  /* Resolve collection day: explicit input → joining date day → 1. */
  let collectDay = parseInt(el("bf-collect").value, 10);
  if (!collectDay || collectDay < 1 || collectDay > 31) {
    /* Auto-detect from joining date. */
    const rooms = PGStore.state().rooms;
    const room = rooms.find((r) => r.id === backfillRef.roomId);
    const bed = room && room.beds[backfillRef.bedIndex];
    collectDay = (bed && bed.joined) ? parseInt(bed.joined.split("-")[2], 10) : 1;
  }

  const res = PGStore.bulkMarkPaid(
    backfillRef.roomId,
    backfillRef.bedIndex,
    checked,
    collectDay
  );

  if (!res.ok) { showErr("bf-err", res.error); return; }
  closeDlg("dlg-backfill");
  backfillRef = null;
  toast("Payment history saved!", "success");
  commit();
});

/* ---------- navigation ---------- */

function show(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === "view-" + view));
  document.querySelectorAll(".tab").forEach((t) => {
    const active = t.dataset.view === view;
    t.classList.toggle("is-active", active);
    if (active) { t.setAttribute("aria-current", "page"); } else { t.removeAttribute("aria-current"); }
  });
  /* Smooth scroll to top with momentum on mobile */
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

el("tabs").addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) { location.hash = tab.dataset.view; }
});

/* ---------- tenant table toggle ---------- */
var tenantToggleBtn = el('tenant-toggle');
if (tenantToggleBtn) {
  tenantToggleBtn.addEventListener('click', function () {
    _tenantsExpanded = !_tenantsExpanded;
    renderTenants();
  });
}

/* ---------- sidebar toggle ---------- */
var sidebarToggle = el('sidebar-toggle');
if (sidebarToggle) {
  sidebarToggle.addEventListener('click', function () {
    var sb = document.querySelector('.sidebar');
    var main = document.querySelector('.app-main');
    if (!sb || !main) return;
    var collapsed = sb.classList.toggle('is-collapsed');
    main.classList.toggle('sidebar-collapsed', collapsed);
    sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
  });
}

/* Set rents save button */
var setRentBtn = el('setrents-save');
if (setRentBtn) { setRentBtn.addEventListener('click', saveSetRents); }

/* Complaint filter pills */
var compFilters = el("comp-filters");
if (compFilters) {
  compFilters.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    compFilters.querySelectorAll(".pill").forEach((p) => p.classList.remove("is-active"));
    pill.classList.add("is-active");
    renderComplaints();
  });
}

window.addEventListener("hashchange", () => show(location.hash.slice(1) || "dashboard"));

/* ---------- boot ---------- */

function pgDuration(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return "not started yet";
  if (days < 30) return days + " day" + (days !== 1 ? "s" : "");
  const months = Math.floor(days / 30);
  const rem = days % 30;
  if (months < 12) {
    return months + " month" + (months !== 1 ? "s" : "") + (rem > 0 ? " and " + rem + " day" + (rem !== 1 ? "s" : "") : "");
  }
  const years = Math.floor(months / 12);
  const rMonths = months % 12;
  return years + " year" + (years !== 1 ? "s" : "") + (rMonths > 0 ? " and " + rMonths + " month" + (rMonths !== 1 ? "s" : "") : "");
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) { return "Good morning"; }
  if (h < 17) { return "Good afternoon"; }
  return "Good evening";
}

function boot(session) {
  const name = (session && session.name) || "Owner";
  const accountId = (session && session.id) || "local";
  PGStore.use(accountId);
  window.PG_SESSION = { name: name, id: accountId };

  if (window.PGSheets) {
    PGSheets.use(accountId);
    PGSheets.onStatus(renderBackup);
  }

  /* Show header immediately — don't wait for anything */
  el("greet").textContent = greeting() + ", " + String(name).split(" ")[0];
  el("avatar").textContent = initials(name);
  el("avatar").title = name;
  el("stamp").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  });

  /* Render from localStorage instantly (fast path) */
  renderAll();
  show(location.hash.slice(1) || "dashboard");

  /* Connect to Supabase data storage if available (async, non-blocking). */
  if (window.SupabaseStorage) {
    SupabaseStorage.init(accountId);
    if (SupabaseStorage.isAvailable()) {
      /* Startup schema check: verify every table has the columns the client
         writes BEFORE any save can hit a 42703 and lose a field. Drift is
         surfaced via the pg:storage-schema-drift event listener above. */
      SupabaseStorage.checkSchema();
      var cloudLoading = true;
      SupabaseStorage.healthCheck().then(function (ok) {
        if (!ok) {
          cloudLoading = false;
          toast("Database unreachable — changes are saved locally and will sync when it's back.", "warn", 6000);
        }
      });
      SupabaseStorage.load().then(function (data) {
        cloudLoading = false;
        if (data && data.rooms) {
          /* Data-safety merge: if the cloud copy is missing tenants/rooms that
             exist locally (e.g. the last save failed), the local state is NEWER
             for those items — merge instead of overwriting, then save the union
             back up. Prevents a failed save from erasing new tenants forever. */
          var local = PGStore.state();
          var cloudRooms = data.rooms || [];
          var localRooms = local.rooms || [];
          var cloudIds = {};
          cloudRooms.forEach(function (r) { cloudIds[r.id] = true; });
          var missing = localRooms.filter(function (r) { return !cloudIds[r.id]; });
          var localTenants = 0, cloudTenants = 0;
          localRooms.forEach(function (r) { (r.beds || []).forEach(function (b) { if (b) localTenants++; }); });
          cloudRooms.forEach(function (r) { (r.beds || []).forEach(function (b) { if (b) cloudTenants++; }); });

          if (missing.length || localTenants > cloudTenants) {
            /* Cloud is behind the browser — keep the browser's data. */
            console.warn("[boot] Cloud behind local (cloud rooms: " + cloudRooms.length +
              ", local rooms: " + localRooms.length + ") — keeping local data and re-syncing.");
            renderAll();
            toast("Using this device's data — cloud copy was out of date.", "info", 4000);
            dispatchSave();
            return;
          }
          PGStore.replaceAll(data);
          renderAll();
          toast("Synced with cloud.", "success", 2000);
        }
      }).catch(function (e) {
        cloudLoading = false;
        console.warn("Supabase load failed, using localStorage:", e);
        toast("Database unreachable — using saved local data. Will sync when it's back.", "warn", 6000);
      });
    }
  }
}

try {
  PGAuth.session().then((s) => {
    // A signed-out visitor is redirected by the gate in index.html.
    if (s.signedIn) { boot(s); }
  }, () => boot(null));
} catch (err) {
  boot(null);
}

/* ---------- session + theme ---------- */

const themeBtn = el("theme-toggle");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("pgTheme", next); } catch (err) {}
  });
}

const logoutBtn = el("logout");
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    const done = () => location.replace("login.html");
    if (window.PGAuth) {
      Promise.resolve(window.PGAuth.signOut()).then(done, done);
    } else {
      try { sessionStorage.removeItem("pgAuth"); } catch (err) {}
      done();
    }
  });
}

/* Close dropdowns on Escape, scroll, or resize */
document.addEventListener("keydown", (e) => { if (e.key === "Escape") ddCloseAll(); });
window.addEventListener("scroll", ddCloseAll, { passive: true });
window.addEventListener("resize", ddCloseAll, { passive: true });
