import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/login",
  "/api/auth",
  "/privacidade",
  "/termos",
];

export default auth(function middleware(req) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (req.auth && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const user = req.auth?.user;
  if (user) {
    const isAuthApi = pathname.startsWith("/api/auth");

    // 1. Troca de senha obrigatória (sempre antes do MFA).
    if (user.mustChangePassword && !pathname.startsWith("/mudar-senha") && !isAuthApi) {
      return NextResponse.redirect(new URL("/mudar-senha", req.url));
    }

    // Passos de MFA só valem depois de a senha estar resolvida.
    if (!user.mustChangePassword && !isAuthApi) {
      // 2. MFA obrigatório para todos: enquanto não configurado, força o setup.
      if (!user.mfaEnabled && !pathname.startsWith("/mfa/configurar")) {
        return NextResponse.redirect(new URL("/mfa/configurar", req.url));
      }
      // 3. MFA configurado mas ainda não verificado nesta sessão → pede o código.
      if (user.mfaEnabled && !user.mfaVerified && !pathname.startsWith("/mfa/verificar")) {
        return NextResponse.redirect(new URL("/mfa/verificar", req.url));
      }
      // 4. Já passou pelo MFA → não deve voltar às telas de MFA.
      if (
        user.mfaEnabled &&
        user.mfaVerified &&
        (pathname.startsWith("/mfa/configurar") || pathname.startsWith("/mfa/verificar"))
      ) {
        return NextResponse.redirect(new URL("/dashboard", req.url));
      }
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo|images|icons|public).*)"],
};
