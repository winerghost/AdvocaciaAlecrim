import logging
import os

from cryptography.fernet import Fernet
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .extensions import cors, db, limiter, migrate

_DEFAULT_SECRET_KEY = "change-me-in-production"


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    if app.config.get("SECRET_KEY") == _DEFAULT_SECRET_KEY:
        if os.environ.get("FLASK_ENV") == "production":
            # Em produção (marcada explicitamente via FLASK_ENV=production,
            # ver docker-compose.yml) um SECRET_KEY previsível permite
            # forjar um token de admin válido (assinatura de
            # itsdangerous.URLSafeTimedSerializer) - crashar o boot aqui é
            # preferível a subir com a autenticação admin efetivamente
            # quebrada. Fora de produção (dev/testes), só avisa - ver
            # warning abaixo.
            raise RuntimeError(
                "SECRET_KEY está usando o valor padrão inseguro "
                f"('{_DEFAULT_SECRET_KEY}'). Defina um valor forte e "
                "aleatório em backend/.env antes de subir em produção."
            )
        logging.getLogger(__name__).warning(
            "SECRET_KEY está usando o valor padrão inseguro ('%s'). "
            "Defina um valor forte e aleatório em backend/.env antes de "
            "expor este serviço em produção.",
            _DEFAULT_SECRET_KEY,
        )

    field_key = app.config.get("FIELD_ENCRYPTION_KEY")
    if not field_key:
        # Sem default possível aqui (diferente de SECRET_KEY): um valor
        # "de exemplo" só adiaria o mesmo problema pra quando alguém
        # esquecer de trocar, e essa é uma feature nova (nenhum deploy
        # existente depende de um comportamento tolerante) - falha sempre,
        # não só em produção.
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY não está definida. Ela criptografa os "
            "dados pessoais de Lead (nome/telefone/e-mail/mensagem) em "
            "repouso - gere uma com "
            "`python -c \"from cryptography.fernet import Fernet; "
            'print(Fernet.generate_key().decode())"` e defina em '
            "backend/.env. GUARDE essa chave em lugar seguro e separado do "
            "backup do banco: perdê-la torna os dados de leads já salvos "
            "permanentemente ilegíveis."
        )
    try:
        Fernet(field_key)
    except Exception as exc:
        raise RuntimeError(
            "FIELD_ENCRYPTION_KEY não é uma chave Fernet válida - gere uma "
            "nova com `python -c \"from cryptography.fernet import Fernet; "
            'print(Fernet.generate_key().decode())"`.'
        ) from exc

    # O Flask só é alcançado pela rede interna do docker-compose, sempre
    # através do proxy same-origin do Next (frontend/lib/adminProxy.ts,
    # app/api/leads/route.ts) - nunca diretamente pela internet. `x_for=1`
    # confia no único hop conhecido (o container do Next) para reescrever
    # `request.remote_addr` a partir de X-Forwarded-For, senão o
    # Flask-Limiter (rate limit de /login e /leads) vê sempre o IP interno
    # do container e o limite vira efetivamente global em vez de por
    # atacante.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1)  # type: ignore[method-assign]

    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    limiter.init_app(app)

    from . import models  # noqa: F401 - garante que os modelos sejam registrados no metadata

    from .api.admin_auth import bp as admin_auth_bp
    from .api.admin_content import bp as admin_content_bp
    from .api.content import bp as content_bp
    from .api.health import bp as health_bp
    from .api.leads import bp as leads_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(content_bp)
    app.register_blueprint(leads_bp)
    app.register_blueprint(admin_auth_bp)
    app.register_blueprint(admin_content_bp)

    @app.errorhandler(404)
    def not_found(_error):
        return {"error": "not_found"}, 404

    @app.errorhandler(500)
    def server_error(_error):
        return {"error": "internal_server_error"}, 500

    @app.after_request
    def set_security_headers(response):
        # A API só responde JSON, nunca HTML, mas esses headers são baratos
        # e ajudam como defesa em profundidade (ex.: um proxy/cliente mal
        # configurado tentando renderizar a resposta, ou o backend um dia
        # sendo exposto publicamente sem esse cuidado ter sido revisitado).
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        return response

    return app
