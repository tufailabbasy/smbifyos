const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "ohio",
    stateName: "Ohio",
    stateCode: "OH",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
