/* PG Manager — spreadsheet import.

   Lets the owner bring in a property they already keep in Excel or Google
   Sheets instead of retyping it. Three steps: read the file (or pasted cells),
   show what was understood along with anything questionable, then write it in.
   Nothing is changed until the owner has seen the summary and pressed Import.

   This file is deliberately self-contained. It reads and writes through the
   public PGStore methods and borrows renderAll/commit from app.js if they are
   there, so neither of those files needed changing.

   .xlsx is unzipped in the browser by SheetJS when that library loads; CSV and
   pasted cells are parsed here, so the import still works if the CDN is
   blocked. No spreadsheet ever leaves the browser.
*/
(function (global) {
  "use strict";

  var MAX_BEDS = 8;        // PGStore.addRoom enforces the same ceiling
  var MAX_PREVIEW = 8;
  var MAX_WARNINGS = 12;

  /* ---------- small helpers ---------- */

  function norm(v) {
    if (v instanceof Date) { return iso(v); }
    return String(v == null ? "" : v).trim();
  }

  function key(v) {
    return norm(v).toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n) {
    return "\u20b9" + Number(n || 0).toLocaleString("en-IN");
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function isArray(v) {
    return Object.prototype.toString.call(v) === "[object Array]";
  }

  function bedLabel(i) {
    return "ABCDEFGH".charAt(i) || String(i + 1);
  }

  function pad(v, n) {
    var s = String(v);
    while (s.length < n) { s = "0" + s; }
    return s;
  }

  function iso(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1, 2) + "-" + pad(d.getDate(), 2);
  }

  /* "\u20b9 8,500 /bed" -> 8500 */
  function num(v) {
    if (typeof v === "number") { return isFinite(v) ? v : 0; }
    var s = norm(v).replace(/[^0-9.\-]/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  var YES = ["yes", "y", "true", "1", "paid", "done", "received", "cleared",
             "notice", "onnotice", "leaving", "vacating", "\u2713", "\u2714"];

  /* Anything not recognised as a yes is treated as a no, so "Due", "Pending"
     and an empty cell all mean unpaid without needing their own list. */
  function truthy(v) {
    if (typeof v === "boolean") { return v; }
    if (typeof v === "number") { return v > 0; }
    return YES.indexOf(key(v)) !== -1;
  }

  /* ---------- smart file type detection ---------- */

  var IMAGE_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/tiff", "image/bmp"];
  var PDF_TYPE = "application/pdf";

  function isImageFile(file) {
    var name = String(file.name || "").toLowerCase();
    if (IMAGE_TYPES.indexOf(file.type) !== -1) { return true; }
    return /\.(png|jpe?g|webp|tiff?|bmp)$/i.test(name);
  }

  function isPDFFile(file) {
    var name = String(file.name || "").toLowerCase();
    return file.type === PDF_TYPE || /\.pdf$/i.test(name);
  }

  function isJSONFile(file) {
    var name = String(file.name || "").toLowerCase();
    return file.type === "application/json" || /\.json$/i.test(name);
  }

  /* ---------- smart text extraction ---------- */

  /* OCR: extract text from an image using Tesseract.js */
  function extractFromImage(file) {
    return new Promise(function (resolve, reject) {
      if (!global.Tesseract) {
        reject(new Error("The OCR library (Tesseract.js) did not load. Check your internet connection and try again."));
        return;
      }

      fail("Reading text from image… this may take a moment.");

      Tesseract.recognize(file, "eng", {
        logger: function (m) {
          if (m.status === "recognizing text" && m.progress) {
            var pct = Math.round(m.progress * 100);
            var p = el("imp-err");
            if (p) { p.textContent = "OCR in progress… " + pct + "%"; p.hidden = false; }
          }
        }
      }).then(function (result) {
        var text = (result && result.data && result.data.text) || "";
        if (!text.trim()) {
          reject(new Error("No text could be read from this image. Make sure the text is clear and not too small."));
          return;
        }
        resolve(text);
      }).catch(function (err) {
        reject(new Error("Could not read the image: " + (err.message || err)));
      });
    });
  }

  /* PDF: extract text using PDF.js */
  function extractFromPDF(file) {
    return new Promise(function (resolve, reject) {
      if (!global.pdfjsLib) {
        reject(new Error("The PDF reader (PDF.js) did not load. Check your internet connection and try again."));
        return;
      }

      fail("Reading PDF…");

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not open the PDF file.")); };
      reader.onload = function () {
        var data = new Uint8Array(reader.result);
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

        global.pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
          var textParts = [];
          var pages = [];
          for (var i = 1; i <= pdf.numPages; i++) { pages.push(i); }

          pages.reduce(function (chain, pageNum) {
            return chain.then(function () {
              return pdf.getPage(pageNum).then(function (page) {
                return page.getTextContent();
              }).then(function (content) {
                var pageText = content.items.map(function (item) { return item.str; }).join(" ");
                textParts.push(pageText);
              });
            });
          }, Promise.resolve()).then(function () {
            var fullText = textParts.join("\n");
            if (!fullText.trim()) {
              reject(new Error("The PDF has no readable text. It may be a scanned image — try exporting it as an image instead."));
              return;
            }
            resolve(fullText);
          }).catch(function (err) {
            reject(new Error("Could not read the PDF: " + (err.message || err)));
          });
        }).catch(function (err) {
          reject(new Error("Could not open the PDF: " + (err.message || err)));
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* JSON: try to parse as a room/expense dataset */
  function extractFromJSON(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not open the JSON file.")); };
      reader.onload = function () {
        try {
          var data = JSON.parse(String(reader.result));
          var text = jsonToSheetText(data);
          if (!text.trim()) {
            reject(new Error("The JSON file does not contain recognizable room or expense data."));
            return;
          }
          resolve(text);
        } catch (e) {
          reject(new Error("That file is not valid JSON."));
        }
      };
      reader.readAsText(file);
    });
  }

  /* Convert common JSON structures into tab-separated text the parser understands. */
  function jsonToSheetText(data) {
    if (isArray(data)) { return jsonArrayToText(data); }
    if (data && typeof data === "object") {
      /* Look for arrays inside the object (e.g. { rooms: [...] }). */
      for (var k in data) {
        if (isArray(data[k]) && data[k].length) { return jsonArrayToText(data[k]); }
      }
    }
    return "";
  }

  function jsonArrayToText(arr) {
    if (!arr.length) { return ""; }
    var first = arr[0];
    if (!first || typeof first !== "object") { return ""; }

    var keys = Object.keys(first);
    var header = keys.join("\t");
    var rows = arr.map(function (obj) {
      return keys.map(function (k) {
        var v = obj[k];
        return v == null ? "" : String(v);
      }).join("\t");
    });
    return header + "\n" + rows.join("\n");
  }

  /* Show progress messages for slow operations. */
  function showProgress(message) {
    var p = el("imp-err");
    if (p) { p.textContent = message; p.hidden = false; }
  }

  function hideProgress() {
    var p = el("imp-err");
    if (p) { p.hidden = true; }
  }

  /* Spreadsheets hand dates over as Date objects, serial numbers, or text in
     any number of local formats. Returns "" for blank and null for present but
     unreadable, so the caller can tell the difference and report it. */
  function toDate(v) {
    if (v instanceof Date) { return isNaN(v.getTime()) ? null : iso(v); }
    if (typeof v === "number") {
      // Excel serial day count, offset from 1899-12-30.
      if (v > 20000 && v < 60000) { return iso(new Date(Math.round((v - 25569) * 86400000))); }
      return null;
    }

    var s = norm(v);
    if (!s) { return ""; }

    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);
    if (m) { return m[1] + "-" + pad(m[2], 2) + "-" + pad(m[3], 2); }

    // Day first: the India-facing formats people actually type.
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})$/);
    if (m) {
      var y = m[3].length === 2 ? "20" + m[3] : m[3];
      return y + "-" + pad(m[2], 2) + "-" + pad(m[1], 2);
    }

    var d = new Date(s);
    return isNaN(d.getTime()) ? null : iso(d);
  }

  /* ---------- reading delimited text ---------- */

  /* Handles quoted fields, doubled quotes inside them, and either line ending. */
  function parseDelimited(text, delim) {
    var rows = [];
    var row = [];
    var field = "";
    var quoted = false;
    var i = 0;

    while (i < text.length) {
      var c = text.charAt(i);

      if (quoted) {
        if (c === '"') {
          if (text.charAt(i + 1) === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++; continue;
        }
        field += c; i++; continue;
      }

      if (c === '"') { quoted = true; i++; continue; }
      if (c === delim) { row.push(field); field = ""; i++; continue; }

      if (c === "\n" || c === "\r") {
        if (c === "\r" && text.charAt(i + 1) === "\n") { i++; }
        row.push(field); rows.push(row); row = []; field = ""; i++; continue;
      }

      field += c; i++;
    }

    row.push(field);
    rows.push(row);

    return withLines(rows);
  }

  /* Blank rows are dropped, but the owner still reads row numbers off their own
     screen, so each surviving row remembers where it actually came from. */
  function withLines(rows) {
    rows.forEach(function (r, i) { r.line = i + 1; });
    return rows.filter(function (r) {
      return r.some(function (cell) { return norm(cell) !== ""; });
    });
  }

  /* Cells copied out of Google Sheets arrive tab separated; a downloaded file
     is usually commas, and a European export may be semicolons. */
  function parseText(text) {
    var sample = text.split(/\r?\n/).slice(0, 5).join("\n");
    var counts = [
      { d: "\t", n: (sample.match(/\t/g) || []).length },
      { d: ",", n: (sample.match(/,/g) || []).length },
      { d: ";", n: (sample.match(/;/g) || []).length }
    ].sort(function (a, b) { return b.n - a.n; });

    return parseDelimited(text, counts[0].n > 0 ? counts[0].d : ",");
  }

  /* ---------- understanding the columns ---------- */

  var FIELDS = {
    room:     { label: "Room",       aliases: ["room", "roomno", "roomnumber", "roomname", "rm", "rooms", "roomno", "room_name", "room_number", "room_number", "roomid", "room_id", "flat", "flatno", "flatnumber", "unit", "unitno", "apartment", "apt", "houseno", "house_number", "pg_room", "bedno", "bed_no", "bed_no", "bednumber", "bed_number", "customerid", "customer_id", "bedno1"] },
    floor:    { label: "Floor",      aliases: ["floor", "flr", "level", "storey", "story", "floor_no", "floorno", "floor_number"] },
    rent:     { label: "Rent",       aliases: ["rent", "rentperbed", "monthlyrent", "rentamount", "roomrent", "price", "fees", "fee", "rent_per_bed", "monthly_rent", "rent_amount", "room_rent", "rental", "rentprice", "rent_fee", "amount_per_bed", "per_bed", "bed_rent", "bedrent", "monthly", "monthly_fee", "planrent", "plan_rent", "dueamountmonths", "dueamountdays", "dueamount"] },
    bed:      { label: "Bed",        aliases: ["bed", "bedletter", "bedname", "bed_name", "bedid", "bed_id", "cot", "berth", "bunk"] },
    tenant:   { label: "Tenant",     aliases: ["tenant", "tenantname", "name", "fullname", "student", "occupant", "person", "boarder", "guest", "tenant_name", "tenantname", "occupant_name", "guest_name", "resident", "member", "lodger", "payer", "customer", "client", "user", "tenant_id"] },
    phone:    { label: "Phone",      aliases: ["phone", "phoneno", "phonenumber", "mobile", "mobileno", "contact", "contactno", "whatsapp", "phone_no", "phone_number", "mobile_no", "mobile_number", "contact_number", "tel", "telephone", "cell", "cellphone", "whatsapp_number", "whats_app", "mobilephone"] },
    joined:   { label: "Joined",     aliases: ["joined", "joiningdate", "joindate", "doj", "dateofjoining", "since", "checkin", "admissiondate", "join_date", "joining_date", "check_in_date", "checkin_date", "start_date", "startdate", "move_in_date", "movedin", "admitted", "from_date", "fromdate", "entry_date", "entrydate", "dtofjoining", "dt_of_joining", "dateofjoining", "reco", "recodt", "reco_dt", "recoverydate", "recovery_date"] },
    notice:   { label: "On notice",  aliases: ["onnotice", "notice", "leaving", "vacating", "noticeperiod", "on_notice", "notice_period", "leaving_date", "vacating_date", "notice_flag", "is_leaving", "is_vacating", "departure"] },
    paid:     { label: "Paid",       aliases: ["paid", "rentpaid", "payment", "paymentstatus", "paidstatus", "status", "paid_status", "rent_paid", "payment_status", "settlement", "settled", "cleared", "receipt", "collected", "recovered", "payment_made", "rent_received"] },
    deposit:  { label: "Deposit",    aliases: ["deposit", "depositbalance", "deposit_balance", "securitydeposit", "security_deposit", "deposit_amount", "dep", "dep_bal", "depositbal", "dipositbalance", "diposit_balance", "dipositbal", "diposit", "rentbalance", "rent_balance", "totalcollections", "total_collections", "totaldues", "total_dues"] },
    category: { label: "Category",   aliases: ["category", "head", "expensehead", "particulars", "item", "expense", "type", "expense_category", "expense_head", "expense_type", "spending_category", "cost_head", "bill_category", "ledger_head", "group", "classification"] },
    amount:   { label: "Amount",     aliases: ["amount", "cost", "value", "spent", "expenseamount", "total", "expense_amount", "cost_amount", "spending", "expenditure", "bill_amount", "bill_total", "sum", "price_amount", "payable", "charges", "bill", "billing"] },
    date:     { label: "Date",       aliases: ["date", "expensedate", "paidon", "billdate", "expense_date", "bill_date", "paid_date", "payment_date", "transaction_date", "txn_date", "trans_date", "entry_date", "record_date", "when", "on_date"] },
    note:     { label: "Note",       aliases: ["note", "notes", "remark", "remarks", "description", "details", "comment", "comments", "memo", "narration", "narrative", "info", "information", "extra", "extra_info", "additional", "remarks_text", "description_text", "totaldues", "total_dues", "dueamountmonths", "dueamountdays", "rentbalance", "rent_balance"] }
  };

  var BED_FIELDS = ["room", "floor", "rent", "bed", "tenant", "phone", "joined", "notice", "paid", "deposit"];
  var EXPENSE_FIELDS = ["date", "category", "amount", "note"];

  function matchField(cell) {
    var k = key(cell);
    if (!k) { return null; }
    for (var f in FIELDS) {
      if (FIELDS[f].aliases.indexOf(k) !== -1) { return f; }
    }
    /* Detect month payment columns like "April 26 Payment" → key is "april26payment" */
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\d{0,4}.*payment/i.test(k)) {
      return "paid";
    }
    /* Detect transaction reference columns like "April 26 Tranction Refrance" */
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\d{0,4}.*tran/i.test(k)) {
      return "note";
    }
    /* Detect month columns that just have the month name */
    if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\d{2,4}$/i.test(k)) {
      return "paid";
    }
    /* Fuzzy: "bed" alone → room (bed number IS the room identifier) */
    if (k === "bed" || k === "beds") { return "room"; }
    /* Fuzzy: "room" or "flat" or "unit" → room */
    if (/^(room|flat|unit|apt|rm)$/.test(k)) { return "room"; }
    /* Fuzzy: any column with "rent" in it → rent */
    if (/rent/.test(k) && k.length < 20) { return "rent"; }
    /* Fuzzy: any column with "name" in it → tenant */
    if (/name/.test(k) && k.length < 20) { return "tenant"; }
    /* Fuzzy: any column with "date" or "join" → joined */
    if (/join|date|since|checkin/.test(k) && k.length < 20) { return "joined"; }
    /* Fuzzy: "deposit" or "security" → deposit */
    if (/deposit|security|diposit/.test(k)) { return "deposit"; }
    /* Fuzzy: "status" → paid */
    if (k === "status") { return "paid"; }
    /* Fuzzy: "remark" or "note" or "comment" → note */
    if (/remark|note|comment|memo/.test(k) && k.length < 20) { return "note"; }
    return null;
  }

  /* Score one row as a candidate header row. */
  function scoreRow(cells) {
    var map = {};
    var hits = 0;
    cells.forEach(function (cell, i) {
      var f = matchField(cell);
      if (f && map[f] === undefined) { map[f] = i; hits++; }
    });
    return { map: map, hits: hits };
  }

  /* The header is rarely row 1. Our own backup sheet puts the property name in
     rows 1-2 and the column names in row 4, and people leave title rows above
     their tables all the time, so the best-scoring of the first 20 rows wins. */
  function findHeader(rows) {
    var best = { index: -1, map: {}, hits: 0 };
    var limit = Math.min(rows.length, 20);
    for (var i = 0; i < limit; i++) {
      var r = scoreRow(rows[i]);
      if (r.hits > best.hits) { best = { index: i, map: r.map, hits: r.hits }; }
    }
    console.log("[Import] Header detection: row", best.index, "with", best.hits, "hits, map:", JSON.stringify(best.map));
    return best;
  }

  function detectKind(map) {
    if (map.room !== undefined || map.tenant !== undefined || map.joined !== undefined) { return "beds"; }
    if (map.amount !== undefined) { return "expenses"; }
    return "";
  }

  /* "A" -> 0, "Bed C" -> 2, "2" -> 1. Returns -1 when there is nothing usable. */
  function bedIndex(v) {
    var s = norm(v).toUpperCase().replace(/^BED\s*/, "");
    if (!s) { return -1; }
    if (/^[A-H]$/.test(s)) { return s.charCodeAt(0) - 65; }
    var n = parseInt(s, 10);
    if (isFinite(n) && n >= 1 && n <= MAX_BEDS) { return n - 1; }
    return -1;
  }

  /* ---------- turning rows into rooms ---------- */

  function buildBeds(rows, headerIndex, map) {
    var warnings = [];
    var rooms = [];
    var byNo = {};
    var used = 0;

    rows.slice(headerIndex + 1).forEach(function (cells, n) {
      var line = cells.line || headerIndex + n + 2;   // as numbered in the sheet
      var get = function (f) {
        return map[f] === undefined ? "" : cells[map[f]];
      };

      var roomNo = norm(get("room")).slice(0, 12);
      var tenant = norm(get("tenant")).slice(0, 60);

      if (!roomNo && !tenant) { return; }

      if (!roomNo) {
        warn(warnings, "Row " + line + ": no room number, so " + (tenant || "the row") + " was left out.");
        return;
      }

      /* Skip vacant rows — no tenant name means this bed is empty */
      if (!tenant) { return; }

      /* --- Parse compound bed numbers like 0101, 0201, 1201 ---
         Pattern: first 2 digits = room, last 2 digits = bed position.
         e.g. 0101 → Room 01 Bed A, 0201 → Room 02 Bed A, etc.
         Only applies when: no separate 'bed' column, value is 4 digits, last 2 <= 8. */
      var compoundBedIdx = -1;
      if (map.bed === undefined && /^\d{4}$/.test(roomNo)) {
        var lastTwo = parseInt(roomNo.slice(2), 10);
        if (lastTwo >= 1 && lastTwo <= 8) {
          compoundBedIdx = lastTwo - 1;
          roomNo = roomNo.slice(0, 2);
        }
      }

      var rk = roomNo.toLowerCase();
      var room = byNo[rk];
      if (!room) {
        room = { id: uid(), no: roomNo, floor: 0, rent: 0, beds: [], seen: 0, hasFloor: false };
        byNo[rk] = room;
        rooms.push(room);
      }

      var floorRaw = norm(get("floor"));
      if (floorRaw !== "" && !room.hasFloor) {
        room.floor = Math.max(0, Math.round(num(floorRaw)));
        room.hasFloor = true;
      }

      var rent = Math.round(num(get("rent")));
      if (rent > 0) {
        if (room.rent === 0) {
          room.rent = rent;
        }
      }

      var idx = compoundBedIdx >= 0 ? compoundBedIdx : (map.bed !== undefined ? bedIndex(get("bed")) : -1);
      if (idx < 0) { idx = room.seen; }
      room.seen++;

      if (idx >= MAX_BEDS) {
        warn(warnings, "Row " + line + ": room " + roomNo + " cannot hold more than " +
          MAX_BEDS + " beds, so this one was left out.");
        return;
      }

      while (room.beds.length <= idx) { room.beds.push(null); }

      if (room.beds[idx]) {
        warn(warnings, "Row " + line + ": room " + roomNo + " bed " + bedLabel(idx) +
          " is listed twice, so " + room.beds[idx].name + " was kept and " +
          (tenant || "the blank row") + " dropped.");
        return;
      }

      /* tenant check already done above — skip if somehow still empty */
      if (!tenant) { return; }

      var joined = toDate(get("joined"));
      if (joined === null) {
        warn(warnings, "Row " + line + ": could not read the joining date \"" +
          norm(get("joined")) + "\", so it was left blank.");
        joined = "";
      }

      /* Always store per-bed rent if available */
      var bedCustomRent = (rent > 0) ? rent : null;

      /* --- Detect paid months from month payment columns --- */
      var MONTH_MAP = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
      var paidMonths = [];
      var hasMonthPayment = false;
      if (map.paid !== undefined) {
        var pv = norm(get("paid")).toLowerCase();
        hasMonthPayment = truthy(get("paid")) || /^(paid|payed|yes|y|ok|done|received|cleared|true|1)$/.test(pv);
      }
      /* Scan all columns for month payment patterns */
      var headerCells = rows[headerIndex] || [];
      for (var ci = 0; ci < headerCells.length; ci++) {
        var hk = key(headerCells[ci]);
        var mMatch = hk.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/);
        if (mMatch && /payment|pay$/.test(hk)) {
          var monthNum = MONTH_MAP[mMatch[1]];
          /* Extract year from header: "april26payment" → 26 → 2026 */
          var yrMatch = hk.match(/(\d{2,4})/);
          var year = String(new Date().getFullYear());
          if (yrMatch) {
            var yr = parseInt(yrMatch[1], 10);
            year = yr > 100 ? String(yr) : '20' + String(yr);
          }
          var cellVal = num(cells[ci]);
          if (cellVal > 0) {
            var monthKey = year + '-' + monthNum;
            if (paidMonths.indexOf(monthKey) === -1) { paidMonths.push(monthKey); }
            hasMonthPayment = true;
          }
        }
      }
      paidMonths.sort();
      /* Current month is also paid if tenant has any payment */
      var isPaid = hasMonthPayment || (tenant && map.paid !== undefined && truthy(get("paid")));

      room.beds[idx] = {
        name: tenant,
        phone: norm(get("phone")).slice(0, 24),
        joined: joined,
        rent: bedCustomRent,
        deposit: map.deposit !== undefined ? Math.round(num(get("deposit"))) : 0,
        onNotice: map.notice !== undefined ? truthy(get("notice")) : false,
        paidMonths: paidMonths,
        paid: isPaid
      };
      used++;
    });

    rooms.forEach(function (r) {
      if (!r.beds.length) { r.beds = [null]; }
      delete r.seen;
      delete r.hasFloor;
      if (r.rent === 0) {
        warn(warnings, "Room " + r.no + " has no rent in the sheet, so it was set to \u20b90. " +
          "You can change it later.");
      }
    });

    rooms.sort(function (a, b) {
      return a.floor - b.floor || a.no.localeCompare(b.no, undefined, { numeric: true });
    });

    return { rooms: rooms, warnings: warnings, used: used };
  }

  function buildExpenses(rows, headerIndex, map) {
    var warnings = [];
    var list = [];

    rows.slice(headerIndex + 1).forEach(function (cells, n) {
      var line = cells.line || headerIndex + n + 2;
      var get = function (f) {
        return map[f] === undefined ? "" : cells[map[f]];
      };

      var amount = Math.round(num(get("amount")));
      var category = norm(get("category")).slice(0, 30);
      var note = norm(get("note")).slice(0, 80);

      if (!amount && !category && !note) { return; }

      if (!(amount > 0)) {
        warn(warnings, "Row " + line + ": \"" + (category || note || "this row") +
          "\" has no amount above zero, so it was left out.");
        return;
      }

      var date = toDate(get("date"));
      if (date === null) {
        warn(warnings, "Row " + line + ": could not read the date \"" + norm(get("date")) +
          "\", so today's date was used.");
        date = "";
      }

      list.push({
        id: uid(),
        date: date || iso(new Date()),
        category: category || "Other",
        note: note,
        amount: amount
      });
    });

    return { expenses: list, warnings: warnings, used: list.length };
  }

  function warn(list, text) {
    if (list.length < 200) { list.push(text); }
  }

  /* ---------- the analysis shown before importing ---------- */

  function summariseBeds(rooms) {
    var out = { rooms: rooms.length, beds: 0, tenants: 0, vacant: 0, notice: 0,
                expected: 0, collected: 0, floors: 0 };
    var floors = {};

    rooms.forEach(function (r) {
      floors[r.floor] = true;
      out.beds += r.beds.length;
      r.beds.forEach(function (b) {
        if (!b) { return; }
        out.tenants++;
        out.expected += r.rent;
        if (b.onNotice) { out.notice++; }
        if (b.paid) { out.collected += r.rent; }
      });
    });

    out.vacant = out.beds - out.tenants;
    out.floors = Object.keys(floors).length;
    return out;
  }

  function summariseExpenses(list) {
    var total = 0;
    var cats = {};
    list.forEach(function (x) {
      total += x.amount;
      cats[x.category] = (cats[x.category] || 0) + x.amount;
    });
    var top = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a]; })[0] || "";
    return { count: list.length, total: total, top: top, topAmount: top ? cats[top] : 0 };
  }

  /* ---------- writing it into the store ---------- */

  function importBeds(rooms, mode) {
    var current = PGStore.state();
    var next = {
      property: current.property,
      cycle: current.cycle,
      expenses: current.expenses || [],
      activity: current.activity || [],
      rooms: []
    };

    if (mode === "replace") {
      next.rooms = rooms;
      return finish(next, "Imported " + rooms.length + (rooms.length === 1 ? " room" : " rooms") +
        " from a spreadsheet", "Everything that was here before was replaced");
    }

    // Add mode: keep what is here, fill empty beds, append genuinely new rooms.
    var existing = (current.rooms || []).map(function (r) {
      return { id: r.id, no: r.no, floor: r.floor, rent: r.rent, beds: r.beds.slice() };
    });
    var byNo = {};
    existing.forEach(function (r) { byNo[r.no.toLowerCase()] = r; });

    var added = 0;
    var skipped = 0;

    rooms.forEach(function (incoming) {
      var match = byNo[incoming.no.toLowerCase()];

      if (!match) {
        existing.push(incoming);
        byNo[incoming.no.toLowerCase()] = incoming;
        added += incoming.beds.filter(Boolean).length;
        return;
      }

      if (!match.rent && incoming.rent) { match.rent = incoming.rent; }

      incoming.beds.forEach(function (bed, i) {
        if (!bed) { return; }

        var slot = -1;
        if (!match.beds[i]) { slot = i; }
        else {
          for (var j = 0; j < match.beds.length; j++) {
            if (!match.beds[j]) { slot = j; break; }
          }
        }

        if (slot === -1 && match.beds.length < MAX_BEDS) { slot = match.beds.length; }
        if (slot === -1) { skipped++; return; }

        while (match.beds.length <= slot) { match.beds.push(null); }
        match.beds[slot] = bed;
        added++;
      });
    });

    existing.sort(function (a, b) {
      return a.floor - b.floor || String(a.no).localeCompare(String(b.no), undefined, { numeric: true });
    });

    next.rooms = existing;
    return finish(next,
      "Imported " + added + (added === 1 ? " tenant" : " tenants") + " from a spreadsheet",
      skipped ? skipped + " could not be placed, every bed was full" : "Added to what was already here");
  }

  function importExpenses(list, mode) {
    var current = PGStore.state();
    var next = {
      property: current.property,
      cycle: current.cycle,
      rooms: current.rooms || [],
      activity: current.activity || [],
      expenses: mode === "replace" ? list : (current.expenses || []).concat(list)
    };
    return finish(next,
      "Imported " + list.length + (list.length === 1 ? " expense" : " expenses") + " from a spreadsheet",
      mode === "replace" ? "The previous spending log was replaced" : "Added to the spending log");
  }

  /* ---------- Supabase sync ---------- */

  /* After an import, push the full state to Supabase so data lives in the
     database, not just the browser. Non-blocking: the UI is updated first;
     the sync runs in the background. */
  function syncToSupabase(state) {
    if (typeof SupabaseStorage === "undefined" || !SupabaseStorage.isAvailable()) { return; }
    SupabaseStorage.save(state).catch(function (err) {
      console.warn("PG Import: Supabase sync failed:", err);
    });
  }

  /* Record the import in the activity feed, then hand the whole thing to the
     store, which validates every field on the way in. */
  function finish(next, text, meta) {
    next.activity = [{ type: "in", text: text, meta: meta, at: new Date().toISOString() }]
      .concat(next.activity || []).slice(0, 20);
    PGStore.replaceAll(next);
    /* Push to Supabase in the background so data lives in the database. */
    syncToSupabase(next);
    return { ok: true, text: text };
  }

  /* ---------- dialog ---------- */

  var current = null;   // the sheet being looked at right now

  function el(id) { return document.getElementById(id); }

  function fail(message) {
    var p = el("imp-err");
    if (!p) { return; }
    p.textContent = message;
    p.hidden = false;
  }

  function openImport() {
    current = null;
    var file = el("imp-file");
    if (file) { file.value = ""; }
    var paste = el("imp-paste");
    if (paste) { paste.value = ""; }
    el("imp-err").hidden = true;
    el("imp-step-pick").hidden = false;
    el("imp-step-check").hidden = true;

    var d = el("dlg-import");
    if (d.showModal) { d.showModal(); } else { d.setAttribute("open", ""); }
  }

  function closeImport() {
    var d = el("dlg-import");
    if (d.close) { d.close(); } else { d.removeAttribute("open"); }
  }

  /* Take raw rows and work out everything we want to show. */
  function analyse(rows, sheetName) {
    if (!rows || rows.length < 2) {
      fail("That sheet does not have enough rows to read. It needs a header row and at least one row of data.");
      return;
    }

    var header = findHeader(rows);
    /* Even with 0 auto-detected hits, we still proceed and show the mapping UI
       so the user can manually assign columns. */
    if (header.hits < 1) {
      /* Find the first row with the most cells (likely the header) */
      var bestRow = 0;
      var maxCells = 0;
      for (var hi = 0; hi < Math.min(rows.length, 20); hi++) {
        if (rows[hi].length > maxCells) { maxCells = rows[hi].length; bestRow = hi; }
      }
      header = { index: bestRow, map: {}, hits: 0 };
    }

    current = {
      rows: rows,
      sheetName: sheetName || "",
      headerIndex: header.index,
      map: header.map,
      kind: detectKind(header.map),
      mode: PGStore.isEmpty() ? "replace" : "add"
    };

    if (!current.kind) {
      /* Default to "beds" so the user can manually map columns */
      current.kind = "beds";
    }

    el("imp-step-pick").hidden = true;
    el("imp-step-check").hidden = false;
    review();
  }

  /* Rebuild the result from the current column mapping and redraw the review. */
  function review() {
    var c = current;
    var built = c.kind === "beds"
      ? buildBeds(c.rows, c.headerIndex, c.map)
      : buildExpenses(c.rows, c.headerIndex, c.map);

    c.built = built;

    el("imp-summary").innerHTML = summaryHtml(c, built);
    el("imp-mapping").innerHTML = mappingHtml(c);
    el("imp-preview").innerHTML = previewHtml(c, built);
    el("imp-warnings").innerHTML = warningsHtml(built.warnings);
    el("imp-mode").innerHTML = modeHtml(c, built);

    var apply = el("imp-apply");
    apply.disabled = !built.used;
    apply.textContent = built.used
      ? (c.kind === "beds" ? "Import " + built.rooms.length + " rooms" : "Import " + built.used + " expenses")
      : "Nothing to import";
  }

  function chip(label, value) {
    return '<div class="imp-chip"><b>' + esc(String(value)) + "</b><span>" + esc(label) + "</span></div>";
  }

  function summaryHtml(c, built) {
    var where = c.sheetName ? "Sheet \u201c" + esc(c.sheetName) + "\u201d" : "Pasted cells";
    var read = c.rows.length - c.headerIndex - 1;
    var chips;

    if (c.kind === "beds") {
      var s = summariseBeds(built.rooms);
      chips = chip("rooms", s.rooms) + chip("beds", s.beds) + chip("tenants", s.tenants) +
        chip("vacant", s.vacant) + chip("rent a month", money(s.expected)) +
        chip("already paid", money(s.collected));
    } else {
      var e = summariseExpenses(built.expenses);
      chips = chip("expenses", e.count) + chip("total", money(e.total)) +
        chip("biggest", e.top || "\u2014") + chip("of which", money(e.topAmount));
    }

    var headerLine = (c.rows[c.headerIndex] && c.rows[c.headerIndex].line) || c.headerIndex + 1;

    return '<p class="imp-lead">' + where + " \u00b7 " + read + (read === 1 ? " row" : " rows") +
      " read \u00b7 column names found on row " + headerLine + ".</p>" +
      '<div class="imp-chips">' + chips + "</div>";
  }

  /* Every guess is editable, because one wrong column should not mean giving up
     and typing the whole property in by hand. */
  function mappingHtml(c) {
    var wanted = c.kind === "beds" ? BED_FIELDS : EXPENSE_FIELDS;
    var headerCells = c.rows[c.headerIndex] || [];

    /* Get sample values from first 3 data rows for each column */
    var samples = [];
    for (var si = 0; si < headerCells.length; si++) {
      var vals = [];
      for (var sj = c.headerIndex + 1; sj < Math.min(c.rows.length, c.headerIndex + 4); sj++) {
        var v = norm(c.rows[sj][si]);
        if (v) { vals.push(v); }
      }
      samples.push(vals.slice(0, 2).join(" / "));
    }

    var options = function (selected) {
      var out = '<option value="">\u2014 not in the sheet \u2014</option>';
      headerCells.forEach(function (cell, i) {
        var name = norm(cell) || "Column " + (i + 1);
        var sample = samples[i] ? " (" + samples[i].slice(0, 20) + ")" : "";
        out += '<option value="' + i + '"' + (selected === i ? " selected" : "") + ">" +
          esc(name) + esc(sample) + "</option>";
      });
      return out;
    };

    return "<details class=\"imp-map\" open><summary>Columns we matched \u2014 change any that look wrong</summary><div class=\"imp-map-grid\">" +
      wanted.map(function (f) {
        return '<label class="imp-map-row"><span>' + esc(FIELDS[f].label) + "</span>" +
          '<select data-imp-field="' + f + '">' + options(c.map[f]) + "</select></label>";
      }).join("") +
      "</div></details>";
  }

  function previewHtml(c, built) {
    var head, body;

    if (c.kind === "beds") {
      var flat = [];
      built.rooms.forEach(function (r) {
        r.beds.forEach(function (b, i) {
          flat.push({ room: r.no, bed: bedLabel(i), rent: r.rent, bedObj: b });
        });
      });

      head = "<tr><th>Room</th><th>Bed</th><th>Tenant</th><th>Phone</th><th>Joined</th><th>Rent</th><th>Paid</th></tr>";
      body = flat.slice(0, MAX_PREVIEW).map(function (x) {
        var b = x.bedObj;
        return "<tr><td>" + esc(x.room) + "</td><td>" + x.bed + "</td><td>" +
          (b ? esc(b.name) : '<i class="imp-dim">vacant</i>') + "</td><td>" +
          (b && b.phone ? esc(b.phone) : "\u2014") + "</td><td>" +
          (b && b.joined ? esc(b.joined) : "\u2014") + "</td><td>" + money(x.rent) + "</td><td>" +
          (b && b.paid ? "Yes" : "No") + "</td></tr>";
      }).join("");

      return table(head, body, flat.length);
    }

    head = "<tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr>";
    body = built.expenses.slice(0, MAX_PREVIEW).map(function (x) {
      return "<tr><td>" + esc(x.date) + "</td><td>" + esc(x.category) + "</td><td>" +
        (x.note ? esc(x.note) : "\u2014") + "</td><td>" + money(x.amount) + "</td></tr>";
    }).join("");

    return table(head, body, built.expenses.length);
  }

  function table(head, body, total) {
    if (!body) {
      return '<p class="imp-none">Nothing usable was found in these columns.</p>';
    }
    var more = total > MAX_PREVIEW
      ? '<p class="imp-more">and ' + (total - MAX_PREVIEW) + " more\u2026</p>"
      : "";
    return '<div class="imp-preview"><table class="imp-table"><thead>' + head +
      "</thead><tbody>" + body + "</tbody></table></div>" + more;
  }

  function warningsHtml(list) {
    if (!list.length) {
      return '<p class="imp-clean">Every row was read cleanly.</p>';
    }
    var shown = list.slice(0, MAX_WARNINGS);
    var rest = list.length - shown.length;
    return '<div class="imp-warn"><b>' + list.length +
      (list.length === 1 ? " thing to check" : " things to check") + "</b><ul>" +
      shown.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") +
      (rest ? "<li>and " + rest + " more\u2026</li>" : "") +
      "</ul></div>";
  }

  function modeHtml(c, built) {
    var empty = PGStore.isEmpty() && !(PGStore.state().expenses || []).length;
    if (empty) {
      return '<p class="imp-note">This account is empty, so everything above will simply be added.</p>';
    }

    var thing = c.kind === "beds" ? "rooms and tenants" : "expenses";
    return '<div class="imp-mode">' +
      '<label><input type="radio" name="imp-mode" value="add"' +
      (c.mode === "add" ? " checked" : "") + " /><span><b>Add to what is here</b>" +
      "Keeps your current " + thing + " and fills in the rest.</span></label>" +
      '<label><input type="radio" name="imp-mode" value="replace"' +
      (c.mode === "replace" ? " checked" : "") + " /><span><b>Replace them</b>" +
      "Throws away the " + thing + " on this account first.</span></label>" +
      "</div>";
  }

  /* ---------- reading a chosen file ---------- */

  function readFile(file) {
    var name = String(file.name || "").toLowerCase();

    /* Smart routing: detect the file type and use the best extraction method. */

    /* Images → OCR */
    if (isImageFile(file)) {
      extractFromImage(file).then(function (text) {
        hideProgress();
        analyse(parseText(text), file.name);
      }).catch(function (err) {
        fail(err.message || "Could not read the image.");
      });
      return;
    }

    /* PDF → text extraction */
    if (isPDFFile(file)) {
      extractFromPDF(file).then(function (text) {
        hideProgress();
        analyse(parseText(text), file.name);
      }).catch(function (err) {
        fail(err.message || "Could not read the PDF.");
      });
      return;
    }

    /* JSON → convert to tab-separated text */
    if (isJSONFile(file)) {
      extractFromJSON(file).then(function (text) {
        hideProgress();
        analyse(parseText(text), file.name);
      }).catch(function (err) {
        fail(err.message || "Could not read the JSON file.");
      });
      return;
    }

    /* Excel (.xlsx, .xls) → SheetJS */
    var isExcel = /\.xlsx?$/.test(name);
    if (isExcel) {
      var reader = new FileReader();
      reader.onerror = function () { fail("That file could not be opened."); };
      reader.onload = function () {
        try {
          if (!global.XLSX) {
            fail("The Excel reader did not load, so .xlsx cannot be opened right now. " +
              "In Excel or Google Sheets use File \u2192 Download \u2192 CSV, or just copy the cells and paste them below.");
            return;
          }
          var wb = XLSX.read(new Uint8Array(reader.result), { type: "array", cellDates: true });
          var pick = bestSheet(wb);
          if (!pick) {
            fail("That workbook has no readable sheets.");
            return;
          }
          analyse(pick.rows, pick.name);
        } catch (err) {
          fail("That file could not be read as a spreadsheet. If it is an .xls from an old Excel, save it as .xlsx or CSV first.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    /* CSV, TSV, TXT → plain text parser */
    var reader2 = new FileReader();
    reader2.onerror = function () { fail("That file could not be opened."); };
    reader2.onload = function () {
      analyse(parseText(String(reader2.result)), file.name);
    };
    reader2.readAsText(file);
  }

  /* A workbook often has several tabs; take the one whose header we understand
     best rather than assuming the first. */
  function bestSheet(wb) {
    var best = null;
    wb.SheetNames.forEach(function (name) {
      // Blank rows are kept here only so withLines can number them, then dropped.
      var rows = withLines(XLSX.utils.sheet_to_json(wb.Sheets[name], {
        header: 1, raw: true, blankrows: true, defval: ""
      }));
      if (!rows.length) { return; }
      var score = findHeader(rows).hits;
      if (!best || score > best.score) { best = { name: name, rows: rows, score: score }; }
    });
    return best;
  }

  /* ---------- wiring ---------- */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) { return; }
    var act = btn.dataset.act;

    if (act === "import-data") {
      openImport();
      return;
    }

    if (act === "imp-read") {
      el("imp-err").hidden = true;
      var file = el("imp-file").files[0];
      var pasted = String(el("imp-paste").value || "").trim();

      if (file) { readFile(file); }
      else if (pasted) { analyse(parseText(pasted), ""); }
      else { fail("Choose a file, or paste the cells copied from your sheet."); }
      return;
    }

    if (act === "imp-back") {
      el("imp-step-check").hidden = true;
      el("imp-step-pick").hidden = false;
      return;
    }

    if (act === "imp-apply") {
      if (!current || !current.built || !current.built.used) { return; }

      var res = current.kind === "beds"
        ? importBeds(current.built.rooms, current.mode)
        : importExpenses(current.built.expenses, current.mode);

      closeImport();
      current = null;

      // Redraw and let the sheet backup pick the change up, falling back to a
      // reload if the dashboard script is not there for some reason.
      if (typeof commit === "function") { commit(); }
      else if (typeof renderAll === "function") { renderAll(); }
      else { location.reload(); }

      if (res && res.text) { location.hash = "dashboard"; }
    }
  });

  /* Column remapping and the add/replace choice both just redraw the review. */
  document.addEventListener("change", function (e) {
    var target = e.target;

    if (target.matches("[data-imp-field]")) {
      if (!current) { return; }
      var field = target.getAttribute("data-imp-field");
      var value = target.value;
      if (value === "") { delete current.map[field]; }
      else { current.map[field] = Number(value); }
      review();
      return;
    }

    if (target.name === "imp-mode" && current) {
      current.mode = target.value;
    }
  });

  /* Dropping a file straight onto the panel. */
  document.addEventListener("dragover", function (e) {
    var drop = e.target.closest && e.target.closest(".imp-drop");
    if (drop) { e.preventDefault(); drop.classList.add("is-over"); }
  });

  document.addEventListener("dragleave", function (e) {
    var drop = e.target.closest && e.target.closest(".imp-drop");
    if (drop) { drop.classList.remove("is-over"); }
  });

  document.addEventListener("drop", function (e) {
    var drop = e.target.closest && e.target.closest(".imp-drop");
    if (!drop) { return; }
    e.preventDefault();
    drop.classList.remove("is-over");
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) { el("imp-err").hidden = true; readFile(file); }
  });

  /* ---------- template downloads ---------- */

  function csvDownload(filename, rows) {
    var csv = "\uFEFF" + rows.map(function (r) {
      return r.map(function (c) {
        return '"' + String(c == null ? "" : c).replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\r\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    a.download = filename;
    a.click();
  }

  function downloadTemplate(kind) {
    if (kind === "rooms") {
      csvDownload("pg-rooms-template.csv", [
        ["Room", "Bed", "Tenant", "Phone", "Joined", "Rent", "Paid", "Note"],
        ["101", "A", "Sakshi Hari Ram", "9876543210", "2025-01-15", "5000", "Yes", ""],
        ["101", "B", "Amruta Patil", "9876543211", "2025-02-01", "5000", "Yes", ""],
        ["102", "A", "Priya Sharma", "9876543212", "2025-03-10", "5500", "No", "Notice period"],
        ["102", "B", "", "", "", "5500", "", "Vacant"],
        ["201", "A", "Neha Gupta", "9876543213", "2025-04-01", "6000", "Yes", "AC room"],
        ["201", "B", "Kajal Jain", "9876543214", "2025-05-15", "6000", "No", ""]
      ]);
    } else {
      csvDownload("pg-expenses-template.csv", [
        ["Date", "Category", "Amount", "Note"],
        ["2026-08-01", "Electricity", "8500", "August bill"],
        ["2026-08-05", "Internet", "1200", "Monthly fiber"],
        ["2026-08-10", "Staff salary", "6000", "Cleaning staff"],
        ["2026-08-15", "Maintenance", "2500", "Plumbing repair"],
        ["2026-08-20", "Water", "1500", "Tank cleaning"]
      ]);
    }
  }

  /* Wire up template download buttons */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-act]");
    if (!btn) { return; }
    if (btn.dataset.act === "imp-tpl-rooms") { downloadTemplate("rooms"); return; }
    if (btn.dataset.act === "imp-tpl-expenses") { downloadTemplate("expenses"); return; }
  });

  /* Exported for testing and for anything else that wants to reuse the parser.
     The html builders are here so the review panel can be rendered outside a
     browser and checked, rather than being eyeballed only in the real app. */
  global.PGImport = {
    open: openImport,
    summaryHtml: summaryHtml,
    mappingHtml: mappingHtml,
    previewHtml: previewHtml,
    warningsHtml: warningsHtml,
    modeHtml: modeHtml,
    parseText: parseText,
    findHeader: findHeader,
    detectKind: detectKind,
    buildBeds: buildBeds,
    buildExpenses: buildExpenses,
    summariseBeds: summariseBeds,
    summariseExpenses: summariseExpenses,
    toDate: toDate
  };
})(window);
