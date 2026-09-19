const fs = require("fs");
const path = require("path");
const { emitProgress } = require("./bing-rss-utils.cjs");

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
  const rows = Array.isArray(payload.rows) ? payload.rows : [];

  if (rows.length === 0) {
    throw new Error("rows are required");
  }

  emitProgress({ percent: 5, message: "Website enrichment batch prepared", totalFound: rows.length });

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  emitProgress({ percent: 65, message: `Passing ${rows.length} rows into enrichment pipeline`, totalFound: rows.length });
  fs.writeFileSync(outputPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  emitProgress({ percent: 100, message: `Website enrichment seed batch saved (${rows.length} rows)`, totalFound: rows.length });
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[website-enrichment-runner] ${message}`);
  process.exit(1);
});
