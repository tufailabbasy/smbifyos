const { scrapeStateViaGoogleMapsFallback } = require("./maps-fallback");

async function scrape({ businessType, limit, onProgress } = {}) {
  return scrapeStateViaGoogleMapsFallback({
    stateId: "district-of-columbia",
    stateName: "District of Columbia",
    stateCode: "DC",
    businessType,
    limit,
    onProgress,
  });
}

module.exports = {
  scrape,
};
