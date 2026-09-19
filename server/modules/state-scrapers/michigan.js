const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "michigan",
    stateName: "Michigan",
    stateCode: "MI",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
