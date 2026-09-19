const fs = require("fs");
const path = require("path");
const { emitProgress } = require("./bing-rss-utils.cjs");
const { discoverViaGoogleMaps, normalizePositiveInteger } = require("./google-maps-discovery-utils.cjs");

function getArgValue(flag) {
  const index = process.argv.findIndex((arg) => arg === flag);
  if (index === -1 || index + 1 >= process.argv.length) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return process.argv[index + 1];
}

async function run() {
  const inputPath = path.resolve(getArgValue("--input"));
  const outputPath = path.resolve(getArgValue("--output"));

  const payload = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  const businessType = String(payload.businessType || "").trim();
  const location = String(payload.location || "").trim();
  const maxItems = normalizePositiveInteger(payload.maxItems, 20, 5000);

  if (!businessType || !location) {
    throw new Error("businessType and location are required");
  }

  emitProgress({ percent: 2, message: "Yelp discovery started", totalFound: 0 });

  const results = await discoverViaGoogleMaps({
    keyword: businessType,
    location,
    maxItems,
    category: businessType,
    snippetPrefix: "Directory mode: Yelp fallback via Google Maps",
    onProgress: ({ processedQueries, totalQueries, totalListings, previewListings }) => {
      const discovered = Math.max(0, Number(totalListings) || 0);
      const queryRatio = totalQueries > 0 ? processedQueries / totalQueries : 0;
      const countRatio = Math.min(1, discovered / Math.max(1, maxItems));
      const ratio = Math.max(queryRatio, countRatio);
      const percent = Math.min(92, Math.max(10, Math.round(10 + ratio * 82)));

      emitProgress({
        percent,
        message: `Yelp fallback discovery ${Math.min(discovered, maxItems)}/${maxItems}`,
        totalFound: discovered,
        previewListings: Array.isArray(previewListings) ? previewListings.slice(0, 200) : undefined,
      });
    },
  });

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  emitProgress({
    percent: 100,
    message: `Yelp discovery finished with ${results.length} rows`,
    totalFound: results.length,
  });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[yelp-runner] ${message}`);
  process.exit(1);
});
