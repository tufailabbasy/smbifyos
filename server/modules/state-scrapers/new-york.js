const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "new-york",
    stateName: "New York",
    stateCode: "NY",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
