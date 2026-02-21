import http from "node:http";

const PORT = Number(process.env.SFU_PORT ?? "8888");
const REGION = process.env.SFU_REGION ?? "tr";
const NODE_ID = process.env.SFU_NODE_ID ?? "local-sfu-1";

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, region: REGION, nodeId: NODE_ID }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(PORT, () => {
  console.log(`[sfu-stub] listening on http://localhost:${PORT} (region=${REGION} nodeId=${NODE_ID})`);
});
