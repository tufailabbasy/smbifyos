const {
  DEFAULT_TIMEOUT,
  cleanInlineText,
  normalizeStatus,
  normalizeEmptyValue,
  parseUsAddress,
  resolveUrl,
  safeProgress,
  safeWaitIfPaused,
  safeShouldCancel,
  logPageContext,
  createBrowser,
  createContext,
  closeResources,
} = require("./shared");
const {
  buildCategorySearchPlan,
  dedupeAndRankRecords,
} = require("./category-search");

const SEARCH_URL =
  "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do";

function getTermLimit(targetLimit, collectedCount) {
  if (!Number.isFinite(targetLimit)) {
    return 75;
  }

  return Math.max(targetLimit - collectedCount, 15);
}

async function submitSearch(page, businessType) {
  await page.goto(SEARCH_URL, {
    waitUntil: "domcontentloaded",
    timeout: DEFAULT_TIMEOUT,
  });

  await page.fill("#searchCriteria", businessType);
  await Promise.all([
    page.waitForNavigation({
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    }),
    page.getByRole("button", { name: "Search" }).click(),
  ]);

  const bodyText = cleanInlineText(await page.locator("body").innerText());

  if (/Exceeded Record Count/i.test(bodyText)) {
    return {
      exceededRecordCount: true,
    };
  }

  await page
    .waitForFunction(
      () => {
        const bodyText = document.body ? document.body.innerText || "" : "";

        return (
          Boolean(document.querySelector("table tr.odd, table tr.even")) ||
          /No records found|No entity record/i.test(bodyText)
        );
      },
      { timeout: DEFAULT_TIMEOUT }
    )
    .catch(() => null);

  return {
    exceededRecordCount: false,
  };
}

async function searchBusinesses(page, businessType) {
  try {
    const result = await submitSearch(page, businessType);

    if (result.exceededRecordCount) {
      return false;
    }

    return true;
  } catch (error) {
    await logPageContext("colorado", page, "Colorado search failed", error);
    throw new Error(`Colorado search failed: ${error.message}`);
  }
}

async function extractResultRows(page) {
  return page.evaluate(() => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    return Array.from(document.querySelectorAll("table tr.odd, table tr.even"))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const detailLink = row.querySelector(
          'a[href*="TradeNameSummary.do"], a[href*="BusinessEntityDetail.do"], a[href*="TradeMarkDetail.do"]'
        );

        if (cells.length < 8 || !detailLink) {
          return null;
        }

        return {
          detailUrl: new URL(detailLink.getAttribute("href"), location.href).toString(),
          businessName: normalize(cells[3].textContent),
          event: normalize(cells[4].textContent),
          rowStatus: normalize(cells[5].textContent),
          filingDate: normalize(cells[7].textContent),
        };
      })
      .filter(Boolean)
      .filter(
        (row) =>
          !/Trademark/i.test(row.event) &&
          !/TradeMarkDetail\.do/i.test(row.detailUrl)
      );
  });
}

async function extractSections(page) {
  return page.evaluate(() => {
    const normalize = (value = "") =>
      String(value ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n+/g, " ")
        .trim();

    const sections = {};

    Array.from(document.querySelectorAll("table")).forEach((table) => {
      const sectionName = normalize(
        table.querySelector(".entity_conf_table_header")?.textContent
      );

      if (!sectionName) {
        return;
      }

      const values = {};

      Array.from(table.querySelectorAll("tr")).forEach((row) => {
        const cells = Array.from(row.children)
          .map((cell) => normalize(cell.textContent))
          .filter(Boolean);

        if (cells.length === 2) {
          values[cells[0].replace(/:$/g, "")] = cells[1];
          return;
        }

        if (cells.length === 4) {
          values[cells[0].replace(/:$/g, "")] = cells[1];
          values[cells[2].replace(/:$/g, "")] = cells[3];
        }
      });

      sections[sectionName] = values;
    });

    const showEntityHref =
      Array.from(document.querySelectorAll("a"))
        .map((anchor) => ({
          text: normalize(anchor.textContent),
          href: normalize(anchor.getAttribute("href")),
        }))
        .find((anchor) => anchor.text === "Show entity")?.href || "";

    return {
      sections,
      showEntityHref,
    };
  });
}

function mapEntityRecord(row, sections, sourceUrl, businessNameOverride = "") {
  const detailSection = sections.Details || {};
  const agentSection = sections["Registered Agent"] || {};
  const principalOfficeAddress = cleanInlineText(
    detailSection["Principal office street address"] ||
      detailSection["Principal office mailing address"]
  );
  const registeredAgentAddressCandidates = [
    cleanInlineText(agentSection["Street address"]),
    cleanInlineText(agentSection["Mailing address"]),
  ].filter(Boolean);
  const preferredAgentAddress =
    registeredAgentAddressCandidates.find((value) =>
      /\b(?:ave|avenue|st|street|road|rd|drive|dr|lane|ln|court|ct|place|pl)\b/i.test(
        value
      )
    ) || registeredAgentAddressCandidates[registeredAgentAddressCandidates.length - 1] || "";
  const principalAddress = parseUsAddress(
    principalOfficeAddress,
    "CO"
  );
  const agentAddress = parseUsAddress(preferredAgentAddress, "CO");

  return {
    businessName:
      cleanInlineText(businessNameOverride) ||
      cleanInlineText(detailSection.Name) ||
      cleanInlineText(row.businessName),
    status:
      normalizeStatus(detailSection.Status || row.rowStatus) ||
      normalizeStatus(row.rowStatus),
    filingDate: cleanInlineText(detailSection["Formation date"] || row.filingDate),
    address: principalAddress.address,
    city: principalAddress.city,
    state: principalAddress.state || "CO",
    zip: principalAddress.zip,
    agentName: cleanInlineText(agentSection.Name),
    agentAddress: agentAddress.address,
    phone: "",
    sourceUrl: cleanInlineText(sourceUrl),
  };
}

function mapTradeNameRecord(row, tradeSections, entitySections, sourceUrl) {
  const detailSection = tradeSections.Details || {};
  const entityRecord = mapEntityRecord(
    row,
    entitySections,
    sourceUrl,
    cleanInlineText(detailSection["Trade name"]) || cleanInlineText(row.businessName)
  );
  const primaryAddress = parseUsAddress(
    detailSection["Primary residence or usual place of business street address"] ||
      detailSection["Primary residence or usual place of business mailing address"],
    "CO"
  );

  return {
    ...entityRecord,
    businessName:
      cleanInlineText(detailSection["Trade name"]) || entityRecord.businessName,
    status:
      normalizeStatus(detailSection.Status || entityRecord.status) ||
      entityRecord.status,
    filingDate:
      cleanInlineText(detailSection["Formation Date"] || entityRecord.filingDate) ||
      entityRecord.filingDate,
    address: primaryAddress.address || entityRecord.address,
    city: primaryAddress.city || entityRecord.city,
    state: primaryAddress.state || entityRecord.state || "CO",
    zip: primaryAddress.zip || entityRecord.zip,
  };
}

async function extractNextPageUrl(page) {
  const href = await page
    .locator('a[href*="pi1="][title*="Next"]')
    .first()
    .getAttribute("href")
    .catch(() => "");

  return resolveUrl(page.url(), href);
}

async function scrapeForTerm({
  listPage,
  detailPage,
  searchTerm,
  termLimit,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const termResults = [];
  const searchSucceeded = await searchBusinesses(listPage, searchTerm);

  if (!searchSucceeded) {
    console.log(
      `[colorado] Skipping Colorado keyword "${searchTerm}" because the registry record cap was exceeded.`
    );
    return {
      termResults,
      exceededRecordCount: true,
    };
  }

  while (termResults.length < termLimit) {
    await safeWaitIfPaused("colorado", waitIfPaused);

    if (await safeShouldCancel("colorado", shouldCancel)) {
      break;
    }

    const rows = await extractResultRows(listPage);

    if (!rows.length) {
      break;
    }

    for (const row of rows) {
      await safeWaitIfPaused("colorado", waitIfPaused);

      if (await safeShouldCancel("colorado", shouldCancel)) {
        break;
      }

      if (termResults.length >= termLimit) {
        break;
      }

      try {
        await detailPage.goto(row.detailUrl, {
          waitUntil: "domcontentloaded",
          timeout: DEFAULT_TIMEOUT,
        });

        const detailPayload = await extractSections(detailPage);
        let record;

        if (/TradeNameSummary\.do/i.test(row.detailUrl)) {
          const entityUrl = resolveUrl(row.detailUrl, detailPayload.showEntityHref);
          let entitySections = {};

          if (entityUrl) {
            await detailPage.goto(entityUrl, {
              waitUntil: "domcontentloaded",
              timeout: DEFAULT_TIMEOUT,
            });

            const entityPayload = await extractSections(detailPage);
            entitySections = entityPayload.sections || {};
          }

          record = mapTradeNameRecord(
            row,
            detailPayload.sections || {},
            entitySections,
            row.detailUrl
          );
        } else {
          record = mapEntityRecord(
            row,
            detailPayload.sections || {},
            row.detailUrl
          );
        }

        record.address = normalizeEmptyValue(record.address);
        record.agentAddress = normalizeEmptyValue(record.agentAddress);
        termResults.push(record);
      } catch (error) {
        termResults.push({
          businessName: cleanInlineText(row.businessName),
          status: normalizeStatus(row.rowStatus),
          filingDate: cleanInlineText(row.filingDate),
          address: "",
          city: "",
          state: "CO",
          zip: "",
          agentName: "",
          agentAddress: "",
          phone: "",
          sourceUrl: cleanInlineText(row.detailUrl),
          error: true,
          errorMessage: cleanInlineText(error.message),
        });
      }
    }

    if (termResults.length >= termLimit) {
      break;
    }

    const nextPageUrl = await extractNextPageUrl(listPage);

    if (!nextPageUrl || nextPageUrl === listPage.url()) {
      break;
    }

    await listPage.goto(nextPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
  }

  return {
    termResults,
    exceededRecordCount: false,
  };
}

async function scrape({
  businessType,
  limit,
  onProgress,
  waitIfPaused,
  shouldCancel,
} = {}) {
  const normalizedBusinessType = cleanInlineText(businessType);
  const numericLimit = Number(limit);
  const targetLimit =
    Number.isFinite(numericLimit) && numericLimit > 0
      ? numericLimit
      : Number.POSITIVE_INFINITY;
  const progressTotal = Number.isFinite(targetLimit) ? targetLimit : null;
  const searchPlan = buildCategorySearchPlan(normalizedBusinessType);
  let results = [];
  let browser;
  let context;
  let listPage;
  let detailPage;

  if (!normalizedBusinessType) {
    console.error("[colorado] Missing businessType. Returning no results.");
    return [];
  }

  try {
    browser = await createBrowser("colorado");
    context = await createContext(browser, {
      timezoneId: "America/Denver",
    });
    listPage = await context.newPage();
    detailPage = await context.newPage();

    for (const searchTerm of searchPlan.terms) {
      await safeWaitIfPaused("colorado", waitIfPaused);

      if (await safeShouldCancel("colorado", shouldCancel)) {
        break;
      }

      console.log(
        `[colorado] Searching Colorado registry using keyword "${searchTerm}"`
      );

      const { termResults } = await scrapeForTerm({
        listPage,
        detailPage,
        searchTerm,
        termLimit: getTermLimit(targetLimit, results.length),
        waitIfPaused,
        shouldCancel,
      });

      results = dedupeAndRankRecords([...results, ...termResults], searchPlan);

      await safeProgress("colorado", onProgress, {
        scraped: results.length,
        total: progressTotal,
        records: results.slice(0, 300),
      });

      if (results.length >= targetLimit) {
        break;
      }
    }
  } catch (error) {
    console.error(`[colorado] Colorado scrape stopped early: ${error.message}`);
  } finally {
    await closeResources("colorado", {
      page: detailPage,
      context: null,
      browser: null,
    });
    await closeResources("colorado", {
      page: listPage,
      context,
      browser,
    });
  }

  console.log(
    `[colorado] Colorado scrape finished with ${results.length} returned records.`
  );
  return results.slice(0, targetLimit);
}

module.exports = {
  scrape,
};
