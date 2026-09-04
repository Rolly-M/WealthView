import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isMfaRoute = pathname.startsWith("/mfa-challenge");
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/verify-email") ||
    isAuthRoute ||
    isMfaRoute;

  if (!isPublicRoute && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    // A password-only ("aal1") session on an account with TOTP enrolled
    // isn't fully authenticated yet — force it through /mfa-challenge
    // before it can reach anything else, regardless of what the client
    // thinks its auth state is.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const needsMfa = aal?.currentLevel === "aal1" && aal?.nextLevel === "aal2";

    if (needsMfa && !isMfaRoute) {
      return NextResponse.redirect(new URL("/mfa-challenge", request.url));
    }
    if (!needsMfa && (isAuthRoute || isMfaRoute)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
