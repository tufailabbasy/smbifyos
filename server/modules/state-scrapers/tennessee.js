const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "tennessee",
    stateName: "Tennessee",
    stateCode: "TN",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
