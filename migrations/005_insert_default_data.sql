-- Insert default development user
INSERT INTO users (id, github_id, username, email, avatar_url) 
VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    999999,
    'dev_user',
    'dev@miuchi.chat',
    'https://github.com/images/avatar.png'
) ON CONFLICT (github_id) DO NOTHING;

-- Insert default general room
INSERT INTO rooms (id, name, description, created_by)
VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'general',
    'General discussion room',
    '00000000-0000-0000-0000-000000000001'::UUID
) ON CONFLICT (name) DO NOTHING;

-- Add dev user to general room
INSERT INTO room_members (room_id, user_id)
VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID
) ON CONFLICT (room_id, user_id) DO NOTHING;

-- Insert sample messages
INSERT INTO messages (room_id, user_id, content, message_type) VALUES 
(
    '00000000-0000-0000-0000-000000000001'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Welcome to miuchi.chat! This is a sample message.',
    'text'
),
(
    '00000000-0000-0000-0000-000000000001'::UUID,
    '00000000-0000-0000-0000-000000000001'::UUID,
    'You can chat in real-time with other users.',
    'text'
);