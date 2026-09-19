UPDATE campaign_templates
SET body = REPLACE(body, 'SMBify Lead OS', 'SMBify OS'),
    follow_up_body = REPLACE(follow_up_body, 'SMBify Lead OS', 'SMBify OS'),
    body_html = REPLACE(body_html, 'SMBify Lead OS', 'SMBify OS'),
    follow_up_body_html = REPLACE(follow_up_body_html, 'SMBify Lead OS', 'SMBify OS'),
    updated_at = datetime('now')
WHERE body LIKE '%SMBify Lead OS%'
   OR follow_up_body LIKE '%SMBify Lead OS%'
   OR body_html LIKE '%SMBify Lead OS%'
   OR follow_up_body_html LIKE '%SMBify Lead OS%';