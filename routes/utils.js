import fs from "node:fs";
import path from "node:path";

export function serveFile(res, filePath, contentType) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
  });
  const readStream = fs.createReadStream(filePath);
  readStream.pipe(res);
}