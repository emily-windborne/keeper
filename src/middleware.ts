import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase-public-env";

/**
 * Minimal auth gate: Supabase session from cookies only.
 * Never throw — any failure falls through with NextResponse.next() so refresh never becomes a 500.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") {
    return NextResponse.next();
  }

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

  const isAuthPath = pathname.startsWith("/auth");

  try {
    const env = getSupabasePublicEnv();

    if (!env) {
      if (!isAuthPath) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = "/auth/signin";
        redirectUrl.searchParams.set("next", pathname === "/" ? "/" : pathname);
        return NextResponse.redirect(redirectUrl);
      }
      return NextResponse.next();
    }

    let res = NextResponse.next({ request });

    const supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          } catch {
            // Request cookies may be immutable in some runtimes.
          }
          res = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            try {
              res.cookies.set(name, value, options);
            } catch {
              // Ignore single-cookie set failures.
            }
          });
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    const user = data?.user ?? null;

    if (!user && !isAuthPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/auth/signin";
      redirectUrl.searchParams.set("next", pathname === "/" ? "/" : pathname);
      const redirect = NextResponse.redirect(redirectUrl);
      try {
        res.cookies.getAll().forEach((c) => {
          redirect.cookies.set(c.name, c.value);
        });
      } catch {
        /* still redirect */
      }
      return redirect;
    }

    if (user && isAuthPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/";
      redirectUrl.search = "";
      const redirect = NextResponse.redirect(redirectUrl);
      try {
        res.cookies.getAll().forEach((c) => {
          redirect.cookies.set(c.name, c.value);
        });
      } catch {
        /* still redirect */
      }
      return redirect;
    }

    return res;
  } catch (err) {
    console.error("[middleware] non-fatal:", err);
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
