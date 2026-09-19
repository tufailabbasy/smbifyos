const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "montana",
    stateName: "Montana",
    stateCode: "MT",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
