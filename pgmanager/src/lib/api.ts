import { NextResponse } from "next/server";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data as Record<string, unknown>, init);
}

export function bad(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function unauthorized() {
  return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((e: unknown) => {
    const message = e instanceof Error ? e.message : "Unexpected server error";
    const isPrismaKnown =
      typeof e === "object" && e !== null && "code" in e && typeof (e as { code: unknown }).code === "string";
    console.error("[api]", message);
    if (isPrismaKnown) {
      const code = (e as { code: string }).code;
      if (code === "P2002") return bad("A record with these details already exists", 409);
      if (code === "P2025") return bad("Record not found", 404);
    }
    return bad(message, 500);
  });
}
