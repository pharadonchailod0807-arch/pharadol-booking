import { startOAuthLogin } from "@/lib/oauth-login";

export const runtime = "nodejs";

export async function GET(request) {
  return startOAuthLogin(request, "apple");
}
