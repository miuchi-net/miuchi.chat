import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { 
  User, 
  TokenResponse, 
  RoomsResponse, 
  MessagesResponse,
  OnlineUsersResponse 
} from '../../types';

const API_BASE = 'http://localhost:3001/api';

export const handlers = [
  // Auth endpoints
  http.post(`${API_BASE}/auth/dev-login`, () => {
    const response: TokenResponse = {
      access_token: 'mock_token',
      token_type: 'Bearer',
      expires_in: 86400,
    };
    return HttpResponse.json(response);
  }),

  http.get(`${API_BASE}/auth/me`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new HttpResponse(null, { status: 401 });
    }

    const user: User = {
      id: 'user-123',
      username: 'testuser',
      email: 'test@example.com',
      avatar_url: 'https://github.com/images/error/octocat_happy.gif',
    };
    return HttpResponse.json(user);
  }),

  // Chat endpoints
  http.get(`${API_BASE}/chat/rooms`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }

    const response: RoomsResponse = {
      rooms: [
        {
          id: 'room-1',
          name: 'general',
          description: 'General discussion',
          is_public: true,
          created_at: '2023-01-01T00:00:00Z',
        },
        {
          id: 'room-2',
          name: 'private-room',
          description: 'Private room',
          is_public: false,
          created_at: '2023-01-01T01:00:00Z',
        },
      ],
    };
    return HttpResponse.json(response);
  }),

  http.get(`${API_BASE}/chat/:room/messages`, ({ request, params }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }

    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const before = url.searchParams.get('before');

    const messages = Array.from({ length: Math.min(limit, 10) }, (_, i) => ({
      id: `msg-${i}`,
      room_id: params.room as string,
      author_id: 'user-123',
      author_name: 'testuser',
      content: `Test message ${i + 1}`,
      message_type: 'text' as const,
      created_at: new Date().toISOString(),
    }));

    const response: MessagesResponse = {
      messages,
      total: 100,
      has_more: before ? false : true,
    };
    return HttpResponse.json(response);
  }),

  http.post(`${API_BASE}/chat/:room/send`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }

    return HttpResponse.json({
      id: 'new-msg-123',
      timestamp: new Date().toISOString(),
    });
  }),

  http.get(`${API_BASE}/chat/online-users`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }

    const response: OnlineUsersResponse = {
      users: [
        {
          user_id: 'user-123',
          username: 'testuser',
          connected_rooms: ['general'],
          connected_at: new Date().toISOString(),
        },
        {
          user_id: 'user-456',
          username: 'anotheruser',
          connected_rooms: ['general', 'private-room'],
          connected_at: new Date().toISOString(),
        },
      ],
      total_count: 2,
    };
    return HttpResponse.json(response);
  }),

  // Search endpoints
  http.get(`${API_BASE}/search`, ({ request }) => {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new HttpResponse(null, { status: 401 });
    }

    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    return HttpResponse.json({
      results: [
        {
          message: {
            id: 'msg-search-1',
            room_id: 'general',
            author_id: 'user-123',
            author_name: 'testuser',
            content: `Found message containing: ${query}`,
            message_type: 'text',
            created_at: new Date().toISOString(),
          },
          highlights: [`<mark>${query}</mark>`],
          score: 0.95,
        },
      ],
      total_hits: 1,
      query_time_ms: 5,
      has_more: false,
    });
  }),

  // Health endpoints
  http.get('http://localhost:3001/health', () => {
    return HttpResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  }),
];

export const server = setupServer(...handlers);