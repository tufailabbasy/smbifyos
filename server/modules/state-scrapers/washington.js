const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "washington",
    stateName: "Washington",
    stateCode: "WA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
