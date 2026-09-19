const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "south-dakota",
    stateName: "South Dakota",
    stateCode: "SD",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
