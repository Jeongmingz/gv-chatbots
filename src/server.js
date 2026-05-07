const http = require("node:http");
const { URL } = require("node:url");
const {
  findBestFaq,
  getSuggestedFaqs,
  loadFaqData,
  searchFaq
} = require("./faq");
const {
  extractUtterance,
  faqToQuickReplies,
  quickReply,
  simpleText
} = require("./kakao");

const PORT = Number(process.env.PORT || 3000);
const faqData = loadFaqData();

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });

    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function buildFaqAnswer(match) {
  const { faq } = match;
  const prefix = `[${faq.categoryName}]\n`;
  return `${prefix}${faq.answer}`;
}

function fallbackResponse() {
  return simpleText(
    "문의 내용을 찾지 못했습니다. 아래 예시처럼 제품명과 증상을 함께 입력해 주세요.",
    [
      quickReply("Smart 모델 차이"),
      quickReply("Lift 모델 차이"),
      quickReply("IZZI 필터 교체"),
      quickReply("IGGI 마개가 안 열려요"),
      quickReply("AS 접수 방법")
    ]
  );
}

async function handleSkillFaq(req, res) {
  const payload = await readJson(req);
  const utterance = extractUtterance(payload);
  const match = findBestFaq(faqData, utterance);

  if (!match) {
    sendJson(res, 200, fallbackResponse());
    return;
  }

  const related = searchFaq(faqData, utterance, { limit: 6 })
    .map((item) => item.faq)
    .filter((faq) => faq.id !== match.faq.id);

  sendJson(
    res,
    200,
    simpleText(buildFaqAnswer(match), faqToQuickReplies(related))
  );
}

function handleSearch(url, res) {
  const query = url.searchParams.get("q") || "";
  const results = searchFaq(faqData, query, { limit: 10 }).map((item) => ({
    score: item.score,
    id: item.faq.id,
    categoryId: item.faq.categoryId,
    categoryName: item.faq.categoryName,
    question: item.faq.question,
    answer: item.faq.answer,
    links: item.faq.links || []
  }));

  sendJson(res, 200, { query, results });
}

function handleCategories(res) {
  sendJson(res, 200, {
    categories: faqData.categories.map((category) => ({
      id: category.id,
      name: category.name,
      aliases: category.aliases,
      count: category.faqs.length,
      suggestions: getSuggestedFaqs(faqData, category.id, 3).map((faq) => ({
        id: faq.id,
        question: faq.question
      }))
    }))
  });
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        brand: faqData.brand,
        categories: faqData.categories.length,
        faqs: faqData.flatFaqs.length
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/faq/categories") {
      handleCategories(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/faq/search") {
      handleSearch(url, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/skill/laurastar/faq") {
      await handleSkillFaq(req, res);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 400, {
      error: "Invalid request",
      message: error.message
    });
  }
}

if (require.main === module) {
  const server = http.createServer(route);

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Port ${PORT} is already in use. Stop the existing process or run with PORT=3001 npm start.`
      );
      process.exit(1);
    }

    throw error;
  });

  server.listen(PORT, () => {
    console.log(`Laurastar FAQ skill server listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  route
};
