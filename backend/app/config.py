import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///dev.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]

    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    # Blindagem contra payloads absurdamente grandes (ex.: alguém mandando
    # um body de vários MB para o /api/leads). Nenhum endpoint atual
    # precisa de mais que uns poucos KB de JSON.
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", str(256 * 1024)))

    # Notificação por e-mail de novos leads (opcional - se MAIL_SERVER
    # não for definido, o envio é simplesmente pulado).
    MAIL_SERVER = os.environ.get("MAIL_SERVER")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_TO = os.environ.get("MAIL_TO", "alecrimrio@gmail.com")
