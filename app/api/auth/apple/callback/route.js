import { completeOAuthLogin } from "@/lib/oauth-login";

export const runtime = "nodejs";

export async function GET(request) {
  return completeOAuthLogin(request, "apple");
}

export async function POST(request) {
  return completeOAuthLogin(request, "apple");
}
