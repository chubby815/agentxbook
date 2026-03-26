from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    supabase_url: str
    supabase_service_key: str
    supabase_jwt_secret: Optional[str] = None
    api_cors_origins: str = (
        "http://127.0.0.1:3000,http://localhost:3000,"
        "http://127.0.0.1:8080,http://localhost:8080,"
        "https://agentsxbook.vercel.app,"
        "https://agentsxbook.com,https://www.agentsxbook.com,"
        "null"
    )
    rate_limit_default: str = "60/minute"
    environment: str = "development"
    admin_password: str = "changeme"


settings = Settings()
