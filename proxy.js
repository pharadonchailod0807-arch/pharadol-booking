import { NextResponse } from "next/server";

const AUTH_SESSION_COOKIE = "booking_session";

const isPublicBrandRoute = (pathname) =>
  pathname === "/pharadol/welcome" ||
  pathname === "/adisorn/welcome";

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(AUTH_SESSION_COOKIE)?.value);

  if (hasSessionCookie || isPublicBrandRoute(pathname)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*", "/pharadol/:path*", "/adisorn/:path*"],
};
