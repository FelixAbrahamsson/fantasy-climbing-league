from app.core.config import settings
from supabase import Client, create_client

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
