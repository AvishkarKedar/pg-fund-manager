// PG Manager — Database Seed Script
// Run: npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts

import { PrismaClient, ExpenseCategory } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ─── Admin User ────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash("admin12345", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@pgmanager.com" },
    update: {},
    create: {
      email: "admin@pgmanager.com",
      name: "Admin",
      passwordHash: adminPassword,
      role: "ADMIN",
    },
  });
  console.log("  ✓ Admin user:", admin.email);

  // ─── Rooms ─────────────────────────────────────────────────────────
  const roomData = [
    { number: "101", floor: 1, beds: ["1", "2", "3"] },
    { number: "102", floor: 1, beds: ["1", "2", "3"] },
    { number: "201", floor: 2, beds: ["1", "2", "3", "4"] },
    { number: "202", floor: 2, beds: ["1", "2", "3", "4"] },
    { number: "301", floor: 3, beds: ["1", "2"] },
  ];

  const rooms: Record<string, any> = {};
  for (const rd of roomData) {
    const room = await prisma.room.upsert({
      where: { number: rd.number },
      update: { floor: rd.floor },
      create: {
        number: rd.number,
        floor: rd.floor,
        beds: { create: rd.beds.map((b) => ({ number: b })) },
      },
      include: { beds: true },
    });
    rooms[room.number] = room;
    console.log(`  ✓ Room ${room.number}: ${room.beds.length} beds`);
  }

  // ─── Tenants ───────────────────────────────────────────────────────
  const tenantData = [
    { name: "Sakshi Hari Ram", phone: "9876543210", room: "101", bed: "1", rent: 5000, joined: "2025-03-15" },
    { name: "Amruta Kulkarni", phone: "9876543211", room: "101", bed: "2", rent: 5000, joined: "2025-04-01" },
    { name: "Priya Sharma", phone: "9876543212", room: "101", bed: "3", rent: 5000, joined: "2025-05-10" },
    { name: "Neha Patil", phone: "9876543213", room: "102", bed: "1", rent: 5500, joined: "2025-02-20" },
    { name: "Rutuja Jadhav", phone: "9876543214", room: "102", bed: "2", rent: 5500, joined: "2025-06-01" },
    { name: "Sneha Deshmukh", phone: "9876543215", room: "201", bed: "1", rent: 6000, joined: "2025-01-10" },
    { name: "Kajal More", phone: "9876543216", room: "201", bed: "2", rent: 6000, joined: "2025-07-01" },
    { name: "Pooja Gaikwad", phone: "9876543217", room: "202", bed: "1", rent: 6000, joined: "2025-03-01" },
    { name: "Meghana Reddy", phone: "9876543218", room: "301", bed: "1", rent: 7000, joined: "2025-04-15" },
  ];

  const currentMonth = new Date().toISOString().slice(0, 7);

  for (const td of tenantData) {
    const tenant = await prisma.tenant.upsert({
      where: { id: `seed-${td.name.replace(/\s/g, "-").toLowerCase()}` },
      update: {},
      create: {
        id: `seed-${td.name.replace(/\s/g, "-").toLowerCase()}`,
        name: td.name,
        phone: td.phone,
        status: "ACTIVE",
      },
    });

    const room = rooms[td.room];
    const bed = room?.beds.find((b: any) => b.number === td.bed);
    if (!bed) continue;

    // Check for existing assignment
    const existing = await prisma.tenantAssignment.findFirst({
      where: { tenantId: tenant.id, isActive: true },
    });

    if (!existing) {
      const assignment = await prisma.tenantAssignment.create({
        data: {
          tenantId: tenant.id,
          bedId: bed.id,
          monthlyRent: td.rent,
          joiningDate: new Date(td.joined),
          dueDate: 5,
        },
      });

      // Create rent record for current month
      await prisma.rentRecord.upsert({
        where: { assignmentId_month: { assignmentId: assignment.id, month: currentMonth } },
        update: {},
        create: {
          assignmentId: assignment.id,
          tenantId: tenant.id,
          bedId: bed.id,
          month: currentMonth,
          rentDue: td.rent,
          status: "DUE",
        },
      });
    }

    // Create tenant aliases for matching
    const nameParts = td.name.split(" ");
    if (nameParts.length >= 2) {
      const shortAlias = nameParts[0] + " " + nameParts[nameParts.length - 1];
      await prisma.tenantAlias.upsert({
        where: { tenantId_alias: { tenantId: tenant.id, alias: shortAlias } },
        update: {},
        create: { tenantId: tenant.id, alias: shortAlias, source: "seed" },
      }).catch(() => {});
    }

    console.log(`  ✓ Tenant: ${td.name} → Room ${td.room} Bed ${td.bed}`);
  }

  // ─── Sample Expenses ───────────────────────────────────────────────
  const expenses = [
    { category: "ELECTRICITY", description: "August electricity bill", amount: 8500, vendor: "MSEDCL" },
    { category: "WATER", description: "Water tank refill", amount: 2000, vendor: "Local supplier" },
    { category: "INTERNET", description: "Monthly broadband", amount: 1200, vendor: "Jio Fiber" },
    { category: "CLEANING", description: "Housekeeping salary", amount: 6000, vendor: "Daily wage" },
    { category: "MAINTENANCE", description: "Plumbing repair - Room 201", amount: 800, vendor: "Local plumber" },
  ];

  for (const e of expenses) {
    const exists = await prisma.expense.findFirst({ where: { description: e.description } });
    if (!exists) {
      await prisma.expense.create({
        data: {
          ...e,
          category: e.category as ExpenseCategory,
          date: new Date(),
          amount: e.amount,
          createdBy: admin.id,
        },
      });
    }
  }
  console.log("  ✓ Sample expenses created");

  // ─── Settings ──────────────────────────────────────────────────────
  const defaultSettings: Record<string, string> = {
    hostel_name: "Sunshine PG",
    address: "123 Main Street, Pune, Maharashtra",
    contact_phone: "9876543200",
    rent_due_date: "5",
    currency: "INR",
    receipt_prefix: "RCP",
  };

  for (const [key, value] of Object.entries(defaultSettings)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  console.log("  ✓ Default settings created");

  console.log("\n✅ Seed complete!");
  console.log("   Login: admin@pgmanager.com / admin12345");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
