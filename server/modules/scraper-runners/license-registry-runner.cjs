const fs = require("fs");
const path = require("path");
const { scrapeDirectoryViaBingRss, emitProgress } = require("./bing-rss-utils.cjs");

function getArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return process.argv[index + 1];
}

function normalizeDomain(value = "") {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "")
    .toLowerCase();
}

async function run() {
  const inputPath = path.resolve(getArgValue("--input"));
  const outputPath = path.resolve(getArgValue("--output"));
  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const state = String(payload.state || "").trim().toUpperCase();
  const businessType = String(payload.businessType || "").trim();
  const registryDomain = normalizeDomain(payload.registryDomain || "");
  const limit = Number(payload.limit || 40);

  if (!state || !businessType) {
    throw new Error("state and businessType are required");
  }

  emitProgress({ percent: 1, message: "License registry discovery started", totalFound: 0 });

  const baseQuery = registryDomain
    ? `site:${registryDomain} ${businessType} ${state} license`
    : `site:.gov ${businessType} ${state} license`;

  let results = await scrapeDirectoryViaBingRss({
    query: baseQuery,
    category: businessType,
    location: state,
    maxItems: limit,
    domainFilters: registryDomain ? [registryDomain] : [],
    blockedPathIncludes: ["/search", "/login", "/help"],
  });

  if (results.length === 0 && !registryDomain) {
    emitProgress({ percent: 55, message: "Strict registry query returned no rows, using broader fallback", totalFound: 0 });
    results = await scrapeDirectoryViaBingRss({
      query: `${state} ${businessType} licensed contractor`,
      category: businessType,
      location: state,
      maxItems: limit,
      domainFilters: [],
      blockedPathIncludes: ["/search", "/login", "/help"],
    });
  }

  results = results.map((item) => ({
    ...item,
    website: "",
    model: registryDomain ? "registry_domain_search" : "state_registry_search",
    confidence: registryDomain ? 0.72 : 0.58,
  }));

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  emitProgress({ percent: 100, message: `License registry discovery finished with ${results.length} rows`, totalFound: results.length });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[license-registry-runner] ${message}`);
  process.exit(1);
});
