import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/adminSession";

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return verifySessionToken(store.get(ADMIN_COOKIE)?.value);
}
