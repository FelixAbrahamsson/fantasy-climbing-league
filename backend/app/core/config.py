from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "Fantasy Climbing League"
    API_V1_STR: str = "/api/v1"
    SUPABASE_URL: str
    SUPABASE_KEY: str

    class Config:
        case_sensitive = True
        env_file = ".env"


settings = Settings()
