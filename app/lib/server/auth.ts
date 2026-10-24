import { auth, currentUser } from "@clerk/nextjs/server";
import { query } from "./db";

export type AppUser = { id: string; clerk_user_id: string; role: "buyer" | "admin" };

/** Returns the signed-in user's row (created on first call), or null. */
export async function requireUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const admins = (process.env.ADMIN_CLERK_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const existing = await query<AppUser>(
    "SELECT id, clerk_user_id, role FROM users WHERE clerk_user_id = $1",
    [userId],
  );
  const role = admins.includes(userId) ? "admin" : "buyer";
  if (existing[0]) {
    if (existing[0].role !== role) {
      await query("UPDATE users SET role = $2, updated_at = now() WHERE id = $1", [existing[0].id, role]);
    }
    return { ...existing[0], role };
  }
  const profile = await currentUser();
  const rows = await query<AppUser>(
    `INSERT INTO users (clerk_user_id, email, display_name, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (clerk_user_id) DO UPDATE SET updated_at = now()
     RETURNING id, clerk_user_id, role`,
    [
      userId,
      profile?.primaryEmailAddress?.emailAddress ?? "",
      [profile?.firstName, profile?.lastName].filter(Boolean).join(" "),
      role,
    ],
  );
  return rows[0];
}

export const unauthorized = () => Response.json({ error: "Sign in required." }, { status: 401 });
