from datetime import datetime, timezone

from ..extensions import db
from ..utils.crypto import EncryptedText


class AdminUser(db.Model):
    """Administrador do painel (`/admin`). Há mais de um: o bootstrap
    (`seed.py`) cria o primeiro e os demais são criados/excluídos por um admin
    já autenticado e reautenticado (`api/admin_users.py`). Não há cadastro
    público nem papéis: todo admin tem o mesmo nível de acesso.
    """

    __tablename__ = "admin_users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    # Sobe 1 a cada logout; todo token leva a versão em que foi emitido e
    # deixa de valer quando ela muda (ver utils/auth.py). Em banco que já
    # existia, a coluna entra por utils/schema_upgrades.py.
    token_version = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    # MFA (TOTP) - ver utils/mfa.py. O segredo fica cifrado em repouso
    # (Fernet, mesma FIELD_ENCRYPTION_KEY dos leads) e nunca é devolvido
    # depois do setup. Em banco que já existia, as colunas entram por
    # utils/schema_upgrades.py.
    totp_secret_enc = db.Column(EncryptedText, nullable=True)
    totp_enabled = db.Column(db.Boolean, nullable=False, default=False, server_default=db.false())
    # Último passo de 30 s aceito: recusa reuso do mesmo código (anti-replay).
    totp_last_step = db.Column(db.Integer, nullable=True)
    # JSON: lista de hashes (werkzeug) dos códigos de recuperação restantes.
    recovery_codes_hash = db.Column(db.Text, nullable=True)
    # Perfil (Configurações > Perfil). Em banco que já existia, as colunas
    # entram por utils/schema_upgrades.py.
    name = db.Column(db.String(120), nullable=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    password_changed_at = db.Column(db.DateTime, nullable=True)
    # NULL | "preset:<id>" | "<32 hex>.webp" - ver app/services/avatar.py.
    avatar = db.Column(db.String(80), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    def to_dict(self) -> dict:
        # NUNCA serializar password_hash, mesmo em rotas administrativas.
        return {"email": self.email}
