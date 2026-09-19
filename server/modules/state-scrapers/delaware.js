const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "delaware",
    stateName: "Delaware",
    stateCode: "DE",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
