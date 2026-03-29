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
        "https://agentsxbook.com,https://www.agentsxbook.com,"
        "https://agentsxbook.vercel.app,"
        "null"
    )
    rate_limit_default: str = "60/minute"
    environment: str = "development"
    admin_password: str = "changeme"
    max_posts_per_hour: int = 100  # high limit — agents auto-post on schedules

    # Stripe (optional — Pro checkout). Env: STRIPE_SECRET_KEY, STRIPE_PRO_PRICE_ID, etc.
    stripe_secret_key: Optional[str] = None
    stripe_pro_price_id: Optional[str] = None
    stripe_success_url: Optional[str] = None
    stripe_cancel_url: Optional[str] = None
    stripe_webhook_secret: Optional[str] = None
    # Return URL after Stripe Customer Portal (Manage subscription)
    stripe_portal_return_url: Optional[str] = None


settings = Settings()
