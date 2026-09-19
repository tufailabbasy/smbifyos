import React from 'react';
import { Badge, type BadgeProps } from './Badge';

export interface StatusBadgeProps extends Omit<BadgeProps, 'children'> {
  status?: string | null;
  customLabel?: string;
}

const statusConfig: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
  // Campaign & Automation statuses
  completed: { label: 'Complete', variant: 'success' },
  complete: { label: 'Complete', variant: 'success' },
  active: { label: 'Active', variant: 'brand' },
  running: { label: 'Running', variant: 'info' },
  sending: { label: 'Sending', variant: 'info' },
  in_progress: { label: 'In Progress', variant: 'info' },
  paused: { label: 'Paused', variant: 'warning' },
  queued: { label: 'Queued', variant: 'warning' },
  pending: { label: 'Pending', variant: 'warning' },
  draft: { label: 'Draft', variant: 'neutral' },
  idle: { label: 'Idle', variant: 'neutral' },
  failed: { label: 'Failed', variant: 'danger' },
  error: { label: 'Error', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'danger' },
  archived: { label: 'Archived', variant: 'neutral' },

  // Lead Pipeline statuses
  new: { label: 'New Lead', variant: 'brand' },
  'new leads': { label: 'New Lead', variant: 'brand' },
  contacted: { label: 'Contacted', variant: 'info' },
  'in dialogue': { label: 'In Dialogue', variant: 'warning' },
  in_dialogue: { label: 'In Dialogue', variant: 'warning' },
  audit_sent: { label: 'Audit Sent', variant: 'info' },
  proposal_sent: { label: 'Proposal Sent', variant: 'brand' },
  negotiating: { label: 'Negotiating', variant: 'warning' },
  closed_won: { label: 'Won Client', variant: 'success' },
  won: { label: 'Won Client', variant: 'success' },
  bounced: { label: 'Bounced', variant: 'danger' },
  'invalid email': { label: 'Invalid Email', variant: 'danger' },
  unsubscribed: { label: 'Unsubscribed', variant: 'neutral' },
  suppressed: { label: 'Suppressed', variant: 'danger' },

  // Verification & SEO statuses
  verified: { label: 'Verified', variant: 'success' },
  claimed: { label: 'Claimed', variant: 'success' },
  unclaimed: { label: 'Unclaimed', variant: 'danger' },
  pass: { label: 'Pass', variant: 'success' },
  fail: { label: 'Fail', variant: 'danger' },
};

export function StatusBadge({ status, customLabel, size = 'sm', dot = true, className = '', ...props }: StatusBadgeProps) {
  const normalized = (status || '').toLowerCase().trim();
  const cfg = statusConfig[normalized] || {
    label: customLabel || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown'),
    variant: 'neutral' as const,
  };

  return (
    <Badge
      variant={cfg.variant}
      size={size}
      dot={dot}
      className={className}
      {...props}
    >
      {customLabel || cfg.label}
    </Badge>
  );
}
