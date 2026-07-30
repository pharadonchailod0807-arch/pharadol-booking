import { NextResponse } from "next/server";
import { getReadyLoginProviders } from "@/lib/oauth-login";

export const runtime = "nodejs";

export async function GET(request) {
  const requestUrl = new URL(request.url);

  return NextResponse.json({
    success: true,
    providers: await getReadyLoginProviders(requestUrl),
  });
}
