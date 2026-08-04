import { NextResponse } from "next/server";
import {
  AUTH_SESSION_COOKIE,
  getActiveBrandForUser,
  getDefaultRedirectForUser,
  getPublicAdminUsers,
  verifySessionToken,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request) {
  const token = request.cookies.get(AUTH_SESSION_COOKIE)?.value || "";
  const user = verifySessionToken(token);

  if (!user) {
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    user,
    activeBrand: getActiveBrandForUser(user),
    redirectTo: getDefaultRedirectForUser(user),
    users: await getPublicAdminUsers(),
  });
}
