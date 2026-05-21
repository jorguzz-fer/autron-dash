/**
 * Store in-memory de JTIs (JWT IDs) já consumidos — impede replay attack.
 *
 * Estratégia:
 *   - Map<jti, expiresAt epoch ms>
 *   - Cada chamada `register(jti, exp)` recusa se já existe
 *   - GC roda a cada 60s removendo entradas expiradas
 *
 * O TTL do JWT do autron-dash é 5min. Se restart do container limpa o Map,
 * o pior caso é aceitar replay no espaço de até 5min — risco aceitável dado
 * que o JWT é HTTPS-only e single-use por design.
 */
export class JtiStore {
  private readonly seen = new Map<string, number>();

  constructor(gcIntervalMs = 60_000) {
    const timer = setInterval(() => this.gc(), gcIntervalMs);
    // Não bloqueia shutdown do processo.
    timer.unref?.();
  }

  /**
   * Tenta registrar um JTI. Retorna `true` se aceito (primeira vez),
   * `false` se já foi visto (replay).
   */
  register(jti: string, expiresAtMs: number): boolean {
    this.gc();
    if (this.seen.has(jti)) return false;
    this.seen.set(jti, expiresAtMs);
    return true;
  }

  private gc(): void {
    const now = Date.now();
    for (const [jti, exp] of this.seen) {
      if (exp <= now) this.seen.delete(jti);
    }
  }

  /** Util pra testes/debug. */
  size(): number {
    return this.seen.size;
  }
}
