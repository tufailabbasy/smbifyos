const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "vermont",
    stateName: "Vermont",
    stateCode: "VT",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
