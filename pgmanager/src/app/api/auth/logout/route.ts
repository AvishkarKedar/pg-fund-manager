import { destroySession } from "@/lib/auth";
import { ok, handle } from "@/lib/api";

export async function POST() {
  return handle(async () => {
    await destroySession();
    return ok({ success: true });
  });
}
