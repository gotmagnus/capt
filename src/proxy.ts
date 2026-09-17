import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "capt_session";

// Optimistic redirect only; every server action and page re-verifies the session.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;
  const protectedPath = pathname.startsWith("/app") || pathname.startsWith("/portal");
  if (protectedPath && !hasSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/app", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/portal/:path*", "/login", "/signup"],
};
