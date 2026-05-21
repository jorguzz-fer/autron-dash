import httpProxy from "http-proxy";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { Env } from "./env.js";
import { decodeSession, readSessionCookie } from "./session.js";

/**
 * Headers que o cliente NÃO pode forçar — strip antes de enviar ao Open WebUI.
 * Espelha o padrão de `WEBUI_AUTH_TRUSTED_*_HEADER`: o trusted header tem que
 * vir de uma fonte interna (este proxy), nunca do request original do user.
 */
const FORBIDDEN_INBOUND_HEADERS = [
  "x-forwarded-email",
  "x-forwarded-name",
  "x-forwarded-user",
  "x-forwarded-preferred-username",
  "x-forwarded-groups",
  "x-real-ip",
  "x-real-user",
  "x-auth-request-email",
  "x-auth-request-user",
];

export function createProxy(env: Env): {
  handleHttp: (req: IncomingMessage, res: ServerResponse) => void;
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
} {
  const proxy = httpProxy.createProxyServer({
    target: env.openWebuiUrl,
    changeOrigin: true,
    ws: true,
    // Sem buffering — preserva streaming SSE/WebSocket pro Open WebUI.
    selfHandleResponse: false,
  });

  proxy.on("error", (err, _req, resOrSocket) => {
    console.error("[proxy] erro:", err.message);
    if (resOrSocket && "writeHead" in resOrSocket && !resOrSocket.headersSent) {
      resOrSocket.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
      resOrSocket.end("Bad Gateway — Open WebUI indisponível");
    } else if (resOrSocket && "destroy" in resOrSocket) {
      // Socket (caso WebSocket)
      resOrSocket.destroy();
    }
  });

  // Injeta os trusted headers ANTES do proxy enviar a request.
  // Como o `http-proxy` permite headers via options.headers, mas isso é
  // estático, usamos proxyReq event pra setar headers por request.
  proxy.on("proxyReq", (proxyReq, req) => {
    const session = decodeSessionFromReq(req, env);
    if (session) {
      proxyReq.setHeader("X-Forwarded-Email", session.email);
      proxyReq.setHeader("X-Forwarded-Name", session.name);
    }
  });

  proxy.on("proxyReqWs", (proxyReq, req) => {
    const session = decodeSessionFromReq(req, env);
    if (session) {
      proxyReq.setHeader("X-Forwarded-Email", session.email);
      proxyReq.setHeader("X-Forwarded-Name", session.name);
    }
  });

  function handleHttp(req: IncomingMessage, res: ServerResponse): void {
    sanitizeInboundHeaders(req);
    const session = decodeSessionFromReq(req, env);
    if (!session) {
      res.writeHead(401, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<html><body style="font-family:system-ui;padding:40px;max-width:520px;margin:auto">
          <h2>Sessão necessária</h2>
          <p>Acesse o Chat IA pelo painel do autron-dash em
            <a href="https://autron-dash.tudomudou.com.br">autron-dash.tudomudou.com.br</a>.</p>
        </body></html>`,
      );
      return;
    }
    proxy.web(req, res);
  }

  function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    sanitizeInboundHeaders(req);
    const session = decodeSessionFromReq(req, env);
    if (!session) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    // http-proxy aceita Duplex em runtime; cast pra suprimir tipo legado.
    proxy.ws(req, socket as never, head);
  }

  return { handleHttp, handleUpgrade };
}

function sanitizeInboundHeaders(req: IncomingMessage): void {
  for (const h of FORBIDDEN_INBOUND_HEADERS) {
    delete req.headers[h];
  }
}

function decodeSessionFromReq(req: IncomingMessage, env: Env) {
  const cookie = readSessionCookie(req.headers["cookie"]);
  return decodeSession(cookie, env.ssoSecret);
}
