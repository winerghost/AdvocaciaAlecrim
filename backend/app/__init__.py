from flask import Flask

from .config import Config
from .extensions import cors, db, limiter, migrate


def create_app(config_class: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}})
    limiter.init_app(app)

    from . import models  # noqa: F401 - garante que os modelos sejam registrados no metadata

    from .api.content import bp as content_bp
    from .api.health import bp as health_bp
    from .api.leads import bp as leads_bp

    app.register_blueprint(health_bp)
    app.register_blueprint(content_bp)
    app.register_blueprint(leads_bp)

    @app.errorhandler(404)
    def not_found(_error):
        return {"error": "not_found"}, 404

    @app.errorhandler(500)
    def server_error(_error):
        return {"error": "internal_server_error"}, 500

    return app
