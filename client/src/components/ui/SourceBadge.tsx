import React from 'react';
import { Badge } from './Badge';

const sourceStyles: Record<string, { label: string; variant: 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  google_maps: { label: 'Google Maps', variant: 'brand' },
  gmb_scraper: { label: 'Google Maps', variant: 'brand' },
  gmb: { label: 'Google Maps', variant: 'brand' },
  yellowpages: { label: 'Yellow Pages', variant: 'warning' },
  yellow_pages: { label: 'Yellow Pages', variant: 'warning' },
  yelp: { label: 'Yelp', variant: 'danger' },
  bbb: { label: 'BBB Registry', variant: 'info' },
  state_directory: { label: 'State Registry', variant: 'neutral' },
  chamber_directory: { label: 'Chamber Directory', variant: 'neutral' },
  csv: { label: 'CSV Import', variant: 'neutral' },
  manual: { label: 'Manual Entry', variant: 'neutral' },
  seed: { label: 'Seed Lead', variant: 'neutral' },
};

export function SourceBadge({ source }: { source?: string | null }) {
  const norm = String(source || '').toLowerCase().trim();
  const info = sourceStyles[norm] || { label: norm || 'Unknown Source', variant: 'neutral' };

  return (
    <Badge variant={info.variant} size="sm">
      {info.label}
    </Badge>
  );
}
