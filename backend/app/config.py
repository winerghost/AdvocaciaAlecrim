import os

# ---------------------------------------------------------------------------
# Assistente de IA dos artigos (OPENAI_*) - leitura tolerante.
#
# O recurso é opcional, então NADA nestas variáveis pode derrubar o backend:
# este módulo é avaliado no import, e um `int(os.environ[...])` com valor
# ilegível levaria o site inteiro junto. Cada função abaixo aceita qualquer
# coisa (ausente, vazio, lixo), nunca levanta exceção e cai num default
# seguro. O serviço (app/services/article_ai.py) passa os valores por elas de
# novo a cada pedido, então o mesmo vale para o que estiver em `app.config`.
# ---------------------------------------------------------------------------

OPENAI_MODEL_DEFAULT = "gpt-6.1-sol"
OPENAI_REASONING_EFFORT_DEFAULT = "low"
# Valores que a API aceita em `reasoning.effort` (nem todo modelo aceita
# todos). Qualquer outra coisa é erro de digitação e vira o default.
OPENAI_REASONING_EFFORTS = ("none", "minimal", "low", "medium", "high", "xhigh", "max")

# O proxy na frente do site corta a requisição em 60 s: a chamada à OpenAI
# precisa desistir antes disso para o painel receber o nosso erro
# (`ai_timeout`) em vez de um 504 genérico do proxy.
OPENAI_TIMEOUT_DEFAULT = 50
OPENAI_TIMEOUT_MIN = 5
OPENAI_TIMEOUT_MAX = 55


def openai_api_key(raw) -> str | None:
    """Chave sem espaços nas pontas e sem aspas em volta (comum ao copiar
    `OPENAI_API_KEY="sk-..."` para um env_file). Ausente, vazia ou só
    espaços = `None` = recurso desligado.
    """
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1].strip()
    return value or None


def openai_model(raw) -> str:
    if not isinstance(raw, str):
        return OPENAI_MODEL_DEFAULT
    return raw.strip() or OPENAI_MODEL_DEFAULT


def openai_reasoning_effort(raw) -> str:
    """String vazia = não enviar o parâmetro `reasoning` (para apontar
    OPENAI_MODEL a um modelo que o rejeita). Ausente ou valor desconhecido =
    default.
    """
    if not isinstance(raw, str):
        return OPENAI_REASONING_EFFORT_DEFAULT
    value = raw.strip().lower()
    if value == "" or value in OPENAI_REASONING_EFFORTS:
        return value
    return OPENAI_REASONING_EFFORT_DEFAULT


def openai_timeout(raw) -> int:
    """Segundos de espera pela OpenAI: valor ausente/ilegível vira o default
    e o resto é limitado à faixa acima.
    """
    try:
        value = int(str(raw).strip())
    except (ValueError, TypeError, OverflowError):
        return OPENAI_TIMEOUT_DEFAULT
    return max(OPENAI_TIMEOUT_MIN, min(OPENAI_TIMEOUT_MAX, value))


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

    # Assistente de escrita dos artigos (POST /api/admin/articles/ai - ver
    # app/services/article_ai.py). Opcional, igual ao MAIL_SERVER: sem
    # OPENAI_API_KEY o app sobe normalmente e a rota responde 503
    # `ai_not_configured`. A chave nunca tem default e nunca vai para log.
    # Leitura sempre pelas funções tolerantes do topo do arquivo.
    OPENAI_API_KEY = openai_api_key(os.environ.get("OPENAI_API_KEY"))
    OPENAI_MODEL = openai_model(os.environ.get("OPENAI_MODEL"))
    OPENAI_REASONING_EFFORT = openai_reasoning_effort(os.environ.get("OPENAI_REASONING_EFFORT"))
    OPENAI_TIMEOUT_SECONDS = openai_timeout(os.environ.get("OPENAI_TIMEOUT_SECONDS"))
