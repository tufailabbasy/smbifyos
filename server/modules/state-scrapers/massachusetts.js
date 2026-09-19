const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "massachusetts",
    stateName: "Massachusetts",
    stateCode: "MA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
