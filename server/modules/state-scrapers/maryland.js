const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "maryland",
    stateName: "Maryland",
    stateCode: "MD",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
