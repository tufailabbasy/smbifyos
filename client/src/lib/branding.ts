import type { AppProfileSettings } from "./api";

export const SETTINGS_UPDATED_EVENT = "smbify-lead:settings-updated";

export function dispatchSettingsUpdated(profile: AppProfileSettings): void {
  window.dispatchEvent(
    new CustomEvent<AppProfileSettings>(SETTINGS_UPDATED_EVENT, {
      detail: profile,
    })
  );
}

export function getAgencyInitials(name: string): string {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);

  if (words.length === 0) {
    return "SL";
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}