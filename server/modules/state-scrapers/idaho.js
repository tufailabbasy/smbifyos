const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "idaho",
    stateName: "Idaho",
    stateCode: "ID",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
