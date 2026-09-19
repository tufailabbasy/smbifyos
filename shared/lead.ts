export type LeadStatus =
  | "new"
  | "contacted"
  | "audit_sent"
  | "proposal_sent"
  | "negotiating"
  | "closed_won"
  | "closed_lost"
  | "retained_client";

export type LeadSource =
  | "gmb_scraper"
  | "yellowpages"
  | "state_directory"
  | "yelp_scraper"
  | "bbb_scraper"
  | "website_enrichment"
  | "chamber_directory"
  | "license_registry"
  | "ads_google"
  | "ads_meta"
  | "ads_bing"
  | "manual"
  | "csv";

export interface LeadInput {
  business_name: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  niche?: string;
  gmb_url?: string;
  gmb_claimed?: boolean;
  gmb_rating?: number | null;
  gmb_review_count?: number | null;
  has_website?: boolean;
  gmb_profile_incomplete?: boolean;
  citations_found?: boolean;
  source: LeadSource;
  status?: LeadStatus;
  notes?: string;
}

export interface Lead extends LeadInput {
  id: string;
  lead_score: number;
  last_gmb_audit_score?: number | null;
  last_website_audit_score?: number | null;
  created_at: string;
  updated_at: string;
}
