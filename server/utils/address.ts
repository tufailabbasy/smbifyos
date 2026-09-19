export interface AddressParts {
  address: string;
  city: string;
  state: string;
  zip: string;
}

export function splitAddress(rawAddress: string): AddressParts {
  const cleaned = (rawAddress || "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { address: "", city: "", state: "", zip: "" };
  }

  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);

  let city = "";
  let state = "";
  let zip = "";

  const lastPart = parts[parts.length - 1] || "";
  const stateZipMatch = lastPart.match(/\b([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\b/i);

  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    zip = stateZipMatch[2];

    if (parts.length >= 2) {
      city = parts[parts.length - 2];
    }
  } else {
    const stateOnlyMatch = lastPart.match(/^([A-Z]{2})$/i);
    if (stateOnlyMatch) {
      state = stateOnlyMatch[1].toUpperCase();
      if (parts.length >= 2) {
        city = parts[parts.length - 2];
      }
    }
  }

  return {
    address: cleaned,
    city,
    state,
    zip,
  };
}
