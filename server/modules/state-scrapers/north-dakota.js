const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "north-dakota",
    stateName: "North Dakota",
    stateCode: "ND",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
