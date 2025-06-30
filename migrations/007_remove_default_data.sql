-- Remove default development data that was previously inserted
-- This migration cleans up the default data from migration 005

-- Remove sample messages
DELETE FROM messages WHERE user_id = '00000000-0000-0000-0000-000000000001'::UUID;

-- Remove dev user from general room
DELETE FROM room_members 
WHERE room_id = '00000000-0000-0000-0000-000000000001'::UUID 
AND user_id = '00000000-0000-0000-0000-000000000001'::UUID;

-- Remove default general room
DELETE FROM rooms WHERE id = '00000000-0000-0000-0000-000000000001'::UUID;

-- Remove default development user
DELETE FROM users WHERE id = '00000000-0000-0000-0000-000000000001'::UUID;
