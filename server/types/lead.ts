import type { Lead, LeadInput, LeadSource, LeadStatus } from "../../shared/lead.js";

export type { Lead, LeadInput, LeadSource, LeadStatus };

export type LeadSortBy =
  | "created_at"
  | "updated_at"
  | "business_name"
  | "city"
  | "status";

export type LeadSortOrder = "asc" | "desc";

export interface LeadFilters {
  niche?: string;
  city?: string;
  status?: LeadStatus;
  source?: LeadSource;
  hasWebsite?: boolean;
  gmbClaimed?: boolean;
  hasEmail?: boolean;
  gmbRatingMin?: number;
  gmbRatingMax?: number;
  gmbReviewCountMin?: number;
  gmbReviewCountMax?: number;
  createdFrom?: string;
  createdTo?: string;
  query?: string;
  page?: number;
  pageSize?: number;
  sortBy?: LeadSortBy;
  sortOrder?: LeadSortOrder;
}

export interface ImportResult {
  inserted: number;
  updated: number;
  leadIds: string[];
}
