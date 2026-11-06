from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "GSPC Pipavav Reporting System (PS000200)"
    ENV: str = "dev"  # dev | prod
    DEBUG: bool = False

    # SQLite for local dev; docker-compose sets Postgres
    DATABASE_URL: str = "sqlite:///./db.sqlite3"

    # Auth / JWT
    JWT_SECRET: str = "dev-insecure-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Seed
    ADMIN_INITIAL_PASSWORD: str = "ChangeMe123!"
    ADMIN_EMAIL: str = "admin@gspc.local"
    DEMO_PLANT_USER_EMAIL: str = "plant@gspc.local"
    DEMO_PLANT_USER_PASSWORD: str = "ChangeMe123!"
    SEED_DEMO_DATA: bool = True

    # Admin separation: /auth/register creates ADMIN accounts (disable in production
    # once the real admin roster is seeded; first admin always comes from the seeder)
    ALLOW_ADMIN_SELF_REGISTER: bool = True

    # Upload
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    BATCH_REJECT_THRESHOLD_PCT: int = 20

    # Security / network
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    LOGIN_RATE_LIMIT: str = "5/minute"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
