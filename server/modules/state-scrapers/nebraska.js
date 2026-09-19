const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "nebraska",
    stateName: "Nebraska",
    stateCode: "NE",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
