const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "iowa",
    stateName: "Iowa",
    stateCode: "IA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
