import http from "node:http";

const port = Number(process.env.RAKAEZ_AI_PROXY_PORT || 3210);
const allowedOrigins = new Set([
  "https://figsandolives.github.io",
  "https://www.figsandolives.github.io"
]);
const model = "qwen3.5:9b";

function cors(request, response) {
  const origin = request.headers.origin;
  if (allowedOrigins.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, Bypass-Tunnel-Reminder");
}

function send(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

http.createServer(async (request, response) => {
  cors(request, response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/chat" || !allowedOrigins.has(request.headers.origin)) {
    send(response, 403, { error: "Forbidden" });
    return;
  }

  let body = "";
  request.on("data", chunk => {
    body += chunk;
    if (body.length > 65536) request.destroy();
  });
  request.on("end", async () => {
    try {
      const incoming = JSON.parse(body);
      if (!Array.isArray(incoming.messages) || incoming.messages.length > 8) throw new Error("Invalid translation request");
      const upstream = await fetch("http://127.0.0.1:11434/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          think: false,
          format: "json",
          options: { temperature: 0.05, num_predict: 1200 },
          messages: incoming.messages
        })
      });
      const payload = await upstream.json();
      send(response, upstream.ok ? 200 : 502, payload);
    } catch {
      send(response, 502, { error: "Translation service is unavailable" });
    }
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Rakaez AI translation proxy listening on ${port}`);
});
