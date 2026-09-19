const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "arizona",
    stateName: "Arizona",
    stateCode: "AZ",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
