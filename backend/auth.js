const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

loadLocalEnv(path.resolve(__dirname, "..", ".env"));
loadLocalEnv(path.resolve(__dirname, ".env"));

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

function verifyPassword(password, passwordHash) {
  if (!passwordHash || typeof password !== "string") return false;

  const [algorithm, salt, expectedHash] = passwordHash.split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHash) return false;

  const actual = crypto.scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

function createAuthToken(user) {
  const secret = getAuthSecret();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    roles: user.roles,
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const payloadText = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadText, secret);
  return `${payloadText}.${signature}`;
}

function verifyAuthToken(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return null;
  }

  const [payloadText, signature] = token.split(".");
  const expectedSignature = sign(payloadText, getAuthSecret());
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(payloadText));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.sub || !payload.exp || payload.exp <= now) {
    return null;
  }

  return payload;
}

function getBearerToken(request) {
  const header = request.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? token : null;
}

function getAuthSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SESSION_SECRET must be set in backend/.env with at least 16 characters");
  }
  return secret;
}

function sign(payloadText, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payloadText)
    .digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function loadLocalEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] != null) continue;

    process.env[key] = stripEnvQuotes(rawValue);
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

module.exports = {
  createAuthToken,
  getBearerToken,
  verifyAuthToken,
  verifyPassword
};
