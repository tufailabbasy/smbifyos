const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "oklahoma",
    stateName: "Oklahoma",
    stateCode: "OK",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
