"""WSGI entry point; configuration is supplied through server environment variables."""
from backend.app import create_app

app = create_app()
