import * as http from "node:http";

function arg(name: string): string {
  return process.argv[process.argv.indexOf(name) + 1];
}

const dataDir = arg("--data");
const port = Number(arg("--port"));

http
  .createServer((req, res) => {
    const status = req.url === "/health" ? 200 : 501;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status === 200 ? {} : { error: "not_implemented", dataDir }));
  })
  .listen(port, "127.0.0.1");
