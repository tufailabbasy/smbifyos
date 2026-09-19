const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "minnesota",
    stateName: "Minnesota",
    stateCode: "MN",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
