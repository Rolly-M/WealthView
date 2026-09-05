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
  const isMfaChallengeRoute = pathname.startsWith("/mfa-challenge");
  const isMfaSetupRoute = pathname.startsWith("/mfa-setup");
  const isPublicRoute =
    pathname === "/" ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/forgot-password") ||
    // Not folded into isAuthRoute deliberately — Supabase's password-reset
    // link signs the browser into a real ("recovery") session before it
    // ever reaches this page, so treating it as an auth route would bounce
    // an already-authenticated visitor straight to /dashboard before they
    // could ever see the reset form.
    pathname.startsWith("/reset-password") ||
    isAuthRoute ||
    isMfaChallengeRoute ||
    isMfaSetupRoute;

  if (!isPublicRoute && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    // A password-only ("aal1") session on an account with a verified TOTP
    // factor isn't fully authenticated yet — force it through
    // /mfa-challenge before it can reach anything else, regardless of what
    // the client thinks its auth state is.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const hasVerifiedFactor = aal?.nextLevel === "aal2";
    const needsStepUp = aal?.currentLevel === "aal1" && hasVerifiedFactor;

    // No factor at all yet, on an account created after MFA became
    // mandatory (password registration / invite-accept) — force enrollment
    // via /mfa-setup. Re-triggers automatically if a required account later
    // removes its only factor, which is intentional: a mandatory control
    // shouldn't be permanently disable-able by the user it applies to.
    let needsSetup = false;
    if (!needsStepUp && !hasVerifiedFactor) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("mfa_required")
        .eq("id", user.id)
        .single();
      needsSetup = !!profile?.mfa_required;
    }

    if (needsStepUp) {
      if (!isMfaChallengeRoute) return NextResponse.redirect(new URL("/mfa-challenge", request.url));
    } else if (needsSetup) {
      if (!isMfaSetupRoute) return NextResponse.redirect(new URL("/mfa-setup", request.url));
    } else if (isAuthRoute || isMfaChallengeRoute || isMfaSetupRoute) {
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
