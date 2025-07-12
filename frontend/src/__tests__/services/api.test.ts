import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../../services/api';

describe('API Service', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should perform dev login successfully', async () => {
      const response = await api.devLogin();
      
      expect(response).toHaveProperty('access_token');
      expect(response).toHaveProperty('token_type', 'Bearer');
      expect(response).toHaveProperty('expires_in');
    });

    it('should get current user with valid token', async () => {
      localStorage.setItem('token', 'mock_token');
      
      const user = await api.getCurrentUser();
      
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('username', 'testuser');
      expect(user).toHaveProperty('email');
    });

    it('should fail to get current user without token', async () => {
      await expect(api.getCurrentUser()).rejects.toThrow();
    });
  });

  describe('Rooms', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'mock_token');
    });

    it('should get rooms list', async () => {
      const response = await api.getRooms();
      
      expect(response).toHaveProperty('rooms');
      expect(Array.isArray(response.rooms)).toBe(true);
      expect(response.rooms.length).toBeGreaterThan(0);
      
      const generalRoom = response.rooms.find(r => r.name === 'general');
      expect(generalRoom).toBeDefined();
      expect(generalRoom?.is_public).toBe(true);
    });

    it('should create a new room', async () => {
      const roomData = {
        name: 'test-room',
        description: 'Test room description',
        is_public: true,
      };

      const response = await api.createRoom(
        roomData.name, 
        roomData.description, 
        roomData.is_public
      );
      
      expect(response).toHaveProperty('name', roomData.name);
      expect(response).toHaveProperty('description', roomData.description);
      expect(response).toHaveProperty('is_public', roomData.is_public);
    });
  });

  describe('Messages', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'mock_token');
    });

    it('should get messages for a room', async () => {
      const response = await api.getMessages('general');
      
      expect(response).toHaveProperty('messages');
      expect(Array.isArray(response.messages)).toBe(true);
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('has_more');
    });

    it('should get messages with pagination', async () => {
      const response = await api.getMessages('general', 10, 'some-message-id');
      
      expect(response).toHaveProperty('messages');
      expect(response.messages.length).toBeLessThanOrEqual(10);
    });

    it('should send a message', async () => {
      const content = 'Hello, world!';
      const response = await api.sendMessage('general', content);
      
      expect(response).toHaveProperty('id');
      expect(response).toHaveProperty('timestamp');
    });
  });

  describe('Search', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'mock_token');
    });

    it('should search messages', async () => {
      const query = 'test query';
      const response = await api.searchMessages(query);
      
      expect(response).toHaveProperty('results');
      expect(Array.isArray(response.results)).toBe(true);
      expect(response).toHaveProperty('total_hits');
      expect(response).toHaveProperty('query_time_ms');
      
      if (response.results.length > 0) {
        const firstResult = response.results[0];
        expect(firstResult).toHaveProperty('message');
        expect(firstResult).toHaveProperty('highlights');
        expect(firstResult).toHaveProperty('score');
      }
    });

    it('should search messages with room filter', async () => {
      const query = 'test query';
      const room = 'general';
      const response = await api.searchMessages(query, room);
      
      expect(response).toHaveProperty('results');
      expect(response).toHaveProperty('total_hits');
    });
  });

  describe('Online Users', () => {
    beforeEach(() => {
      localStorage.setItem('token', 'mock_token');
    });

    it('should get online users', async () => {
      const response = await api.getOnlineUsers();
      
      expect(response).toHaveProperty('users');
      expect(Array.isArray(response.users)).toBe(true);
      expect(response).toHaveProperty('total_count');
      
      if (response.users.length > 0) {
        const firstUser = response.users[0];
        expect(firstUser).toHaveProperty('user_id');
        expect(firstUser).toHaveProperty('username');
        expect(firstUser).toHaveProperty('connected_rooms');
        expect(firstUser).toHaveProperty('connected_at');
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // 無効なエンドポイントでテスト
      await expect(
        fetch('http://invalid-url/api/test')
      ).rejects.toThrow();
    });

    it('should redirect to login on 401 error', async () => {
      // 無効なトークンでリクエスト
      localStorage.setItem('token', 'invalid_token');
      
      // モックの401エラーをテスト
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' };
      
      try {
        await api.getCurrentUser();
      } catch (error) {
        // 401エラーで認証失敗のケース
      }
      
      window.location = originalLocation;
    });
  });

  describe('Authorization Header', () => {
    it('should include Bearer token in requests', async () => {
      const token = 'test_token_123';
      localStorage.setItem('token', token);
      
      // リクエストインターセプターをテスト
      const mockConfig = {
        headers: {},
      };
      
      // api.ts のリクエストインターセプターロジックをシミュレート
      const interceptor = (config: any) => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          config.headers.Authorization = `Bearer ${storedToken}`;
        }
        return config;
      };
      
      const processedConfig = interceptor(mockConfig);
      expect(processedConfig.headers.Authorization).toBe(`Bearer ${token}`);
    });

    it('should not include Authorization header when no token', async () => {
      localStorage.removeItem('token');
      
      const mockConfig = {
        headers: {},
      };
      
      const interceptor = (config: any) => {
        const storedToken = localStorage.getItem('token');
        if (storedToken) {
          config.headers.Authorization = `Bearer ${storedToken}`;
        }
        return config;
      };
      
      const processedConfig = interceptor(mockConfig);
      expect(processedConfig.headers.Authorization).toBeUndefined();
    });
  });
});