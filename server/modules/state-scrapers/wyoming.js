const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "wyoming",
    stateName: "Wyoming",
    stateCode: "WY",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
