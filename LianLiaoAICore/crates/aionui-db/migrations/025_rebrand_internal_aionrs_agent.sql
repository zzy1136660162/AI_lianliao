-- Keep the internal runtime identity stable while updating its user-visible
-- catalog name and logo. Assistant definitions are reconciled from this row
-- during startup and when the assistant catalog is listed.
UPDATE agent_metadata
SET name = 'LianLiao AI',
    icon = '/api/assets/logos/brand/ai.svg',
    updated_at = unixepoch('now', 'subsec') * 1000
WHERE id = '632f31d2'
  AND agent_type = 'aionrs'
  AND agent_source = 'internal';
