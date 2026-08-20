import logging

from flask import Flask

from .config import Config
from .extensions import cors, db, limiter, migrate

_DEFAULT_SECRET_KEY = "change-me-in-production"


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    if app.config.get("SECRET_KEY") == _DEFAULT_SECRET_KEY:
        # Não derruba o servidor (diferente do POSTGRES_PASSWORD, que o
        # compose já força via `:?`) porque não temos certeza de que todo
        # ambiente já trocou esse valor - um crash aqui poderia derrubar
        # produção sem aviso. Mas isso precisa ser corrigido em
        # backend/.env antes de ir pra produção de verdade: SECRET_KEY
        # fraco/previsível enfraquece qualquer coisa que dependa dele
        # (assinatura de sessão, tokens).
        logging.getLogger(__name__).warning(
            "SECRET_KEY está usando o valor padrão inseguro ('%s'). "
            "Defina um valor forte e aleatório em backend/.env antes de "
            "expor este serviço em produção.",
            _DEFAULT_SECRET_KEY,
        )

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

    return app
