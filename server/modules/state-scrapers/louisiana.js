const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "louisiana",
    stateName: "Louisiana",
    stateCode: "LA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
