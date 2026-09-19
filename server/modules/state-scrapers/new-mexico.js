const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "new-mexico",
    stateName: "New Mexico",
    stateCode: "NM",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
