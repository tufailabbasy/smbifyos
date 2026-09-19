const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "virginia",
    stateName: "Virginia",
    stateCode: "VA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
