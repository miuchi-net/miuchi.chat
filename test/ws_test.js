import WebSocket from 'ws';
import fetch from 'node-fetch';

async function getDevToken() {
    const response = await fetch('http://localhost:3001/api/auth/dev-login', {
        method: 'POST'
    });
    const data = await response.json();
    return data.access_token;
}

async function testWebSocket() {
    try {
        // Get JWT token
        console.log('Getting dev token...');
        const token = await getDevToken();
        console.log('Token:', token.substring(0, 20) + '...');

        // Connect to WebSocket
        const ws = new WebSocket(`ws://localhost:3001/ws?token=${encodeURIComponent(token)}`);

        ws.on('open', function() {
            console.log('✅ WebSocket connected');

            // Join room
            const joinMessage = {
                type: 'join_room',
                room: 'general',
                token: token
            };
            
            console.log('📍 Joining room...');
            ws.send(JSON.stringify(joinMessage));

            // Send a test message after a short delay
            setTimeout(() => {
                const testMessage = {
                    type: 'send_message',
                    room: 'general',
                    content: 'Hello from WebSocket test!',
                    message_type: 'text'
                };
                
                console.log('📤 Sending test message...');
                ws.send(JSON.stringify(testMessage));
            }, 1000);

            // Close after 5 seconds
            setTimeout(() => {
                console.log('🔌 Closing connection...');
                ws.close();
            }, 5000);
        });

        ws.on('message', function(data) {
            const message = JSON.parse(data);
            console.log('📨 Received:', JSON.stringify(message, null, 2));
        });

        ws.on('close', function() {
            console.log('🔌 WebSocket disconnected');
        });

        ws.on('error', function(error) {
            console.error('❌ WebSocket error:', error);
        });

    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testWebSocket();