"""Reset de emergência do MFA (TOTP) de um administrador.

Para quando o admin perdeu o autenticador E os códigos de recuperação (ou a
`FIELD_ENCRYPTION_KEY` foi trocada e o segredo ficou ilegível). Zera o
segredo, os códigos de recuperação e o estado do MFA, e sobe a versão do
token: toda sessão e todo `mfa_token` pendente dessa conta deixam de valer.
A senha NÃO é alterada. Depois do reset o admin entra só com a senha e
pode reativar o MFA em /admin/seguranca.

Só quem tem acesso ao servidor consegue rodar - é a recuperação "fora da
banda". Exige `--yes` de propósito (nada acontece sem confirmação explícita).
Não imprime segredo nem código nenhum.

Uso:
    python reset_mfa.py admin@exemplo.com          # só mostra o que faria
    python reset_mfa.py admin@exemplo.com --yes    # aplica
    # ou, com o compose já rodando:
    docker compose exec backend python reset_mfa.py admin@exemplo.com --yes
"""

import argparse
import sys

from app import create_app
from app.extensions import db
from app.models import AdminUser


def run(email: str, confirmed: bool = False, app=None) -> int:
    """0 = ok (ou nada a fazer sem `--yes`), 1 = admin não encontrado."""
    # `app` é injetável só pra testes - em uso real cria o app de verdade.
    app = app or create_app()
    with app.app_context():
        admin = AdminUser.query.filter_by(email=email.strip().lower()).first()
        if admin is None:
            print("Administrador não encontrado.")
            return 1

        if not confirmed:
            state = "ativo" if admin.totp_enabled else "desativado"
            print(
                f"[sem --yes] MFA do admin #{admin.id} está {state}. "
                "Repita com --yes para resetar."
            )
            return 0

        AdminUser.query.filter_by(id=admin.id).update(
            {
                AdminUser.totp_secret_enc: None,
                AdminUser.totp_enabled: False,
                AdminUser.totp_last_step: None,
                AdminUser.recovery_codes_hash: None,
                AdminUser.token_version: AdminUser.token_version + 1,
            },
            synchronize_session=False,
        )
        db.session.commit()
        app.logger.warning("AUDIT mfa_reset_cli admin=#%s", admin.id)
        print(f"MFA do admin #{admin.id} resetado; sessões anteriores invalidadas.")
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Reseta o MFA de um administrador.")
    parser.add_argument("email", help="e-mail do administrador")
    parser.add_argument("--yes", action="store_true", help="confirma o reset")
    args = parser.parse_args()
    sys.exit(run(args.email, confirmed=args.yes))
