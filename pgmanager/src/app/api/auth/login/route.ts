import { db } from "@/lib/db";
import { verifyPassword, createSession, audit } from "@/lib/auth";
import { readJson, ok, bad, handle } from "@/lib/api";

export async function POST(req: Request) {
  return handle(async () => {
    const { email, password } = await readJson<{ email?: string; password?: string }>(req);
    const cleanEmail = String(email ?? "").trim().toLowerCase();
    if (!cleanEmail || !password) return bad("Email and password are required");

    const user = await db.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return bad("Invalid email or password", 401);
    }
    await createSession(user.id);
    await audit(user.id, "SYSTEM", "Auth", user.id, { message: "Signed in" });
    return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  });
}
