"""Limpeza das imagens enviadas pelo painel (`POST /api/admin/uploads`).

Um upload só "pertence" a um artigo enquanto o artigo aponta para ele - na
capa (`cover_image`) ou em algum `/api/media/<arquivo>` dentro do `content`.
Sem limpeza, tudo que já foi enviado fica para sempre no `UPLOAD_DIR` e
continua público em `/api/media/`, inclusive imagens de artigos excluídos.

Princípio de todas as funções daqui: apagar uma imagem ainda em uso é pior
que deixar um órfão. Na dúvida, o arquivo fica.

- Rascunhos contam: a referência de QUALQUER artigo (publicado ou não)
  protege o arquivo.
- Só se toca em arquivo cujo nome casa com o padrão estrito dos uploads
  (`MEDIA_FILENAME_PATTERN`); qualquer outra coisa no diretório é ignorada.
- Falha ao apagar um arquivo é logada e engolida, nunca propagada.
"""

import logging
import os
import re
import time

from ..extensions import db
from ..models import Article
from ..utils.sanitize import MEDIA_FILENAME_PATTERN

logger = logging.getLogger(__name__)

_MEDIA_FILENAME_RE = re.compile(MEDIA_FILENAME_PATTERN)
# Procura no texto inteiro, não só em `<img src>`: contar uma menção a mais
# como "em uso" é o erro seguro.
_MEDIA_REFERENCE_RE = re.compile(rf"/api/media/({MEDIA_FILENAME_PATTERN})")


def article_media_filenames(cover_image, content) -> set[str]:
    """Nomes de arquivo de upload citados por UM artigo (capa + corpo)."""
    names: set[str] = set()
    for value in (cover_image, content):
        if isinstance(value, str) and value:
            names.update(_MEDIA_REFERENCE_RE.findall(value))
    return names


def referenced_media_filenames() -> set[str]:
    """Nomes de arquivo citados por QUALQUER artigo do banco, publicado ou
    rascunho. Precisa de app context.
    """
    names: set[str] = set()
    rows = db.session.query(Article.cover_image, Article.content).yield_per(50)
    for cover_image, content in rows:
        names |= article_media_filenames(cover_image, content)
    return names


def _delete_files(filenames, upload_dir: str) -> list[str]:
    """Apaga `filenames` de `upload_dir` e devolve os que saíram de fato."""
    removed = []
    for name in sorted(filenames):
        # Mesmo vindo de regex/listdir, confere de novo: o nome vira caminho
        # no disco e nunca pode conter separador ou "..".
        if _MEDIA_FILENAME_RE.fullmatch(name) is None:
            continue
        try:
            os.remove(os.path.join(upload_dir, name))
        except FileNotFoundError:
            continue  # já não existia - nada a fazer
        except OSError:
            logger.exception("Falha ao apagar upload sem referência: %s", name)
            continue
        removed.append(name)
    return removed


def remove_media_if_unreferenced(candidates, upload_dir: str) -> list[str]:
    """Apaga, entre `candidates`, os arquivos que nenhum artigo usa mais.

    Para ser chamada logo DEPOIS do commit que excluiu/editou um artigo,
    com os arquivos que aquele artigo referenciava antes. Sem carência de
    idade: sabemos que eram dele. Um arquivo reaproveitado por outro artigo
    continua referenciado e é poupado.
    """
    candidates = set(candidates)
    if not candidates:
        return []
    orphans = candidates - referenced_media_filenames()
    removed = _delete_files(orphans, upload_dir)
    if removed:
        # `warning` de propósito: o logger do Flask descarta `info` fora do
        # modo debug.
        logger.warning("Uploads sem referência apagados: %s", ", ".join(removed))
    return removed


def find_orphan_uploads(upload_dir: str, min_age_hours: float = 24) -> list[str]:
    """Arquivos de `upload_dir` elegíveis para expurgo: nome no padrão dos
    uploads, sem referência em nenhum artigo e modificados há mais de
    `min_age_hours`. A carência protege a imagem de um rascunho que ainda
    está sendo escrito: ela é enviada na hora em que entra no editor, mas só
    passa a ser "referenciada" quando o artigo é salvo.
    """
    if not os.path.isdir(upload_dir):
        return []

    referenced = referenced_media_filenames()
    cutoff = time.time() - max(float(min_age_hours), 0) * 3600

    orphans = []
    for name in sorted(os.listdir(upload_dir)):
        if _MEDIA_FILENAME_RE.fullmatch(name) is None or name in referenced:
            continue
        path = os.path.join(upload_dir, name)
        try:
            # Só arquivo comum (nada de diretório ou link simbólico).
            if os.path.islink(path) or not os.path.isfile(path):
                continue
            if os.path.getmtime(path) > cutoff:
                continue
        except OSError:
            continue  # sumiu/ilegível no meio do caminho: na dúvida, fica
        orphans.append(name)
    return orphans


def purge_orphan_uploads(upload_dir: str, min_age_hours: float = 24, *, dry_run: bool = False) -> list[str]:
    """Expurgo de manutenção (ver purge_orphan_uploads.py). Devolve os
    nomes apagados - ou, com `dry_run`, os que SERIAM apagados.
    """
    orphans = find_orphan_uploads(upload_dir, min_age_hours)
    if dry_run:
        return orphans
    # Relê as referências imediatamente antes de apagar: um artigo salvo
    # durante a varredura do diretório pode ter passado a usar um deles.
    still_orphans = set(orphans) - referenced_media_filenames()
    return _delete_files(still_orphans, upload_dir)
