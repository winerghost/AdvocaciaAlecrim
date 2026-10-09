import logging

from cryptography.fernet import Fernet
from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

from .config import Config
from .extensions import cors, db, limiter, migrate
from .utils.boot_checks import (
    MIN_SECRET_KEY_LENGTH,
    database_url_has_placeholder_password,
    insecure_config_allowed,
    secret_key_problem,
)
from .utils.request_limits import RouteLimitedRequest, reject_out_of_range_ids


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    # Teto de tamanho do body por rota (upload e artigos precisam de mais
    # que os 256 KB do resto da API) - ver app/utils/request_limits.py.
    app.request_class = RouteLimitedRequest
    # Todo `<int:...>` de rota passa a ter o teto do INTEGER do banco.
    app.before_request(reject_out_of_range_ids)
    app.config.from_object(config_class)

    # Segredos de exemplo/fracos derrubam o boot SEMPRE, a não ser com o
    # opt-in explícito de dev/teste (FLASK_ENV=development|testing - ver
    # utils/boot_checks.py). Antes era o contrário: só falhava com
    # FLASK_ENV=production, então qualquer forma de subir o backend fora do
    # docker-compose rodava com chave pública e apenas um warning.
    insecure_allowed = insecure_config_allowed()

    # Um SECRET_KEY previsível permite forjar um token de admin válido
    # (assinatura de itsdangerous.URLSafeTimedSerializer) - crashar o boot
    # aqui é preferível a subir com a autenticação admin efetivamente
    # quebrada.
    secret_key = app.config.get("SECRET_KEY")
    key_problem = secret_key_problem(secret_key)
    if key_problem is not None:
        # Chave ausente falha até com o opt-in: sem ela não há como
        # assinar token nenhum (o login quebraria com erro 500).
        if not insecure_allowed or not secret_key:
            raise RuntimeError(
                f"SECRET_KEY {key_problem}. Defina um valor forte e aleatório "
                f"(mínimo de {MIN_SECRET_KEY_LENGTH} caracteres) em "
                "backend/.env, ex.: "
                '`python -c "import secrets; print(secrets.token_hex(32))"`. '
                "Só em desenvolvimento/testes, FLASK_ENV=development (ou "
                "testing) transforma este erro em aviso."
            )
        logging.getLogger(__name__).warning(
            "SECRET_KEY %s. Tolerado só porque FLASK_ENV indica "
            "desenvolvimento/teste - nunca exponha este serviço assim.",
            key_problem,
        )

    # O docker-compose só exige POSTGRES_PASSWORD não vazia; quem valida o
    # VALOR é a aplicação. A mensagem nunca inclui a senha nem a URL.
    if database_url_has_placeholder_password(app.config.get("SQLALCHEMY_DATABASE_URI")):
        if not insecure_allowed:
            raise RuntimeError(
                "A senha do banco em DATABASE_URL é um valor de exemplo dos "
                ".env.example (público). Troque POSTGRES_PASSWORD no .env da "
                "raiz (ou a DATABASE_URL, se rodar fora do docker-compose) "
                "por uma senha forte e aleatória. Atenção: se o volume do "
                "Postgres já foi criado com a senha antiga, altere-a também "
                "dentro do banco (ALTER USER ... PASSWORD ...). Só em "
                "desenvolvimento/testes, FLASK_ENV=development (ou testing) "
                "transforma este erro em aviso."
            )
        logging.getLogger(__name__).warning(
            "A senha do banco em DATABASE_URL é um valor de exemplo. "
            "Tolerado só porque FLASK_ENV indica desenvolvimento/teste."
        )

    field_key = app.config.get("FIELD_ENCRYPTION_KEY")
    if not field_key:
        # Sem default possível aqui: um valor "de exemplo" só adiaria o
        # mesmo problema pra quando alguém esquecer de trocar. Falha
        # sempre, em qualquer ambiente (nem o opt-in de dev/teste acima
        # dispensa - sem chave não há como gravar um Lead).
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
    from .api.admin_users import bp as admin_users_bp
    from .api.articles import bp as articles_bp
    from .api.content import bp as content_bp
    from .api.health import bp as health_bp
    from .api.leads import bp as leads_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(content_bp)
    app.register_blueprint(leads_bp)
    app.register_blueprint(admin_auth_bp)
    app.register_blueprint(admin_content_bp)
    app.register_blueprint(admin_users_bp)
    app.register_blueprint(articles_bp)

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
