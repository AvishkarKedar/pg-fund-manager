/* Seed: realistic demo data for PG Fund Manager. Run: bun prisma/seed.ts */
import { PrismaClient } from "@prisma/client";
import { Decimal } from "decimal.js";
import { randomBytes, scryptSync } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function ym(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function addMonths(period: string, delta: number) {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return ym(d);
}
function monthDate(period: string, day: number) {
  const [y, m] = period.split("-").map(Number);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(day, dim)));
}
function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}
function phone(i: number) {
  const prefixes = ["98", "97", "96", "95", "94", "89", "88", "87", "81", "80"];
  const p = pick(prefixes, i);
  const rest = String(10000000 + ((i * 7919) % 89999999)).slice(0, 8);
  return `+91 ${p}${rest.slice(0, 4)} ${rest.slice(4)}`;
}

const TENANTS: Array<{
  name: string; workplace?: string; rent: number; dueDay: number;
  startMonthsAgo: number; profile: "PAID" | "DUE" | "PARTIAL" | "LEAVING" | "CHECKED_OUT" | "LATE";
}> = [
  { name: "Aarav Kulkarni", workplace: "Infosys", rent: 6500, dueDay: 5, startMonthsAgo: 11, profile: "PAID" },
  { name: "Rohit Deshmukh", workplace: "TCS", rent: 6500, dueDay: 5, startMonthsAgo: 9, profile: "PAID" },
  { name: "Sneha Patil", workplace: "Wipro", rent: 6500, dueDay: 5, startMonthsAgo: 14, profile: "DUE" },
  { name: "Kunal Shah", workplace: "Persistent", rent: 6500, dueDay: 5, startMonthsAgo: 4, profile: "PAID" },
  { name: "Aditya Joshi", workplace: "Cognizant", rent: 6000, dueDay: 5, startMonthsAgo: 8, profile: "PAID" },
  { name: "Shreya Kulkarni", workplace: "Tech Mahindra", rent: 6000, dueDay: 5, startMonthsAgo: 6, profile: "PAID" },
  { name: "Nikhil Rane", workplace: "Zoho", rent: 6000, dueDay: 5, startMonthsAgo: 3, profile: "LATE" },
  { name: "Priya More", workplace: "Siemens", rent: 6000, dueDay: 5, startMonthsAgo: 10, profile: "PAID" },
  { name: "Vikram Singh", workplace: "Amazon", rent: 7500, dueDay: 1, startMonthsAgo: 13, profile: "PAID" },
  { name: "Meera Nair", workplace: "Accenture", rent: 7500, dueDay: 1, startMonthsAgo: 7, profile: "PARTIAL" },
  { name: "Sahil Verma", workplace: "Capgemini", rent: 6000, dueDay: 5, startMonthsAgo: 12, profile: "PAID" },
  { name: "Ananya Iyer", workplace: "Barclays", rent: 6000, dueDay: 5, startMonthsAgo: 5, profile: "PAID" },
  { name: "Harsh Gupta", workplace: "Amdocs", rent: 6250, dueDay: 5, startMonthsAgo: 16, profile: "PAID" },
  { name: "Ishaan Mehta", workplace: "Mindtree", rent: 6250, dueDay: 5, startMonthsAgo: 2, profile: "DUE" },
  { name: "Tanvi Kulkarni", workplace: "IBM", rent: 6250, dueDay: 5, startMonthsAgo: 9, profile: "LEAVING" },
  { name: "Rahul Pawar", workplace: "SAP Labs", rent: 7000, dueDay: 5, startMonthsAgo: 6, profile: "PAID" },
  { name: "Sanika Jadhav", workplace: "Credit Suisse", rent: 7000, dueDay: 5, startMonthsAgo: 8, profile: "PAID" },
  { name: "Omkar Thakur", workplace: "Mastercard", rent: 8000, dueDay: 5, startMonthsAgo: 5, profile: "PAID" },
  { name: "Diya Kapoor", workplace: "Faurecia", rent: 8000, dueDay: 5, startMonthsAgo: 10, profile: "PAID" },
  { name: "Manish Agarwal", workplace: "Bosch", rent: 6500, dueDay: 5, startMonthsAgo: 15, profile: "CHECKED_OUT" },
];

const ROOMS = [
  { number: "101", floor: 1, beds: 4, rent: 6500, type: "SHARED" },
  { number: "102", floor: 1, beds: 3, rent: 6000, type: "SHARED" },
  { number: "103", floor: 1, beds: 2, rent: 7500, type: "PRIVATE" },
  { number: "201", floor: 2, beds: 4, rent: 6000, type: "SHARED" },
  { number: "202", floor: 2, beds: 4, rent: 6250, type: "SHARED" },
  { number: "203", floor: 2, beds: 3, rent: 7000, type: "SHARED" },
  { number: "301", floor: 3, beds: 2, rent: 8000, type: "PRIVATE" },
];

async function main() {
  console.log("Seeding PG Fund Manager demo data…");

  // wipe (respect FK order)
  await db.session.deleteMany();
  await db.auditLog.deleteMany();
  await db.payment.deleteMany();
  await db.rentInvoice.deleteMany();
  await db.tenancy.deleteMany();
  await db.tenant.deleteMany();
  await db.complaint.deleteMany();
  await db.expense.deleteMany();
  await db.bed.deleteMany();
  await db.room.deleteMany();
  await db.setting.deleteMany();
  await db.user.deleteMany();

  const owner = await db.user.create({
    data: {
      email: "owner@pgdemo.in",
      name: "Rahul Sharma",
      passwordHash: hashPassword("owner123"),
      role: "OWNER",
    },
  });
  console.log("  owner: owner@pgdemo.in / owner123");

  await db.setting.createMany({
    data: [
      {
        key: "property",
        value: JSON.stringify({
          name: "Sunrise PG",
          address: "Plot 24, Hinjewadi Phase 2, Pune 411057",
          ownerName: "Rahul Sharma",
          phone: "+91 98765 43210",
          upiId: "sunrisepg@okhdfcbank",
        }),
      },
      {
        key: "preferences",
        value: JSON.stringify({ defaultDueDay: 5, graceDays: 5, bedLabels: "LETTERS" }),
      },
      {
        key: "rateCard",
        value: JSON.stringify([
          { id: "r1", label: "Shared 3-meal", amount: 6500, note: "Bed + breakfast/lunch/dinner" },
          { id: "r2", label: "Shared no-meal", amount: 5000, note: "Bed only, common kitchen" },
          { id: "r3", label: "Private double", amount: 7500, note: "2-bed private, meals extra" },
          { id: "r4", label: "Premium AC", amount: 8000, note: "AC room, attached bath" },
        ]),
      },
      {
        key: "rules",
        value: JSON.stringify({
          visiting: "10:00 – 19:00, lobby only",
          quiet: "23:00 – 06:00",
          guests: "Not allowed in rooms",
          lockout: "Gate closes 23:30",
          other: "No smoking; damage charged at cost",
        }),
      },
    ],
  });

  // rooms + beds (A, B, C, D)
  const bedsByRoom: Record<string, { id: string; slot: number; label: string }[]> = {};
  for (const r of ROOMS) {
    const room = await db.room.create({
      data: {
        number: r.number,
        floor: r.floor,
        roomType: r.type,
        defaultRent: new Decimal(r.rent),
        notes: null,
      },
    });
    const beds: { id: string; slot: number; label: string }[] = [];
    for (let i = 1; i <= r.beds; i++) {
      const bed = await db.bed.create({
        data: { roomId: room.id, slot: i, label: String.fromCharCode(64 + i) },
      });
      beds.push({ id: bed.id, slot: bed.slot, label: bed.label });
    }
    bedsByRoom[r.number] = beds;
  }

  // flatten beds in occupancy order: room order then slot
  const bedQueue: { bedId: string; roomNumber: string; bedLabel: string }[] = [];
  for (const r of ROOMS) {
    for (const b of bedsByRoom[r.number]) {
      bedQueue.push({ bedId: b.id, roomNumber: r.number, bedLabel: b.label });
    }
  }
  // leave a couple of beds vacant: indices 10 and 21 (0-based)
  const vacantIdx = new Set([10, 21]);

  const today = new Date();
  const curYm = ym(today);
  const curDay = today.getUTCDate();
  const months6 = Array.from({ length: 6 }, (_, i) => addMonths(curYm, -(5 - i)));

  const receiptCounters: Record<string, number> = {};
  function nextReceipt(date: Date) {
    const prefix = `RCP-${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}-`;
    receiptCounters[prefix] = (receiptCounters[prefix] ?? 0) + 1;
    return `${prefix}${String(receiptCounters[prefix]).padStart(4, "0")}`;
  }

  const methods = ["UPI", "UPI", "UPI", "CASH", "BANK"];
  let bedIdx = 0;

  for (let i = 0; i < TENANTS.length; i++) {
    const t = TENANTS[i];
    let bedInfo = bedQueue[bedIdx];
    while (vacantIdx.has(bedIdx)) {
      bedIdx++;
      bedInfo = bedQueue[bedIdx];
    }

    const isCheckout = t.profile === "CHECKED_OUT";
    const startMonth = addMonths(curYm, -t.startMonthsAgo);
    const startDate = monthDate(startMonth, 1 + ((i * 5) % 20));
    const endDate = isCheckout ? monthDate(addMonths(curYm, -2), 12) : null;

    const tenant = await db.tenant.create({
      data: {
        name: t.name,
        phone: phone(i),
        email: `${t.name.split(" ")[0].toLowerCase()}${i}@gmail.com`,
        idType: i % 3 === 0 ? "AADHAAR" : i % 3 === 1 ? "PAN" : "DL",
        idNumber: `${1000 + i * 137}${4321 + i}`,
        emergencyContact: phone(i + 50),
        workplace: t.workplace,
        status: isCheckout ? "CHECKED_OUT" : t.profile === "LEAVING" ? "NOTICE" : "ACTIVE",
        notes: t.profile === "LEAVING" ? "Relocating to Bangalore next month" : null,
      },
    });

    const tenancy = await db.tenancy.create({
      data: {
        tenantId: tenant.id,
        bedId: bedInfo.bedId,
        startDate,
        endDate,
        noticeDate: t.profile === "LEAVING" ? monthDate(addMonths(curYm, -1), 20) : null,
        monthlyRent: new Decimal(t.rent),
        securityDeposit: new Decimal(t.rent),
        dueDay: t.dueDay,
        isActive: !isCheckout,
      },
    });

    // invoices + payments
    const periods = months6.filter(
      (p) => p >= startMonth && (!endDate || p <= ym(endDate))
    );
    for (const period of periods) {
      const isCurrent = period === curYm;
      const isLast = endDate ? period === ym(endDate) : isCurrent;
      let paidAmt = 0;
      if (isCheckout) {
        paidAmt = t.rent; // clean history
      } else if (isCurrent) {
        if (t.profile === "PAID" || t.profile === "LEAVING") paidAmt = t.rent;
        else if (t.profile === "PARTIAL") paidAmt = Math.round(t.rent / 2);
        else paidAmt = 0; // DUE / LATE
      } else {
        paidAmt = t.rent;
      }
      // LATE profile: missed last month too (arrears), then paid
      if (t.profile === "LATE" && period === addMonths(curYm, -1)) paidAmt = 0;

      const invoice = await db.rentInvoice.create({
        data: {
          tenancyId: tenancy.id,
          period,
          dueAmount: new Decimal(t.rent),
          paidAmount: new Decimal(paidAmt),
          dueDate: monthDate(period, t.dueDay),
          status: "DUE",
        },
      });

      if (paidAmt > 0) {
        const payDay = 2 + ((i * 3 + period.length) % 6);
        const payDate = monthDate(period, Math.min(payDay, 28));
        await db.payment.create({
          data: {
            tenantId: tenant.id,
            rentInvoiceId: invoice.id,
            amount: new Decimal(paidAmt),
            date: payDate,
            method: pick(methods, i + Number(period.slice(5))),
            reference: `UTR${429000000 + i * 977 + Number(period.slice(2, 4)) * 31}`,
            receiptNumber: nextReceipt(payDate),
            recordedById: owner.id,
          },
        });
      }
    }
    bedIdx++;
  }

  // recompute all invoice statuses with the engine (single source of truth)
  const invoices = await db.rentInvoice.findMany({ select: { id: true } });
  for (const inv of invoices) {
    const full = await db.rentInvoice.findUnique({
      where: { id: inv.id },
      include: {
        tenancy: { select: { dueDay: true } },
        payments: { where: { reversedAt: null }, orderBy: { date: "asc" } },
      },
    });
    if (!full) continue;
    const paid = full.payments.reduce((s, p) => s + p.amount.toNumber(), 0);
    const due = full.dueAmount.toNumber();
    const last = full.payments[full.payments.length - 1];
    let status = "DUE";
    if (paid >= due && due > 0) status = "PAID";
    else if (paid > 0) status = "PARTIAL";
    else {
      // unpaid: OVERDUE once past due day + grace
      const [y, m] = full.period.split("-").map(Number);
      const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const graceEnd = new Date(Date.UTC(y, m - 1, Math.min(full.tenancy.dueDay, dim) + 5));
      status = today.getTime() > graceEnd.getTime() ? "OVERDUE" : "DUE";
    }
    await db.rentInvoice.update({
      where: { id: full.id },
      data: {
        status,
        paidOn: status === "PAID" ? (last?.date ?? null) : null,
        method: last?.method ?? null,
        reference: last?.reference ?? null,
      },
    });
  }

  // expenses: last 3 months
  const expensePlan: Array<[string, string, number, string | null]> = [
    ["FOOD", "Groceries — Reliance Fresh", 18500, "Reliance Fresh"],
    ["ELECTRICITY", "Electricity bill", 9200, "MSEDCL"],
    ["WATER", "Water tanker", 2400, "Sharma Water Supply"],
    ["INTERNET", "100 Mbps fiber", 1899, "ACT Fibernet"],
    ["SALARY", "Warden + cook salaries", 22000, null],
    ["CLEANING", "Housekeeping supplies", 1200, null],
    ["MAINTENANCE", "Geyser repair (202)", 1850, "Rohit Electricals"],
    ["REPAIR", "Plumbing — 2nd floor washroom", 950, null],
  ];
  for (let mi = 0; mi < 6; mi++) {
    const period = addMonths(curYm, -mi);
    for (let ei = 0; ei < expensePlan.length; ei++) {
      const [category, notes, base, vendor] = expensePlan[ei];
      const jitter = 1 + ((mi * 7 + ei * 13) % 10) / 100;
      await db.expense.create({
        data: {
          date: monthDate(period, 3 + ei * 3),
          category,
          amount: new Decimal(Math.round(base * jitter)),
          vendor,
          notes: mi === 0 ? notes : `${notes} (${period})`,
        },
      });
    }
  }

  // complaints
  const complaints: Array<[string, string, string, string, number | null]> = [
    ["Geyser not heating in 202", "ELECTRICAL", "HIGH", "OPEN", null],
    ["WiFi keeps dropping at night", "INTERNET", "MEDIUM", "OPEN", null],
    ["Kitchen tap leaking", "PLUMBING", "MEDIUM", "IN_PROGRESS", null],
    ["Room 101 fan making noise", "FURNITURE", "LOW", "RESOLVED", 450],
    ["Corridor lights fused", "ELECTRICAL", "LOW", "RESOLVED", 240],
    ["Housekeeping missed 3rd floor", "CLEANLINESS", "MEDIUM", "OPEN", null],
  ];
  const roomIds = await db.room.findMany();
  for (let i = 0; i < complaints.length; i++) {
    const [title, category, priority, status, cost] = complaints[i];
    const room = roomIds.find((r) => r.number === ["202", "203", "102", "101", "301", "0"][i]) ?? null;
    await db.complaint.create({
      data: {
        title,
        category,
        priority,
        status,
        cost: cost === null ? null : new Decimal(cost),
        roomId: room?.id ?? null,
        roomLabel: room?.number ?? null,
        date: monthDate(addMonths(curYm, 0), Math.max(1, curDay - (i * 3 + 2))),
        resolvedAt: status === "RESOLVED" ? monthDate(addMonths(curYm, 0), Math.max(2, curDay - i)) : null,
        notes: status === "RESOLVED" ? "Fixed and verified by warden" : null,
      },
    });
  }

  await db.auditLog.createMany({
    data: [
      { userId: owner.id, action: "SYSTEM", entity: "System", details: JSON.stringify({ message: "Demo data seeded" }) },
      { userId: owner.id, action: "CREATED", entity: "Room", details: JSON.stringify({ count: ROOMS.length }) },
      { userId: owner.id, action: "CREATED", entity: "Tenant", details: JSON.stringify({ count: TENANTS.length }) },
    ],
  });

  const counts = {
    rooms: await db.room.count(),
    beds: await db.bed.count(),
    tenants: await db.tenant.count(),
    invoices: await db.rentInvoice.count(),
    payments: await db.payment.count(),
    expenses: await db.expense.count(),
    complaints: await db.complaint.count(),
  };
  console.log("  seeded:", counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
