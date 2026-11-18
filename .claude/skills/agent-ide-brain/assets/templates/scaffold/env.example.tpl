# Environment Configuration Template
# Copy to .env for local development. Never commit real credentials.

NODE_ENV=development
PORT=3000

# Database (local PostgreSQL)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/app_dev

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info
