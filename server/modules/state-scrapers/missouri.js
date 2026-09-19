const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "missouri",
    stateName: "Missouri",
    stateCode: "MO",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
