import http from "node:http";
import configHandler from "../routes/config.js";

const PORT = process.env.PORT ?? 3000;

const server = http.createServer((req, res) => {
  try {
    configHandler(req, res);
  } catch (e) {
    console.error("Web server error:", e);
    res.writeHead(500);
    res.end("Internal Server Error");
  }
});

server.listen(PORT, () => {
  console.log(`Config UI running on http://localhost:${PORT}`);
});