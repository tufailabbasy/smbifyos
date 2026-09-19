const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "georgia",
    stateName: "Georgia",
    stateCode: "GA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
