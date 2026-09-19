const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "kansas",
    stateName: "Kansas",
    stateCode: "KS",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
