const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "indiana",
    stateName: "Indiana",
    stateCode: "IN",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
