import http from "node:http";
import { eventLoopP99Ms } from "./sharding.js";

export function startHealthServer(port: number, getLivesCount: () => number) {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          lives: getLivesCount(),
          eventLoopP99Ms: eventLoopP99Ms(),
        })
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.listen(port, () => {
    console.log(JSON.stringify({ level: "info", msg: `health server listening on :${port}` }));
  });

  return server;
}
