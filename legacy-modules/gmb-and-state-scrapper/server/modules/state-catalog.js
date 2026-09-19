function createState({
  id,
  name,
  code,
  registryUrl,
  status = "coming_soon",
  emoji = "🏛️",
}) {
  return {
    id,
    name,
    code,
    status,
    registryUrl,
    emoji,
  };
}

const STATE_CATALOG = [
  createState({
    id: "florida",
    name: "Florida",
    code: "FL",
    status: "ready",
    registryUrl: "https://search.sunbiz.org/inquiry/corporationsearch/byname",
    emoji: "🌴",
  }),
  createState({
    id: "texas",
    name: "Texas",
    code: "TX",
    status: "beta",
    registryUrl: "https://comptroller.texas.gov/taxes/franchise/account-status/search",
    emoji: "🤠",
  }),
  createState({
    id: "alabama",
    name: "Alabama",
    code: "AL",
    registryUrl: "https://arc-sos.state.al.us/CGI/CORPNAME.MBR/INPUT",
  }),
  createState({
    id: "alaska",
    name: "Alaska",
    code: "AK",
    registryUrl: "https://www.commerce.alaska.gov/cbp/main/search/entities",
  }),
  createState({
    id: "arizona",
    name: "Arizona",
    code: "AZ",
    registryUrl:
      "https://ecorp.azcc.gov/CommonPages/Corp/CorporationSearch.aspx",
    emoji: "🌵",
  }),
  createState({
    id: "arkansas",
    name: "Arkansas",
    code: "AR",
    status: "ready",
    registryUrl: "https://sos-corp-search.ark.org/corps",
  }),
  createState({
    id: "california",
    name: "California",
    code: "CA",
    registryUrl: "https://bizfile.sos.ca.gov",
    emoji: "🌊",
  }),
  createState({
    id: "colorado",
    name: "Colorado",
    code: "CO",
    status: "ready",
    registryUrl: "https://www.sos.state.co.us/biz/BusinessEntityCriteriaExt.do",
    emoji: "🏔️",
  }),
  createState({
    id: "connecticut",
    name: "Connecticut",
    code: "CT",
    registryUrl: "https://service.ct.gov/business/s/onlinebusinesssearch",
  }),
  createState({
    id: "delaware",
    name: "Delaware",
    code: "DE",
    registryUrl:
      "https://icis.corp.delaware.gov/ecorp/entitysearch/namesearch.aspx",
  }),
  createState({
    id: "georgia",
    name: "Georgia",
    code: "GA",
    registryUrl: "https://ecorp.sos.ga.gov/BusinessSearch",
    emoji: "🍑",
  }),
  createState({
    id: "hawaii",
    name: "Hawaii",
    code: "HI",
    registryUrl: "https://hbe.ehawaii.gov/documents/search.html",
  }),
  createState({
    id: "idaho",
    name: "Idaho",
    code: "ID",
    registryUrl: "https://sosbiz.idaho.gov/search/business",
  }),
  createState({
    id: "illinois",
    name: "Illinois",
    code: "IL",
    registryUrl: "https://www.ilsos.gov/corporatellc",
    emoji: "🏙️",
  }),
  createState({
    id: "indiana",
    name: "Indiana",
    code: "IN",
    registryUrl: "https://bsd.sos.in.gov/publicbusinesssearch",
  }),
  createState({
    id: "iowa",
    name: "Iowa",
    code: "IA",
    registryUrl: "https://sos.iowa.gov/search/business/search.aspx",
  }),
  createState({
    id: "kansas",
    name: "Kansas",
    code: "KS",
    registryUrl: "https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx",
  }),
  createState({
    id: "kentucky",
    name: "Kentucky",
    code: "KY",
    registryUrl: "https://web.sos.ky.gov/ftsearch/",
  }),
  createState({
    id: "louisiana",
    name: "Louisiana",
    code: "LA",
    registryUrl:
      "https://coraweb.sos.la.gov/commercialsearch/commercialsearch.aspx",
  }),
  createState({
    id: "maine",
    name: "Maine",
    code: "ME",
    registryUrl: "https://apps1.web.maine.gov/nei-sos-icrs/ICRS?MainPage=x",
  }),
  createState({
    id: "maryland",
    name: "Maryland",
    code: "MD",
    registryUrl: "https://egov.maryland.gov/BusinessExpress/EntitySearch",
  }),
  createState({
    id: "massachusetts",
    name: "Massachusetts",
    code: "MA",
    registryUrl:
      "https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx",
  }),
  createState({
    id: "michigan",
    name: "Michigan",
    code: "MI",
    registryUrl: "https://cofs.lara.state.mi.us/SearchApi/Search/Search",
    emoji: "🚗",
  }),
  createState({
    id: "minnesota",
    name: "Minnesota",
    code: "MN",
    registryUrl: "https://mblsportal.sos.state.mn.us/Business/Search",
  }),
  createState({
    id: "mississippi",
    name: "Mississippi",
    code: "MS",
    registryUrl:
      "https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch/portal.aspx",
  }),
  createState({
    id: "missouri",
    name: "Missouri",
    code: "MO",
    registryUrl:
      "https://bsd.sos.mo.gov/BusinessEntity/BESearch.aspx?SearchType=0",
  }),
  createState({
    id: "montana",
    name: "Montana",
    code: "MT",
    registryUrl: "https://biz.sosmt.gov/search/business",
  }),
  createState({
    id: "nebraska",
    name: "Nebraska",
    code: "NE",
    registryUrl: "https://www.nebraska.gov/sos/corp/corpsearch.cgi",
  }),
  createState({
    id: "nevada",
    name: "Nevada",
    code: "NV",
    registryUrl: "https://esos.nv.gov/EntitySearch/OnlineEntitySearch",
    emoji: "🎰",
  }),
  createState({
    id: "new-hampshire",
    name: "New Hampshire",
    code: "NH",
    registryUrl: "https://quickstart.sos.nh.gov/online/BusinessInquire",
  }),
  createState({
    id: "new-jersey",
    name: "New Jersey",
    code: "NJ",
    status: "ready",
    registryUrl: "https://www.njportal.com/DOR/BusinessNameSearch/Search/BusinessName",
  }),
  createState({
    id: "new-mexico",
    name: "New Mexico",
    code: "NM",
    registryUrl: "https://enterprise.sos.nm.gov/search/business",
  }),
  createState({
    id: "new-york",
    name: "New York",
    code: "NY",
    registryUrl: "https://apps.dos.ny.gov/publicInquiry",
    emoji: "🗽",
  }),
  createState({
    id: "north-carolina",
    name: "North Carolina",
    code: "NC",
    registryUrl:
      "https://www.sosnc.gov/online_services/search/by_title/_Business_Registration",
    emoji: "⛰️",
  }),
  createState({
    id: "north-dakota",
    name: "North Dakota",
    code: "ND",
    registryUrl: "https://firststop.sos.nd.gov/search/business",
  }),
  createState({
    id: "ohio",
    name: "Ohio",
    code: "OH",
    registryUrl: "https://businesssearch.ohiosos.gov",
    emoji: "🦌",
  }),
  createState({
    id: "oklahoma",
    name: "Oklahoma",
    code: "OK",
    registryUrl: "https://www.sos.ok.gov/corp/corpInquiryFind.aspx",
  }),
  createState({
    id: "oregon",
    name: "Oregon",
    code: "OR",
    registryUrl: "https://sos.oregon.gov/business/Pages/find.aspx",
  }),
  createState({
    id: "pennsylvania",
    name: "Pennsylvania",
    code: "PA",
    registryUrl: "https://file.dos.pa.gov/search/business",
    emoji: "🛣️",
  }),
  createState({
    id: "rhode-island",
    name: "Rhode Island",
    code: "RI",
    status: "ready",
    registryUrl:
      "https://business.sos.ri.gov/CorpWeb/CorpSearch/CorpSearch.aspx",
  }),
  createState({
    id: "south-carolina",
    name: "South Carolina",
    code: "SC",
    registryUrl: "https://businessfilings.sc.gov/BusinessFiling/Entity/Search",
  }),
  createState({
    id: "south-dakota",
    name: "South Dakota",
    code: "SD",
    registryUrl:
      "https://sosenterprise.sd.gov/BusinessServices/Business/FilingSearch.aspx",
  }),
  createState({
    id: "tennessee",
    name: "Tennessee",
    code: "TN",
    registryUrl: "https://tnbear.tn.gov/Ecommerce/FilingSearch.aspx",
  }),
  createState({
    id: "utah",
    name: "Utah",
    code: "UT",
    registryUrl: "https://secure.utah.gov/bes/",
  }),
  createState({
    id: "vermont",
    name: "Vermont",
    code: "VT",
    registryUrl: "https://bizfilings.vermont.gov/online/BusinessInquire",
  }),
  createState({
    id: "virginia",
    name: "Virginia",
    code: "VA",
    registryUrl: "https://cis.scc.virginia.gov",
  }),
  createState({
    id: "washington",
    name: "Washington",
    code: "WA",
    registryUrl: "https://ccfs.sos.wa.gov/#/BusinessSearch",
    emoji: "🌲",
  }),
  createState({
    id: "west-virginia",
    name: "West Virginia",
    code: "WV",
    registryUrl: "https://apps.sos.wv.gov/business/corporations/",
  }),
  createState({
    id: "wisconsin",
    name: "Wisconsin",
    code: "WI",
    registryUrl: "https://www.wdfi.org/apps/CorpSearch/Search.aspx",
  }),
  createState({
    id: "wyoming",
    name: "Wyoming",
    code: "WY",
    registryUrl: "https://wyobiz.wyo.gov/Business/FilingSearch.aspx",
  }),
];

module.exports = {
  STATE_CATALOG,
};
