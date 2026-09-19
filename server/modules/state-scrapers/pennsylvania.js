const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "pennsylvania",
    stateName: "Pennsylvania",
    stateCode: "PA",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
