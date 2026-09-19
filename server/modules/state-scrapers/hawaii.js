const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "hawaii",
    stateName: "Hawaii",
    stateCode: "HI",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
