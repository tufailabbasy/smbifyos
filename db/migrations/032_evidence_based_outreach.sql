-- Remove unsupported outcome claims from previously seeded outreach sequences.
UPDATE email_sequences SET steps_json = replace(steps_json,
  'An unclaimed profile on Google Maps also ranks significantly lower than claimed, verified competitors in {{city}}. You might be losing 20-40 customer calls each month just from this.',
  'If the profile is unclaimed, the next step is to verify ownership and confirm that its public business details are accurate. I have not estimated traffic or call loss without analytics evidence.')
WHERE name = 'Google Business Profile Unclaimed Alert';
UPDATE email_sequences SET steps_json = replace(replace(replace(steps_json,
  'Specifically, the mobile page loading speed is sluggish, and several key meta tags and schema data are currently missing. When potential customers visit on their phones, even a 3-second delay causes over 50% to bounce back to Google.',
  'The report should only reference the speed, metadata, schema, and mobile findings that were measured during the live crawl.'),
  'We put together a quick, no-strings teardown report showing exactly what to fix.',
  'We can provide a short report with the crawl evidence, affected pages, and prioritized fixes.'),
  'The 3 biggest quick wins for {{website}} would be:\n\n1. Compressing hero images to cut load time in half\n2. Adding LocalBusiness schema so Google understands your {{city}} service area\n3. Placing a click-to-call button prominently above the fold for mobile visitors',
  'The audit can check image weight, LocalBusiness structured data, and mobile contact actions. I will only recommend these changes when the crawl evidence supports them.')
WHERE name = 'Local Website Speed & SEO Teardown';
UPDATE email_sequences SET steps_json = replace(replace(steps_json,
  'In our experience, having an automated SMS/email follow-up after completing a job can easily bring in 10-15 new 5-star reviews every month on autopilot.',
  'A compliant post-job request process can make it easier for real customers to leave honest feedback. Results depend on job volume and response rates.'),
  'Just following up — 88% of consumers in {{city}} trust online reviews as much as personal recommendations. Adding just 20 more positive reviews could push you into the top 3 Google Maps pack.',
  'Just following up. A review program should focus on recent, authentic customer feedback and timely owner responses; it cannot guarantee a map ranking.')
WHERE name = '5-Star Google Reviews Booster';
UPDATE email_sequences SET steps_json = replace(steps_json,
  'We build high-converting, mobile-ready websites for local businesses that pay for themselves within 30 days.',
  'We build mobile-ready websites for local service businesses with clear service, trust, and contact information.')
WHERE name = 'No-Website Opportunity Pitch';