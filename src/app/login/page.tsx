import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";

export const metadata = {
  title: "Entrar — Autron Dash",
};

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-slate-950">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 mb-4">
            <span className="text-white text-2xl font-bold">A</span>
          </div>
          <h1 className="text-2xl font-semibold text-slate-100">Autron Dash</h1>
          <p className="text-sm text-slate-400 mt-1">Entre com suas credenciais</p>
        </div>
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <LoginForm />
        </div>
        <p className="text-center text-xs text-slate-500 mt-6">
          Ao entrar, você concorda com nossa{" "}
          <a href="/privacidade" className="text-blue-400 hover:underline">
            política de privacidade
          </a>
          .
        </p>
      </div>
    </main>
  );
}
