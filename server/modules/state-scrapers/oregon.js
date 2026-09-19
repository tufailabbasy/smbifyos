const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "oregon",
    stateName: "Oregon",
    stateCode: "OR",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
