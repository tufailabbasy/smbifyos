const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "kentucky",
    stateName: "Kentucky",
    stateCode: "KY",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
