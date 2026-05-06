import { prisma } from "@/lib/db";

interface RateLimitOptions {
  key: string;
  windowSec: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export async function rateLimit({ key, windowSec, max }: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSec * 1000);

  try {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "RateLimitHit" WHERE "hitAt" < $1`,
      new Date(now.getTime() - 24 * 60 * 60 * 1000),
    );

    const countRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "RateLimitHit" WHERE "key" = $1 AND "hitAt" > $2`,
      key, windowStart,
    );
    const count = Number(countRows[0]?.count ?? 0);

    if (count >= max) {
      const oldestRows = await prisma.$queryRawUnsafe<{ hitAt: Date }[]>(
        `SELECT "hitAt" FROM "RateLimitHit" WHERE "key" = $1 AND "hitAt" > $2 ORDER BY "hitAt" ASC LIMIT 1`,
        key, windowStart,
      );
      const oldest = oldestRows[0]?.hitAt ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest.getTime() + windowSec * 1000 - now.getTime()) / 1000));
      return { allowed: false, remaining: 0, retryAfterSec };
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO "RateLimitHit"("key", "hitAt") VALUES ($1, $2)`,
      key, now,
    );

    return { allowed: true, remaining: max - count - 1, retryAfterSec: 0 };
  } catch {
    return { allowed: true, remaining: 0, retryAfterSec: 0 };
  }
}
