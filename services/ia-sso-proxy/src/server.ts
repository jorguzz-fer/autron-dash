import { createServer } from "node:http";
import { loadEnv } from "./env.js";
import { JtiStore } from "./jti-store.js";
import { createProxy } from "./proxy.js";
import { handleSso } from "./sso.js";

const env = loadEnv();
const jtiStore = new JtiStore();
const { handleHttp, handleUpgrade } = createProxy(env);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  // Healthcheck público (não roteia pro Open WebUI)
  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, jtiSize: jtiStore.size() }));
    return;
  }

  // Handshake SSO — autron-dash redireciona pra cá com ?token=<jwt>
  if (url.pathname === "/sso") {
    handleSso(req, res, env, jtiStore).catch((err) => {
      console.error("[sso] erro inesperado:", err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal Server Error");
      }
    });
    return;
  }

  // Tudo mais → proxy reverso pro Open WebUI (com checagem de cookie)
  handleHttp(req, res);
});

// WebSocket upgrade (streaming de respostas LLM no Open WebUI)
server.on("upgrade", (req, socket, head) => {
  handleUpgrade(req, socket, head);
});

server.listen(env.port, () => {
  console.log(`[ia-sso-proxy] up on :${env.port}`);
  console.log(`  Open WebUI: ${env.openWebuiUrl}`);
  console.log(`  Issuer:     ${env.expectedIssuer}`);
  console.log(`  Session:    ${env.sessionTtlHours}h`);
});

// Graceful shutdown — útil pro Docker SIGTERM
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`[ia-sso-proxy] recebido ${sig}, fechando...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
