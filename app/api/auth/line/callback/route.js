import { completeOAuthLogin } from "@/lib/oauth-login";

export const runtime = "nodejs";

export async function GET(request) {
  return completeOAuthLogin(request, "line");
}
