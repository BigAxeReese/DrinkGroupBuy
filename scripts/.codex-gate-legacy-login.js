"use strict";
const fs = require("node:fs");

function edit(path, searchLines, replacementLines) {
  const source = fs.readFileSync(path, "utf8");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const search = searchLines.join(newline);
  const replacement = replacementLines.join(newline);
  if (source.split(search).length !== 2) throw new Error(`${path}: unique marker missing`);
  fs.writeFileSync(path, source.replace(search, replacement));
}

edit("backend/server.js", [
  "    if (request.method === \"POST\" && url.pathname === \"/api/auth/login\") {",
  "      const body = await readJsonBody(request);",
], [
  "    if (request.method === \"POST\" && url.pathname === \"/api/auth/login\") {",
  "      if (!isDevAuthModeEnabled()) {",
  "        sendJson(response, 404, { error: \"Not found\" });",
  "        return;",
  "      }",
  "",
  "      const body = await readJsonBody(request);",
]);

edit("docs/api-candidates.md", [
  "| 舊版相容 route    | `POST /api/auth/login` 暫時保留為開發相容功能                                                           |",
], [
  "| 舊版相容 route    | `POST /api/auth/login` 暫時保留為開發相容功能；僅在非 production 且 `AUTH_DEV_MODE=true` 時存在          |",
]);
