/* views/rent.js — one-tap rent ledger.
 *
 * Month switcher + one row per active tenant. Tapping the status cell
 * toggles Paid ⇄ Pending instantly (optimistic UI + undo toast for the
 * mark-as-paid direction). Long-press (pointer 500ms) or the ⋯ button opens
 * payment details: amount, paid date, method, UTR reference.
 */

import { store, mutations } from "../store/index.js";
import { esc, money, periodLabel, toast, el, openDrawer, closeDrawer } from "./ui.js";

let host = null;
let period = null;

export function initRent(container) {
  host = container;
  period = store.currentPeriod();
  ["ledger", "tenants", "rooms", "*"].forEach((ch) => store.subscribe(ch, render));
  render();
}

export function render() {
  if (!host) { return; }
  const rows = store.rentLedger(period);
  host.replaceChildren();

  /* month switcher */
  const bar = el("div", "month-bar");
  const prev = el("button", "btn btn-ghost", "←");
  prev.type = "button";
  prev.addEventListener("click", () => { period = shiftPeriod(-1); render(); });
  const next = el("button", "btn btn-ghost", "→");
  next.type = "button";
  next.addEventListener("click", () => { period = shiftPeriod(1); render(); });
  const lab = el("strong", "month-label", esc(periodLabel(period)));
  bar.append(prev, lab, next);
  host.appendChild(bar);

  if (!rows.length) {
    host.appendChild(el("div", "empty", "<p>No active tenants. Add tenants from the Beds tab.</p>"));
    return;
  }

  /* summary */
  const paid = rows.filter((r) => r.status === "paid");
  const overdue = rows.filter((r) => r.status === "overdue");
  host.appendChild(el("p", "rent-summary",
    money(paid.reduce((s, r) => s + (r.entry ? r.entry.paid : 0), 0)) + " collected · " +
    paid.length + "/" + rows.length + " paid" +
    (overdue.length ? " · " + overdue.length + " overdue" : "")));

  const list = el("ul", "rent-list");
  for (const r of rows) {
    list.appendChild(row(r));
  }
  host.appendChild(list);
}

function row(r) {
  const li = el("li", "rent-row rent-" + r.status);
  li.innerHTML =
    '<div class="rent-who"><strong>' + esc(r.tenant.name) + "</strong>" +
    '<span class="rent-amt">' + money(r.dueAmount) + "</span></div>";

  const tap = el("button", "rent-toggle rent-" + r.status);
  tap.type = "button";
  tap.textContent = r.status;
  tap.setAttribute("aria-label", r.tenant.name + " rent " + r.status + " — tap to toggle");
  tap.addEventListener("click", () => toggle(r));
  li.appendChild(tap);

  const more = el("button", "rent-more", "⋯");
  more.type = "button";
  more.title = "Payment details";
  more.setAttribute("aria-label", "Payment details for " + r.tenant.name);
  more.addEventListener("click", () => details(r));
  li.appendChild(more);

  /* long-press also opens details (500ms hold) */
  let hold = null, moved = false;
  li.addEventListener("pointerdown", () => {
    moved = false;
    hold = setTimeout(() => { if (!moved) { details(r); hold = null; } }, 500);
  });
  ["pointerup", "pointercancel", "pointermove"].forEach((ev) =>
    li.addEventListener(ev, () => { if (hold) { clearTimeout(hold); hold = null; } }));

  return li;
}

function toggle(r) {
  const res = store.toggleRent(r.tenant.id, period);
  if (!res.ok) { toast(res.error, "error"); return; }
  render();                                     // optimistic: local state already committed
  if (r.status !== "paid") {
    toast(r.tenant.name + " marked paid · " + money(res.entry.paid), "ok", 5000, {
      label: "Undo",
      fn: () => { res.undo(); toast("Undone"); }
    });
  }
}

function details(r) {
  const entry = r.entry || {};
  const f = el("form", "sheet-form");
  f.innerHTML =
    '<p class="sheet-sub">' + esc(r.tenant.name) + " · " + esc(periodLabel(period)) + "</p>" +
    '<label>Amount due (₹)<input name="due" type="number" min="0" inputmode="numeric" value="' + esc(entry.due != null ? entry.due : r.dueAmount) + '"></label>' +
    '<label>Amount paid (₹)<input name="paid" type="number" min="0" inputmode="numeric" value="' + esc(entry.paid != null ? entry.paid : 0) + '"></label>' +
    '<label>Paid on<input name="paidOn" type="date" value="' + esc(entry.paid_on || "") + '"></label>' +
    '<label>Method<select name="method">' +
    '<option value="cash"' + (entry.method === "cash" ? " selected" : "") + '>Cash</option>' +
    '<option value="upi"' + (entry.method === "upi" ? " selected" : "") + '>UPI</option>' +
    '<option value="bank"' + (entry.method === "bank" ? " selected" : "") + '>Bank transfer</option>' +
    "</select></label>" +
    '<label>Reference / UTR<input name="reference" maxlength="40" value="' + esc(entry.reference || "") + '"></label>' +
    '<label>Note<input name="note" maxlength="200" value="' + esc(entry.note || "") + '"></label>' +
    '<button class="btn btn-primary" type="submit">Save payment</button>';
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const res = mutations.setPayment(r.tenant.id, period, {
      due: fd.due, paid: fd.paid, paidOn: fd.paidOn || null,
      method: fd.method || null, reference: fd.reference, note: fd.note
    });
    if (!res.ok) { toast(res.error, "error"); return; }
    toast("Payment saved");
    render();
    closeDrawer();
  });
  openDrawer(r.tenant.name + " — " + periodLabel(period), f);
}

function shiftPeriod(delta) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
