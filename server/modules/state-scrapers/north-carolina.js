const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "north-carolina",
    stateName: "North Carolina",
    stateCode: "NC",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
