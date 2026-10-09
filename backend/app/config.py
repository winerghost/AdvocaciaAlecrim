import os


class Config:
    # Sem default: um valor embutido no código é público. Ausente, curta
    # ou de exemplo, a chave derruba o boot - ver app/__init__.py e
    # app/utils/boot_checks.py (opt-in de dev/teste: FLASK_ENV).
    SECRET_KEY = os.environ.get("SECRET_KEY")

    # Chave Fernet (AES-128-CBC + HMAC) usada por app/utils/crypto.py pra
    # criptografar em repouso os campos de PII de Lead (name/phone/email/
    # message) - ver app/models/lead.py. Sem default - ver validação em
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

    # Exceções ao teto acima, aplicadas só nas rotas admin de artigos e de
    # upload (ver app/utils/request_limits.py): o JSON de um artigo carrega
    # o HTML inteiro do texto, e o upload carrega a imagem.
    ARTICLE_MAX_CONTENT_LENGTH = 2 * 1024 * 1024
    UPLOAD_MAX_BYTES = 5 * 1024 * 1024

    # Onde ficam as imagens enviadas pelo painel (POST /api/admin/uploads),
    # servidas em /api/media/<arquivo>. O default é a pasta "uploads" ao
    # lado do pacote `app` - ou seja, backend/uploads em dev e /app/uploads
    # dentro do container, que é exatamente onde o docker-compose.yml monta
    # o volume `uploads_data` (sem isso as imagens somem a cada rebuild).
    UPLOAD_DIR = os.environ.get(
        "UPLOAD_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads"),
    )

    # Carência (em horas) do expurgo de uploads órfãos - ver
    # purge_orphan_uploads.py e app/services/media_cleanup.py. Um arquivo
    # sem referência só é apagado depois disso: a imagem de um rascunho que
    # ainda está sendo escrito (enviada, mas artigo não salvo) é "órfã" até
    # o primeiro "Salvar".
    UPLOAD_ORPHAN_MIN_AGE_HOURS = int(os.environ.get("UPLOAD_ORPHAN_MIN_AGE_HOURS", "24"))

    # Notificação por e-mail de novos leads (opcional - se MAIL_SERVER
    # não for definido, o envio é simplesmente pulado).
    MAIL_SERVER = os.environ.get("MAIL_SERVER")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "true").lower() == "true"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    MAIL_TO = os.environ.get("MAIL_TO", "alecrimrio@gmail.com")
