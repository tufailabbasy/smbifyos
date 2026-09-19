export const timeZoneGroups: Array<{ label: string; options: string[] }> = [
  {
    label: "North America",
    options: [
      "America/New_York",
      "America/Chicago",
      "America/Denver",
      "America/Los_Angeles",
      "America/Phoenix",
      "America/Toronto",
      "America/Vancouver",
      "Pacific/Honolulu",
    ],
  },
  {
    label: "Europe & Africa",
    options: [
      "UTC",
      "Europe/London",
      "Europe/Berlin",
      "Europe/Paris",
      "Europe/Madrid",
      "Europe/Rome",
      "Europe/Warsaw",
      "Africa/Cairo",
      "Africa/Johannesburg",
    ],
  },
  {
    label: "Middle East & Asia",
    options: [
      "Asia/Dubai",
      "Asia/Karachi",
      "Asia/Kolkata",
      "Asia/Dhaka",
      "Asia/Bangkok",
      "Asia/Singapore",
      "Asia/Hong_Kong",
      "Asia/Tokyo",
    ],
  },
  {
    label: "Australia & Pacific",
    options: [
      "Australia/Sydney",
      "Australia/Melbourne",
      "Australia/Perth",
      "Pacific/Auckland",
    ],
  },
];

export function formatTimeZoneLabel(value: string): string {
  return value.replace(/_/g, " ");
}

export function getTimeZoneGroups(selectedValue: string) {
  const exists = timeZoneGroups.some((group) => group.options.includes(selectedValue));
  if (exists || !selectedValue) {
    return timeZoneGroups;
  }

  return [{ label: "Saved Value", options: [selectedValue] }, ...timeZoneGroups];
}