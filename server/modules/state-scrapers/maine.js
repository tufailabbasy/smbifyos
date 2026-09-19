const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "maine",
    stateName: "Maine",
    stateCode: "ME",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
