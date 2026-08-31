import os


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production")

    # Chave Fernet (AES-128-CBC + HMAC) usada por app/utils/crypto.py pra
    # criptografar em repouso os campos de PII de Lead (name/phone/email/
    # message) - ver app/models/lead.py. Sem default: diferente de
    # SECRET_KEY (que tem histórico de deploys sem esse valor trocado),
    # essa é uma feature nova sem nenhum deploy dependendo dela ainda, então
    # dá pra ser estrita desde o primeiro dia - ver validação em
    # app/__init__.py, que derruba o boot se isso não estiver definido.
    FIELD_ENCRYPTION_KEY = os.environ.get("FIELD_ENCRYPTION_KEY")

    # Retenção de leads (LGPD) - ver purge_leads.py. Leads com status
    # diferente de "convertido" e mais antigos que isso são elegíveis pra
    # expurgo automático quando o script roda (não roda sozinho - precisa
    # de um cron externo, ver DEPLOY-HOSTINGER.md).
    LEAD_RETENTION_DAYS = int(os.environ.get("LEAD_RETENTION_DAYS", "180"))

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
