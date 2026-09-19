const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "utah",
    stateName: "Utah",
    stateCode: "UT",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
