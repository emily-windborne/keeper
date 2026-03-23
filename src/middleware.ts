import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase-public-env";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // API routes: no HTML redirect — handlers validate session and return JSON.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Legacy auth URLs → new routes
  if (pathname === "/auth/sign-in") {
    const u = request.nextUrl.clone();
    u.pathname = "/auth/signin";
    return NextResponse.redirect(u);
  }
  if (pathname === "/auth/sign-up") {
    const u = request.nextUrl.clone();
    u.pathname = "/auth/signup";
    return NextResponse.redirect(u);
  }

  const env = getSupabasePublicEnv();
  const isAuthPath = pathname.startsWith("/auth");

  // Missing Supabase env: gate app routes (fail closed).
  if (!env) {
    if (!isAuthPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth/signin";
      redirectUrl.searchParams.set("next", pathname === "/" ? "/" : pathname);
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/signin";
    redirectUrl.searchParams.set("next", pathname === "/" ? "/" : pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  if (user && isAuthPath) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/";
    redirectUrl.search = "";
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((c) => {
      redirectResponse.cookies.set(c.name, c.value);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Run on all routes except Next internals and static assets.
     * Include "/" explicitly — some Next.js versions omit the root from the catch-all regex.
     */
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
