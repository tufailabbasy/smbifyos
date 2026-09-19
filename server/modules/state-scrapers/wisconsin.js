const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "wisconsin",
    stateName: "Wisconsin",
    stateCode: "WI",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
