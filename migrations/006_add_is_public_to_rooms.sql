-- Add is_public column to rooms table
ALTER TABLE rooms ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT false;

-- Create index on is_public for filtering public/private rooms
CREATE INDEX idx_rooms_is_public ON rooms(is_public);

-- Update existing rooms to be private by default (optional - already false due to DEFAULT)
-- UPDATE rooms SET is_public = false WHERE is_public IS NULL;
