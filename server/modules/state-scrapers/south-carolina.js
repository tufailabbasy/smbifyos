const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "south-carolina",
    stateName: "South Carolina",
    stateCode: "SC",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
