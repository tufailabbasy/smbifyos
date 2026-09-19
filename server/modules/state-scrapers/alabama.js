const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "alabama",
    stateName: "Alabama",
    stateCode: "AL",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
