"""Artigos (blog): CRUD do painel, upload de imagens e leitura pública.

Fica num blueprint próprio (em vez de `admin_content.py`/`content.py`)
porque junta três coisas que só fazem sentido lado a lado: o CRUD admin, o
upload das imagens usadas no texto e as rotas públicas que servem os dois.
"""

import math
import os
import re
import uuid

from flask import Blueprint, current_app, request, send_from_directory
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError
from werkzeug.exceptions import NotFound, RequestEntityTooLarge

from ..extensions import db
from ..models import Article
from ..models.article import utcnow
from ..schemas.article import CONTENT_MAX, SLUG_MAX, ArticleSchema, slugify
from ..services.media_cleanup import (
    article_media_filenames,
    purge_orphan_uploads,
    remove_media_if_unreferenced,
)
from ..utils.auth import require_admin
from ..utils.sanitize import MEDIA_FILENAME_PATTERN, sanitize_html
from .admin_content import _apply_partial

bp = Blueprint("articles", __name__, url_prefix="/api")

article_schema = ArticleSchema()

_DEFAULT_PER_PAGE = 9
_MAX_PER_PAGE = 50
# Teto da página: sem ele `?page=<número gigante>` virava um OFFSET maior
# que o inteiro do banco e a listagem pública respondia 500. Bem acima de
# qualquer quantidade real de artigos; passar disso só devolve lista vazia.
_MAX_PAGE = 100_000

# Usado quando o título não rende nenhum caractere de slug (ex.: "!!!").
_FALLBACK_SLUG = "artigo"

_MEDIA_FILENAME_RE = re.compile(MEDIA_FILENAME_PATTERN)

_MIMETYPES = {
    "jpg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}


# ----------------------------------------------------------------- helpers --

def _unique_slug(base: str, *, exclude_id: int | None = None) -> str:
    """Devolve `base` se estiver livre; senão `base-2`, `base-3`... O
    sufixo conta dentro do limite da coluna (o `base` é encurtado se
    preciso). `exclude_id` ignora o próprio artigo numa edição.
    """
    base = base or _FALLBACK_SLUG
    candidate = base
    counter = 2
    while True:
        query = Article.query.filter(Article.slug == candidate)
        if exclude_id is not None:
            query = query.filter(Article.id != exclude_id)
        if query.first() is None:
            return candidate
        suffix = f"-{counter}"
        candidate = base[: SLUG_MAX - len(suffix)].rstrip("-") + suffix
        counter += 1


def _slug_taken(slug: str, *, exclude_id: int | None = None) -> bool:
    query = Article.query.filter(Article.slug == slug)
    if exclude_id is not None:
        query = query.filter(Article.id != exclude_id)
    return query.first() is not None


def _ensure_published_at(article: Article) -> None:
    """Publicar sem data = publica agora. Despublicar não mexe na data (a
    de primeira publicação é preservada se o artigo voltar ao ar).
    """
    if article.published and article.published_at is None:
        article.published_at = utcnow()


def _commit_or_slug_conflict():
    """Commit com rede de segurança para a corrida "dois requests criando
    o mesmo slug ao mesmo tempo": a checagem prévia passa nos dois e o
    UNIQUE do banco barra o segundo.
    """
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return {"error": "slug_already_exists"}, 400
    return None


def _public_query():
    # Visível no site = marcado como publicado E com data de publicação já
    # alcançada (data futura = agendado, ainda não aparece).
    return Article.query.filter(
        Article.published.is_(True),
        Article.published_at.isnot(None),
        Article.published_at <= utcnow(),
    )


def _article_payload(article: Article) -> dict:
    """Artigo completo para resposta, com o `content` sanitizado DE NOVO.

    A sanitização "de verdade" é a da escrita (ArticleSchema). Esta é a
    segunda camada: o HTML vai para um `dangerouslySetInnerHTML` no site e
    no painel, então um registro alterado direto no banco, importado por
    fora ou gravado por uma versão antiga (mais permissiva) do sanitizador
    não pode chegar cru ao navegador. `sanitize_html` é idempotente: para
    conteúdo gravado pela API atual, o resultado é idêntico ao que está no
    banco.
    """
    data = article.to_dict()
    data["content"] = sanitize_html(article.content or "")
    return data


def _cleanup_media(filenames: set[str]) -> None:
    """Apaga do disco os uploads de `filenames` que nenhum artigo usa mais.
    Chamado DEPOIS do commit, só com arquivos que eram do artigo recém
    alterado/excluído. Nunca derruba a requisição: o artigo já foi salvo, e
    um órfão que sobrar é recolhido depois pelo purge_orphan_uploads.py.
    """
    if not filenames:
        return
    try:
        remove_media_if_unreferenced(filenames, _upload_dir())
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Falha ao limpar uploads sem referência")


def _purge_old_orphans() -> None:
    """Usado na EDIÇÃO de artigo. Diferente da exclusão, aqui não apagamos na
    hora a imagem que saiu do texto: o admin pode desfazer (Ctrl+Z) e salvar de
    novo, ou ter o mesmo artigo aberto em outra aba, e a imagem voltaria
    quebrada. Só recolhe órfãos que já passaram da carência
    (UPLOAD_ORPHAN_MIN_AGE_HOURS), a mesma regra do purge_orphan_uploads.py.
    """
    try:
        purge_orphan_uploads(_upload_dir(), current_app.config["UPLOAD_ORPHAN_MIN_AGE_HOURS"])
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Falha ao recolher uploads órfãos")


def _positive_int_arg(name: str, default: int, maximum: int) -> int:
    """Inteiro >= 1 da query string, limitado a `maximum`. Qualquer coisa
    que não seja só dígitos ASCII (vazio, sinal, espaço, "1_000", dígitos
    de outro alfabeto - tudo que o `int()` aceitaria) cai no `default`.
    """
    raw = request.args.get(name)
    if raw is None or not (raw.isascii() and raw.isdigit()):
        return default
    # Tamanho conferido antes do int(): número de dezenas de dígitos já é
    # com certeza maior que o teto.
    value = int(raw) if len(raw) <= 18 else maximum
    if value < 1:
        return default
    return min(value, maximum)


def _upload_dir() -> str:
    return os.path.abspath(current_app.config["UPLOAD_DIR"])


def _detect_image_extension(data: bytes) -> str | None:
    """Tipo da imagem pelos magic bytes do CONTEÚDO - nunca pela extensão
    nem pelo Content-Type, que são o cliente quem escolhe. SVG fica de fora
    de propósito (é XML e pode carregar script).
    """
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


# ------------------------------------------------------------ admin: CRUD --

@bp.get("/admin/articles")
@require_admin
def admin_list_articles():
    articles = Article.query.order_by(Article.created_at.desc(), Article.id.desc()).all()
    return {"data": [a.to_dict(include_content=False) for a in articles]}, 200


@bp.get("/admin/articles/<int:article_id>")
@require_admin
def admin_get_article(article_id):
    article = db.session.get(Article, article_id)
    if article is None:
        return {"error": "not_found"}, 404
    # É este HTML que o editor do painel carrega - mesma segunda camada da
    # leitura pública.
    return {"data": _article_payload(article)}, 200


@bp.post("/admin/articles/preview")
@require_admin
def preview_article():
    """Devolve o `content` exatamente como ficaria gravado, sem gravar.

    A pré-visualização do painel mostra HTML que ainda não passou pelo
    backend; em vez de manter um segundo sanitizador no navegador (que
    divergiria deste), o painel pede o resultado ao único que existe.
    Mesmo teto de body das outras rotas de artigo (o caminho começa com
    `ARTICLES_PATH_PREFIX`, ver utils/request_limits.py). "preview" não
    colide com `/admin/articles/<int:article_id>`: o conversor `int` só
    casa com dígitos.
    """
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    raw = payload.get("content")
    if not isinstance(raw, str):
        return {"error": "validation_error", "details": {"content": ["Campo obrigatório."]}}, 400
    # Mesmos limites do ArticleSchema: teto do valor bruto antes de
    # sanitizar e teto do resultado.
    if len(raw) > CONTENT_MAX * 2:
        return {"error": "validation_error", "details": {"content": ["Valor muito longo."]}}, 400

    content = sanitize_html(raw)
    if len(content) > CONTENT_MAX:
        return {"error": "validation_error", "details": {"content": ["Valor muito longo."]}}, 400

    # Conteúdo que sanitiza para vazio devolve "" (200): a prévia de um
    # texto vazio é uma prévia vazia. Quem recusa salvar isso é o POST/PUT.
    return {"data": {"content": content}}, 200


@bp.post("/admin/articles")
@require_admin
def create_article():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = article_schema.load(payload)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    if "slug" in data:
        # Slug escolhido à mão: colisão é erro (mesma regra dos serviços),
        # não trocamos em silêncio um valor que o admin digitou.
        if _slug_taken(data["slug"]):
            return {"error": "slug_already_exists"}, 400
    else:
        data["slug"] = _unique_slug(slugify(data["title"]))

    article = Article(**data)
    _ensure_published_at(article)
    db.session.add(article)

    conflict = _commit_or_slug_conflict()
    if conflict is not None:
        return conflict
    return {"data": _article_payload(article)}, 201


@bp.put("/admin/articles/<int:article_id>")
@require_admin
def update_article(article_id):
    article = db.session.get(Article, article_id)
    if article is None:
        return {"error": "not_found"}, 404

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return {"error": "invalid_json"}, 400

    try:
        data = article_schema.load(payload, partial=True)
    except ValidationError as err:
        return {"error": "validation_error", "details": err.messages}, 400

    _apply_partial(
        article,
        data,
        payload,
        ("title", "excerpt", "content", "cover_image", "published", "published_at"),
    )

    # O slug fica fora do `_apply_partial`: o schema descarta slug vazio
    # (= "gere pra mim"), então a chave pode estar no body e não em `data`.
    # Sem a chave no body o slug não muda, mesmo que o título mude - a URL
    # pública de um artigo já divulgado não pode quebrar sozinha.
    if "slug" in payload:
        if "slug" in data:
            if data["slug"] != article.slug and _slug_taken(data["slug"], exclude_id=article.id):
                db.session.rollback()
                return {"error": "slug_already_exists"}, 400
            article.slug = data["slug"]
        else:
            with db.session.no_autoflush:
                article.slug = _unique_slug(slugify(article.title), exclude_id=article.id)

    _ensure_published_at(article)

    conflict = _commit_or_slug_conflict()
    if conflict is not None:
        return conflict

    payload_out = _article_payload(article)
    _purge_old_orphans()
    return {"data": payload_out}, 200


@bp.delete("/admin/articles/<int:article_id>")
@require_admin
def delete_article(article_id):
    article = db.session.get(Article, article_id)
    if article is None:
        return {"error": "not_found"}, 404

    media_before = article_media_filenames(article.cover_image, article.content)

    db.session.delete(article)
    db.session.commit()

    _cleanup_media(media_before)
    return "", 204


# ---------------------------------------------------------- admin: upload --

@bp.post("/admin/uploads")
@require_admin
def upload_image():
    max_bytes = current_app.config["UPLOAD_MAX_BYTES"]

    try:
        uploaded = request.files.get("file")
    except RequestEntityTooLarge:
        # Body inteiro acima do teto da rota (ver utils/request_limits.py):
        # o werkzeug recusa antes mesmo de ler o arquivo.
        return {"error": "file_too_large"}, 413

    if uploaded is None:
        return {"error": "invalid_image"}, 400

    # Lê no máximo 1 byte além do limite - o suficiente para saber que
    # passou, sem carregar um arquivo arbitrariamente grande na memória.
    data = uploaded.stream.read(max_bytes + 1)
    if len(data) > max_bytes:
        return {"error": "file_too_large"}, 413

    extension = _detect_image_extension(data)
    if extension is None:
        return {"error": "invalid_image"}, 400

    # O nome enviado pelo cliente (`uploaded.filename`) nunca é usado: nome
    # aleatório + extensão derivada do tipo detectado elimina path
    # traversal, sobrescrita de arquivo alheio e extensão enganosa.
    filename = f"{uuid.uuid4().hex}.{extension}"
    directory = _upload_dir()
    os.makedirs(directory, exist_ok=True)
    with open(os.path.join(directory, filename), "wb") as handle:
        handle.write(data)

    return {"data": {"url": f"/api/media/{filename}", "filename": filename}}, 201


# ------------------------------------------------------------------ público --

@bp.get("/articles")
def list_articles():
    page = _positive_int_arg("page", 1, _MAX_PAGE)
    per_page = _positive_int_arg("per_page", _DEFAULT_PER_PAGE, _MAX_PER_PAGE)

    query = _public_query()
    total = query.count()
    articles = (
        query.order_by(Article.published_at.desc(), Article.id.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
        .all()
    )

    return {
        "data": [a.to_dict(include_content=False) for a in articles],
        "meta": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "pages": math.ceil(total / per_page),
        },
    }, 200


@bp.get("/articles/<slug>")
def get_article(slug):
    article = _public_query().filter(Article.slug == slug).first()
    if article is None:
        return {"error": "not_found"}, 404
    return {"data": _article_payload(article)}, 200


@bp.get("/media/<filename>")
def serve_media(filename):
    # Só nomes no formato exato que o upload gera (uuid hex + extensão
    # conhecida). Qualquer outra coisa - "..", barras, extensão diferente -
    # nem chega a tocar o disco. `send_from_directory` ainda confere, por
    # conta própria, que o caminho final fica dentro do diretório.
    if _MEDIA_FILENAME_RE.fullmatch(filename) is None:
        return {"error": "not_found"}, 404

    try:
        response = send_from_directory(
            _upload_dir(),
            filename,
            mimetype=_MIMETYPES[filename.rsplit(".", 1)[1]],
        )
    except NotFound:
        return {"error": "not_found"}, 404

    # O nome é aleatório e o arquivo nunca é reescrito, então pode ser
    # cacheado "para sempre".
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response
