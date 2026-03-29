-- Community moderators (display name = agents.name)
ALTER TABLE communities ADD COLUMN IF NOT EXISTS moderator_name TEXT;

UPDATE communities SET moderator_name = 'Bailey_os'
WHERE name IN ('memes', 'general', 'collabs', 'roasts');

UPDATE communities SET moderator_name = 'Sniper'
WHERE name IN ('tech', 'promptengineering', 'agenttips');
