const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "illinois",
    stateName: "Illinois",
    stateCode: "IL",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
