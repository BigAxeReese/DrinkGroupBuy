const fs = require("fs");
const http = require("http");
const path = require("path");
const {
  cancelGroupBuy,
  completeGroupBuy,
  createGroupBuy,
  getGroupBuy,
  joinGroupBuy,
  leaveGroupBuy,
  listGroupBuys,
  simulateGroupBuyDeadline
} = require("./src/services/groupBuyService");
const { calculateBestPromotion } = require("./src/services/promotionCalculator");

const port = Number(process.env.PORT || 3000);
const publicRoot = path.join(__dirname, "public");
const shopsPath = path.join(__dirname, "data", "shops", "shops.json");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const content = fs.readFileSync(filePath, "utf8").trim();
  return content ? JSON.parse(content) : fallback;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("request body is too large"));
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("request body must be valid JSON"));
      }
    });
  });
}

function getPromotionForGroupBuy(groupBuy, shops) {
  const shop = shops.find((item) => item.id === groupBuy.shopId);
  const promotions = groupBuy.promotions || (shop ? shop.promotions || [] : []);
  const selectedPromotion = promotions.find((promotion) => promotion.id === groupBuy.promotionId);
  const bestPromotion = calculateBestPromotion(promotions, {
    totalCups: groupBuy.totals.cups,
    totalAmount: groupBuy.totals.amount
  });

  return {
    shop,
    selectedPromotion,
    bestPromotion
  };
}

function buildGroupBuyPayload(groupBuy) {
  const shops = readJson(shopsPath, []);
  const { shop, selectedPromotion, bestPromotion } = getPromotionForGroupBuy(groupBuy, shops);
  const isReceiving = groupBuy.status === "open" && new Date(groupBuy.deadline).getTime() <= Date.now();

  return {
    ...groupBuy,
    displayStatus: isReceiving ? "receiving" : groupBuy.status,
    isJoinable: groupBuy.status === "open" && !isReceiving,
    isCancellable: groupBuy.status === "open" && !isReceiving,
    isCompletable: isReceiving,
    shop,
    selectedPromotion,
    bestPromotion
  };
}

async function handleApi(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/shops") {
    sendJson(response, 200, readJson(shopsPath, []));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/group-buys") {
    sendJson(response, 200, listGroupBuys().map(buildGroupBuyPayload));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/group-buys") {
    try {
      const input = await readBody(request);
      const groupBuy = createGroupBuy(input);
      sendJson(response, 201, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const groupBuyMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)$/);
  if (request.method === "GET" && groupBuyMatch) {
    const groupBuy = getGroupBuy(groupBuyMatch[1]);
    if (!groupBuy) {
      sendJson(response, 404, { error: "group buy not found" });
      return;
    }

    sendJson(response, 200, buildGroupBuyPayload(groupBuy));
    return;
  }

  const participantCollectionMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)\/participants$/);
  if (request.method === "POST" && participantCollectionMatch) {
    try {
      const input = await readBody(request);
      const groupBuy = joinGroupBuy(participantCollectionMatch[1], input);
      sendJson(response, 201, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const participantMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)\/participants\/([^/]+)$/);
  if (request.method === "DELETE" && participantMatch) {
    try {
      const groupBuy = leaveGroupBuy(participantMatch[1], participantMatch[2]);
      sendJson(response, 200, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const cancelMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)\/cancel$/);
  if (request.method === "POST" && cancelMatch) {
    try {
      const input = await readBody(request);
      const groupBuy = cancelGroupBuy(cancelMatch[1], input);
      sendJson(response, 200, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const completeMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)\/complete$/);
  if (request.method === "POST" && completeMatch) {
    try {
      const groupBuy = completeGroupBuy(completeMatch[1]);
      sendJson(response, 200, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  const simulateDeadlineMatch = url.pathname.match(/^\/api\/group-buys\/([^/]+)\/simulate-deadline$/);
  if (request.method === "POST" && simulateDeadlineMatch) {
    try {
      const groupBuy = simulateGroupBuyDeadline(simulateDeadlineMatch[1]);
      sendJson(response, 200, buildGroupBuyPayload(groupBuy));
    } catch (error) {
      sendJson(response, 400, { error: error.message });
    }
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

function sendStatic(request, response, url) {
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(publicRoot, pathname));

  if (!filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }

  sendStatic(request, response, url);
});

server.listen(port, () => {
  console.log(`DrinkGroupBuy prototype running at http://localhost:${port}`);
});
