"""Explicit Flask instance for Vercel; routes and security remain in the factory."""
from flask import Flask
from backend.app import create_app

app = Flask(__name__, static_folder=None)
create_app(application=app)
