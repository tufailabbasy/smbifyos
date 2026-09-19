const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "connecticut",
    stateName: "Connecticut",
    stateCode: "CT",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
