const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const scanRoots = ["backend", "database", "scripts"];
const ignoredDirectories = new Set(["node_modules", ".git", "database/backups"]);

const reviewedDynamicSql = [
  {
    file: "backend/db.js",
    method: "prepare",
    expression: "baseQuery",
    reason: "Static internal query fragment in findRefundablePaymentCapture."
  },
  {
    file: "backend/database/sqliteAdapter.js",
    method: "prepare",
    expression: "sql",
    reason: "Reviewed runtime adapter boundary; callers must pass static SQL and bound parameters."
  },
  {
    file: "scripts/settlement-smoke.js",
    method: "prepare",
    expression: "placeholders",
    reason: "Smoke test generates only ?, ?, ? placeholders and binds values separately."
  }
];

const reviewedExecSources = [
  { file: "database/init-dev-db.js", expression: "schema" },
  { file: "database/seed-dev-db.js", expression: "seed" },
  { file: "database/test/init-test-db.js", expressionPrefix: "fs.readFileSync(" },
  { file: "scripts/settlement-smoke.js", expression: "schema" },
  { file: "scripts/refund-request-smoke.js", expression: "schema" },
  { file: "scripts/ecpay-smoke.js", expression: "schema" },
  { file: "scripts/pickup-expiration-smoke.js", expression: "schema" },
  { file: "scripts/pickup-credential-smoke.js", expression: "schema" },
  { file: "scripts/menu-order-smoke.js", expression: "schema" },
  { file: "scripts/menu-order-smoke.js", expression: "seed" },
  { file: "scripts/group-buy-discount-smoke.js", expression: "schema" },
  { file: "scripts/group-buy-discount-smoke.js", expression: "seed" },
  { file: "scripts/order-flow-smoke.js", expression: "schema" },
  { file: "scripts/order-flow-smoke.js", expression: "seed" }
];

const findings = [];

for (const file of listJavaScriptFiles()) {
  const relativeFile = toPosix(path.relative(repoRoot, file));
  const source = fs.readFileSync(file, "utf8");
  inspectSqlCalls(relativeFile, source);
}

if (findings.length > 0) {
  console.error("SQL safety check failed.");
  console.error("Avoid dynamic SQL interpolation/string concatenation. Use ? placeholders and bound parameters.");
  console.error("");
  for (const finding of findings) {
    console.error(`${finding.file}:${finding.line}: ${finding.message}`);
    if (finding.snippet) console.error(`  ${finding.snippet}`);
  }
  process.exit(1);
}

console.log("SQL safety check passed.");

function listJavaScriptFiles() {
  const files = [];

  for (const root of scanRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    walk(absoluteRoot, files);
  }

  return files;
}

function walk(directory, files) {
  const relativeDirectory = toPosix(path.relative(repoRoot, directory));
  if (ignoredDirectories.has(relativeDirectory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const relativePath = toPosix(path.relative(repoRoot, fullPath));

    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(relativePath)) walk(fullPath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(fullPath);
    }
  }
}

function inspectSqlCalls(file, source) {
  const callPattern = /\b(?:database|db)\.(prepare|exec)\s*\(/g;
  let match;

  while ((match = callPattern.exec(source)) !== null) {
    const method = match[1];
    const openParenIndex = source.indexOf("(", match.index);
    const call = readCallExpression(source, openParenIndex);
    if (!call) continue;

    const argument = call.argument.trim();
    const line = countLines(source, openParenIndex);
    inspectSqlArgument({ file, method, line, argument });
    callPattern.lastIndex = call.endIndex;
  }
}

function inspectSqlArgument({ file, method, line, argument }) {
  if (!argument) return;

  if (method === "exec" && isReviewedExecSource(file, argument)) {
    return;
  }

  if (argument.startsWith("`")) {
    const expressions = extractTemplateExpressions(argument);
    for (const expression of expressions) {
      const normalized = expression.trim();
      if (!isReviewedDynamicSql(file, method, normalized)) {
        findings.push({
          file,
          line,
          message: `Unreviewed SQL template interpolation: \${${normalized}}`,
          snippet: compact(argument)
        });
      }
    }
    return;
  }

  if (hasTopLevelStringConcatenation(argument)) {
    findings.push({
      file,
      line,
      message: "SQL call uses string concatenation.",
      snippet: compact(argument)
    });
    return;
  }

  if (method === "prepare" && !startsWithStringLiteral(argument) && !isReviewedDynamicSql(file, method, argument)) {
    findings.push({
      file,
      line,
      message: "SQL prepare uses a non-literal query source.",
      snippet: compact(argument)
    });
  }

  if (method === "exec" && !startsWithStringLiteral(argument)) {
    findings.push({
      file,
      line,
      message: "SQL exec uses an unreviewed non-literal query source.",
      snippet: compact(argument)
    });
  }
}

function isReviewedDynamicSql(file, method, expression) {
  return reviewedDynamicSql.some((entry) => (
    entry.file === file
      && entry.method === method
      && entry.expression === expression
  ));
}

function isReviewedExecSource(file, argument) {
  return reviewedExecSources.some((entry) => {
    if (entry.file !== file) return false;
    if (entry.expression && argument === entry.expression) return true;
    return Boolean(entry.expressionPrefix && argument.startsWith(entry.expressionPrefix));
  });
}

function readCallExpression(source, openParenIndex) {
  let depth = 0;
  let startIndex = openParenIndex + 1;
  let firstArgumentEnd = -1;
  let state = "code";
  let templateDepth = 0;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    const previous = source[index - 1];

    if (state === "lineComment") {
      if (char === "\n") state = "code";
      continue;
    }

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "code";
      }
      continue;
    }

    if (state === "singleQuote") {
      if (char === "'" && previous !== "\\") state = "code";
      continue;
    }

    if (state === "doubleQuote") {
      if (char === "\"" && previous !== "\\") state = "code";
      continue;
    }

    if (state === "template") {
      if (char === "`" && previous !== "\\" && templateDepth === 0) {
        state = "code";
        continue;
      }
      if (char === "$" && next === "{") {
        templateDepth += 1;
        index += 1;
        continue;
      }
      if (char === "}" && templateDepth > 0) {
        templateDepth -= 1;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      state = "lineComment";
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "blockComment";
      index += 1;
      continue;
    }

    if (char === "'") {
      state = "singleQuote";
      continue;
    }

    if (char === "\"") {
      state = "doubleQuote";
      continue;
    }

    if (char === "`") {
      state = "template";
      templateDepth = 0;
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0 && char === ")") {
        if (firstArgumentEnd < 0) firstArgumentEnd = index;
        return {
          argument: source.slice(startIndex, firstArgumentEnd),
          endIndex: index + 1
        };
      }
      continue;
    }

    if (char === "," && depth === 1 && firstArgumentEnd < 0) {
      firstArgumentEnd = index;
    }
  }

  return null;
}

function extractTemplateExpressions(templateSource) {
  const expressions = [];
  let state = "template";
  let expressionStart = -1;
  let expressionDepth = 0;

  for (let index = 1; index < templateSource.length; index += 1) {
    const char = templateSource[index];
    const next = templateSource[index + 1];
    const previous = templateSource[index - 1];

    if (state === "template") {
      if (char === "$" && next === "{") {
        state = "expression";
        expressionDepth = 1;
        expressionStart = index + 2;
        index += 1;
      }
      continue;
    }

    if (state === "singleQuote") {
      if (char === "'" && previous !== "\\") state = "expression";
      continue;
    }

    if (state === "doubleQuote") {
      if (char === "\"" && previous !== "\\") state = "expression";
      continue;
    }

    if (state === "nestedTemplate") {
      if (char === "`" && previous !== "\\") state = "expression";
      continue;
    }

    if (char === "'") {
      state = "singleQuote";
      continue;
    }

    if (char === "\"") {
      state = "doubleQuote";
      continue;
    }

    if (char === "`") {
      state = "nestedTemplate";
      continue;
    }

    if (char === "{") {
      expressionDepth += 1;
      continue;
    }

    if (char === "}") {
      expressionDepth -= 1;
      if (expressionDepth === 0) {
        expressions.push(templateSource.slice(expressionStart, index));
        state = "template";
      }
    }
  }

  return expressions;
}

function hasTopLevelStringConcatenation(argument) {
  let state = "code";
  let depth = 0;

  for (let index = 0; index < argument.length; index += 1) {
    const char = argument[index];
    const next = argument[index + 1];
    const previous = argument[index - 1];

    if (state === "lineComment") {
      if (char === "\n") state = "code";
      continue;
    }

    if (state === "blockComment") {
      if (char === "*" && next === "/") {
        index += 1;
        state = "code";
      }
      continue;
    }

    if (state === "singleQuote") {
      if (char === "'" && previous !== "\\") state = "code";
      continue;
    }

    if (state === "doubleQuote") {
      if (char === "\"" && previous !== "\\") state = "code";
      continue;
    }

    if (state === "template") {
      if (char === "`" && previous !== "\\") state = "code";
      continue;
    }

    if (char === "/" && next === "/") {
      state = "lineComment";
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      state = "blockComment";
      index += 1;
      continue;
    }

    if (char === "'") {
      state = "singleQuote";
      continue;
    }

    if (char === "\"") {
      state = "doubleQuote";
      continue;
    }

    if (char === "`") {
      state = "template";
      continue;
    }

    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }

    if (char === ")" || char === "]" || char === "}") {
      depth -= 1;
      continue;
    }

    if (char === "+" && depth === 0) {
      return true;
    }
  }

  return false;
}

function startsWithStringLiteral(argument) {
  const trimmed = argument.trimStart();
  return trimmed.startsWith("\"") || trimmed.startsWith("'") || trimmed.startsWith("`");
}

function countLines(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function compact(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
