const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "alaska",
    stateName: "Alaska",
    stateCode: "AK",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
