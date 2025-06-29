# miuchi.chat

A Rust-based chat and voice call application with React frontend featuring terminal-style UI.

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- Make (optional, for convenience commands)

### 1. Environment Setup
```bash
# Clone the repository
git clone <repository-url>
cd miuchi.chat

# Copy environment template
cp .env.development.example .env.development
# Edit .env.development with your GitHub OAuth credentials if needed
```

### 2. Start Development Environment
```bash
# Build and start all services (PostgreSQL, Meilisearch, Backend, Frontend)
make setup    # Build Docker images (first time only)
make dev-up   # Start all services

# Alternative: use docker compose directly
docker compose up -d
```

### 3. Database Migration
```bash
# Run database migrations
docker compose exec backend bash -c "cd /workspace && sqlx migrate run"
```

### 4. Access the Application

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:5173 | React app with WebTUI styling |
| **Backend API** | http://localhost:3001 | Rust axum API server |
| **API Docs** | http://localhost:3001/swagger-ui | Interactive API documentation |
| **Health Check** | http://localhost:3001/health | API health status |
| **DB Health** | http://localhost:3001/db-health | Database connection status |

## 🔧 Development Commands

### Project Management
```bash
make help          # Show available commands
make dev-up        # Start development environment
make dev-down      # Stop development environment
make clean         # Clean up all containers and volumes
```

### Backend Development
```bash
make check         # Check Rust code compilation
make test          # Run Rust tests
make build         # Build Rust application
make db-migrate    # Run database migrations
make db-reset      # Reset database
```

### Direct Container Access
```bash
docker compose exec backend bash    # Access backend container
docker compose exec frontend bash   # Access frontend container
docker compose logs backend         # View backend logs
docker compose logs frontend        # View frontend logs
```

## 📁 Project Structure

```
miuchi.chat/
├── src/                     # Rust backend source
│   ├── main.rs             # Main application entry
│   ├── api/                # REST API endpoints
│   │   ├── auth.rs         # Authentication (GitHub OAuth + JWT)
│   │   ├── chat.rs         # Chat messaging
│   │   └── search.rs       # Message search
│   ├── models/             # Database models
│   │   ├── user.rs         # User model
│   │   ├── room.rs         # Chat room model
│   │   └── message.rs      # Message model
│   └── ws.rs               # WebSocket handling
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React Context (Auth)
│   │   ├── hooks/          # Custom hooks (WebSocket)
│   │   ├── pages/          # Page components
│   │   ├── services/       # API & WebSocket services
│   │   └── types/          # TypeScript definitions
│   ├── package.json        # Frontend dependencies
│   └── vite.config.ts      # Vite configuration
├── migrations/             # Database migrations
├── docker-compose.yml      # Development environment
├── Dockerfile.backend      # Backend container
├── Dockerfile.frontend     # Frontend container
└── Makefile               # Development commands
```

## 🌐 API Endpoints

### Authentication
- `GET /api/auth/login-url` - Get GitHub OAuth login URL
- `GET /api/auth/callback` - OAuth callback handler
- `POST /api/auth/dev-login` - Development login (DEV_MODE only)
- `GET /api/auth/me` - Current user information

### Chat
- `GET /api/chat/{room}/messages` - Get chat messages
- `POST /api/chat/{room}/send` - Send message

### Search
- `GET /api/search?q=query` - Search messages

### WebSocket
- `WS /ws` - WebSocket connection for real-time chat

## 🔧 Port Configuration

| Service | Internal Port | External Port | Purpose |
|---------|---------------|---------------|---------|
| **Backend** | 3000 | 3001 | Rust API server |
| **Frontend** | 5173 | 5173 | Vite dev server |
| **PostgreSQL** | 5432 | 5432 | Database |
| **Meilisearch** | 7700 | 7700 | Search engine |

## 🎨 Technology Stack

### Backend
- **Framework**: Rust + axum
- **Database**: PostgreSQL + sqlx
- **Authentication**: GitHub OAuth + JWT
- **WebSocket**: tokio-tungstenite
- **Search**: Meilisearch
- **Documentation**: utoipa (OpenAPI)

### Frontend
- **Framework**: React + TypeScript
- **Build Tool**: Vite
- **UI Library**: WebTUI CSS Framework
- **Themes**: Gruvbox, Catppuccin, Nord, Vitesse
- **Routing**: React Router
- **HTTP Client**: Axios

## 🚧 Current Implementation Status

### ✅ Completed (Phase 0-5)
- [x] **Environment Setup**: Docker-based development environment
- [x] **OpenAPI Documentation**: Swagger UI with complete API specs  
- [x] **GitHub OAuth Authentication**: JWT-based auth system
- [x] **Chat API**: REST endpoints for message history and posting
- [x] **WebSocket Chat**: Real-time messaging with JWT authentication
- [x] **React Frontend**: WebTUI-styled chat interface with theme support

### 🚧 In Progress (Phase 5)
- [ ] **UI Polish**: WebSocket integration debugging
- [ ] **Chat Functionality**: Full end-to-end testing

### 📋 Next Steps (Phase 6+)
- [ ] **Search Integration**: Meilisearch full-text search
- [ ] **PWA Support**: Service worker and manifest
- [ ] **WebRTC Voice Calls**: Audio communication
- [ ] **TUI Client**: Terminal-based client
- [ ] **Testing & CI/CD**: Comprehensive test suite

## 🐛 Troubleshooting

### Common Issues

1. **Docker Build Fails**
   ```bash
   make clean    # Clean up containers and volumes
   make setup    # Rebuild images
   ```

2. **Database Connection Error**
   ```bash
   docker compose logs postgres  # Check PostgreSQL logs
   make db-reset                # Reset database
   ```

3. **Frontend Not Loading**
   ```bash
   docker compose logs frontend  # Check frontend logs
   docker compose restart frontend
   ```

4. **Permission Issues with npm**
   - The project uses pnpm inside containers to avoid permission issues
   - Node modules are stored in Docker volumes

### Environment Variables

Copy `.env.development` and configure:
```bash
DATABASE_URL=postgresql://postgres:password@postgres:5432/miuchi_chat
MEILI_URL=http://meilisearch:7700
MEILI_MASTER_KEY=development_master_key
DEV_MODE=true
GITHUB_CLIENT_ID_DEV=your_github_client_id
GITHUB_CLIENT_SECRET_DEV=your_github_client_secret
JWT_SECRET=development_jwt_secret_key_12345
```

## 📖 Development Guide

### Adding New API Endpoints
1. Define in `src/api/{module}.rs`
2. Add utoipa annotations for OpenAPI
3. Update router in `src/api/mod.rs`
4. Add to OpenAPI struct in `src/main.rs`

### Database Schema Changes
1. Create new migration: `sqlx migrate add {description}`
2. Run migration: `make db-migrate`
3. Update models in `src/models/`

### Frontend Development
- WebTUI CSS attributes: `is-="component"`, `variant-="style"`, `align-="position"`
- Theme switching via `data-webtui-theme` attribute
- WebSocket connection in `src/hooks/useWebSocket.ts`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.