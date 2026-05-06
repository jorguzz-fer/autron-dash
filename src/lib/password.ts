const MIN_LENGTH = 10;

export interface PasswordCheck {
  ok: boolean;
  error?: string;
}

export function validatePassword(password: string): PasswordCheck {
  if (!password || typeof password !== "string") {
    return { ok: false, error: "Senha obrigatória" };
  }
  if (password.length < MIN_LENGTH) {
    return { ok: false, error: `Senha deve ter ao menos ${MIN_LENGTH} caracteres` };
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const classes = [hasLower, hasUpper, hasDigit, hasSymbol].filter(Boolean).length;

  if (classes < 3) {
    return { ok: false, error: "Senha deve combinar ao menos 3 de: maiúscula, minúscula, número, símbolo" };
  }
  const common = ["12345678", "123456789", "password", "senha123", "qwerty", "admin123", "autron"];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    return { ok: false, error: "Senha muito comum ou previsível" };
  }
  return { ok: true };
}
