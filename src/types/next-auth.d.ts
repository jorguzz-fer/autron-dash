import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      role: string;
      tenantId: string;
      tenantSlug: string;
      mustChangePassword: boolean;
      mfaEnabled: boolean;
      mfaVerified: boolean;
    };
  }

  interface User {
    id: string;
    role: string;
    tenantId: string;
    tenantSlug: string;
    mustChangePassword: boolean;
    mfaEnabled: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    tenantId: string;
    tenantSlug: string;
    mustChangePassword: boolean;
    mfaEnabled: boolean;
    mfaVerified: boolean;
  }
}
