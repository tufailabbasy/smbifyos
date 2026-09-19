const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "new-hampshire",
    stateName: "New Hampshire",
    stateCode: "NH",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
