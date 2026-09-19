const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "mississippi",
    stateName: "Mississippi",
    stateCode: "MS",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
