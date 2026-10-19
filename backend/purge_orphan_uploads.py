"""Expurgo de uploads órfãos (imagens do painel que nenhum artigo usa).

Apaga de `UPLOAD_DIR` os arquivos que:
  - têm o nome no formato gerado por `POST /api/admin/uploads`
    (uuid hex + .jpg/.png/.webp/.gif) - qualquer outro arquivo é ignorado;
  - não são citados por NENHUM artigo, publicado ou rascunho (capa ou
    `/api/media/<arquivo>` no texto);
  - têm mais de `UPLOAD_ORPHAN_MIN_AGE_HOURS` horas (padrão 24,
    configurável em `backend/.env`) - a carência evita apagar a imagem de
    um artigo que ainda está sendo escrito e não foi salvo.

A exclusão/edição de artigo pelo painel já remove na hora as imagens que
eram dele (ver `app/api/articles.py`). Este script recolhe o resto: uploads
de rascunhos abandonados sem salvar e sobras de versões anteriores.

Também recolhe fotos de perfil (`UPLOAD_DIR/avatars/`) que nenhum admin
usa e arquivos `.tmp` esquecidos, com mais de 1 h - sobra de uma queda no
meio da troca de foto (ver `app/services/avatar.py`).

Não roda sozinho: precisa de um agendador externo (cron na VPS), igual ao
`purge_leads.py`.

Uso:
    python purge_orphan_uploads.py            # apaga de verdade
    python purge_orphan_uploads.py --dry-run  # só mostra o que seria apagado
    python purge_orphan_uploads.py --min-age-hours 72
    # ou, com o compose já rodando:
    docker compose exec backend python purge_orphan_uploads.py --dry-run
"""

import argparse
import os

from app import create_app
from app.models import AdminUser
from app.services.avatar import purge_orphan_avatars
from app.services.media_cleanup import purge_orphan_uploads

AVATAR_ORPHAN_MIN_AGE_SECONDS = 3600


def _purge_avatars(dry_run: bool) -> list[str]:
    referenced = {row[0] for row in AdminUser.query.with_entities(AdminUser.avatar).all() if row[0]}
    names = purge_orphan_avatars(referenced, AVATAR_ORPHAN_MIN_AGE_SECONDS, dry_run=dry_run)
    if names:
        prefix = "[dry-run] seriam apagadas" if dry_run else "Apagadas"
        print(f"{prefix} {len(names)} foto(s) de perfil sem dono: " + ", ".join(names))
    return names


def run(dry_run: bool = False, min_age_hours: float | None = None, app=None) -> int:
    # `app` é injetável só pra testes (mesmo padrão de purge_leads.py) - em
    # uso real (CLI/cron) sempre cria um app de verdade via create_app().
    app = app or create_app()
    with app.app_context():
        if min_age_hours is None:
            min_age_hours = app.config["UPLOAD_ORPHAN_MIN_AGE_HOURS"]
        upload_dir = os.path.abspath(app.config["UPLOAD_DIR"])
        _purge_avatars(dry_run)

        names = purge_orphan_uploads(upload_dir, min_age_hours, dry_run=dry_run)
        count = len(names)

        if count == 0:
            print(f"Nenhum upload órfão elegível pro expurgo (carência: {min_age_hours} h).")
            return 0

        if dry_run:
            print(
                f"[dry-run] {count} arquivo(s) seriam apagados de {upload_dir} "
                f"(sem referência em nenhum artigo, mais de {min_age_hours} h): "
                + ", ".join(names)
            )
            return count

        print(
            f"Expurgo: {count} upload(s) órfão(s) apagados de {upload_dir} "
            f"(carência: {min_age_hours} h): " + ", ".join(names)
        )
        return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Só mostra o que seria apagado, sem apagar de verdade.",
    )
    parser.add_argument(
        "--min-age-hours",
        type=float,
        default=None,
        help="Carência em horas (padrão: UPLOAD_ORPHAN_MIN_AGE_HOURS, 24).",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, min_age_hours=args.min_age_hours)
