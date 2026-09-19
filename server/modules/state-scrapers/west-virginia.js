const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "west-virginia",
    stateName: "West Virginia",
    stateCode: "WV",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
