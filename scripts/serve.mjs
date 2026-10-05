// 手元とスマホで試すための、小さな配信の道具(D-030)。外部の部品は使わない。
//
// 使い方:npm start(ポートを変えるときは PORT=9000 npm start)
// 同じ Wi-Fi のスマホから、表示された http://(PC の番号):8000/ を開く。

import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

/** URL の道筋を、配信してよいファイルの場所にする。リポジトリの外を指すときは null。 */
export function resolvePath(root, urlPath) {
  let path;
  try {
    path = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (path.endsWith("/")) path += "index.html";
  const full = normalize(join(root, path));
  if (full !== root && !full.startsWith(root + sep)) return null;
  // 隠しファイル(.git など)は配信しない。
  if (full.slice(root.length).split(sep).some((part) => part.startsWith("."))) return null;
  return full;
}

/** 同じ Wi-Fi の機器から見た、この PC の番号(IP アドレス)の一覧。 */
function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address);
}

function main() {
  const port = Number(process.env.PORT || 8000);
  const server = createServer((req, res) => {
    const file = resolvePath(ROOT, req.url || "/");
    let ok = false;
    try {
      ok = file !== null && statSync(file).isFile();
    } catch {
      ok = false;
    }
    if (!ok) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("見つかりません");
      return;
    }
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(file).pipe(res);
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`この PC で開く:http://localhost:${port}/`);
    for (const address of lanAddresses()) {
      console.log(`同じ Wi-Fi のスマホで開く:http://${address}:${port}/`);
    }
    console.log("止めるときは Ctrl+C を押します。");
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
