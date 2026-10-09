import io
import os
import re
import time
from datetime import datetime, timedelta, timezone

import pytest

from app.models import Article

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 64
GIF_BYTES = b"GIF89a" + b"\x00" * 64
WEBP_BYTES = b"RIFF" + b"\x40\x00\x00\x00" + b"WEBP" + b"\x00" * 64

MEDIA_URL_RE = re.compile(r"^/api/media/[0-9a-f]{32}\.(jpg|png|webp|gif)$")


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def upload_dir(app, tmp_path):
    """Todo teste deste módulo grava uploads num diretório temporário -
    nunca dentro do repositório (default de `UPLOAD_DIR`).
    """
    directory = tmp_path / "uploads"
    app.config["UPLOAD_DIR"] = str(directory)
    return directory


def make_article(client, token, **overrides):
    payload = {"title": "Artigo de Teste", "content": "<p>Conteúdo do artigo.</p>"}
    payload.update(overrides)
    resp = client.post("/api/admin/articles", json=payload, headers=auth_headers(token))
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["data"]


def upload(client, token, data, filename="foto.png", content_type="image/png"):
    return client.post(
        "/api/admin/uploads",
        data={"file": (io.BytesIO(data), filename, content_type)},
        content_type="multipart/form-data",
        headers=auth_headers(token),
    )


# -------------------------------------------------------------------- auth --

@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/admin/articles"),
        ("get", "/api/admin/articles/1"),
        ("post", "/api/admin/articles"),
        ("post", "/api/admin/articles/preview"),
        ("put", "/api/admin/articles/1"),
        ("delete", "/api/admin/articles/1"),
        ("post", "/api/admin/uploads"),
    ],
)
def test_admin_article_routes_require_auth(client, method, path):
    resp = getattr(client, method)(path)

    assert resp.status_code == 401
    assert resp.get_json() == {"error": "unauthorized"}


def test_upload_without_auth_does_not_store_file(client, upload_dir):
    resp = client.post(
        "/api/admin/uploads",
        data={"file": (io.BytesIO(PNG_BYTES), "foto.png", "image/png")},
        content_type="multipart/form-data",
    )

    assert resp.status_code == 401
    assert not upload_dir.exists()


# -------------------------------------------------------------------- CRUD --

def test_article_full_crud(client, admin_token):
    headers = auth_headers(admin_token)

    create_resp = client.post(
        "/api/admin/articles",
        json={
            "title": "Direitos do Consumidor",
            "slug": "direitos-do-consumidor",
            "excerpt": "Um resumo curto.",
            "content": "<p>Texto do artigo.</p>",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    created = create_resp.get_json()["data"]
    assert set(created) == {
        "id", "slug", "title", "excerpt", "content", "cover_image",
        "published", "published_at", "created_at", "updated_at",
    }
    assert created["slug"] == "direitos-do-consumidor"
    assert created["content"] == "<p>Texto do artigo.</p>"
    assert created["cover_image"] is None
    assert created["published"] is False
    assert created["published_at"] is None
    assert created["created_at"].endswith("+00:00")
    article_id = created["id"]

    list_resp = client.get("/api/admin/articles", headers=headers)
    assert list_resp.status_code == 200
    listed = list_resp.get_json()["data"]
    assert [a["id"] for a in listed] == [article_id]
    # lista leve: sem o corpo do artigo.
    assert "content" not in listed[0]

    get_resp = client.get(f"/api/admin/articles/{article_id}", headers=headers)
    assert get_resp.status_code == 200
    assert get_resp.get_json()["data"]["content"] == "<p>Texto do artigo.</p>"

    update_resp = client.put(
        f"/api/admin/articles/{article_id}",
        json={"title": "Título Atualizado"},
        headers=headers,
    )
    assert update_resp.status_code == 200
    updated = update_resp.get_json()["data"]
    assert updated["title"] == "Título Atualizado"
    # campos não enviados no PUT parcial permanecem intactos - inclusive o
    # slug, que não acompanha a troca de título.
    assert updated["slug"] == "direitos-do-consumidor"
    assert updated["excerpt"] == "Um resumo curto."
    assert updated["content"] == "<p>Texto do artigo.</p>"

    delete_resp = client.delete(f"/api/admin/articles/{article_id}", headers=headers)
    assert delete_resp.status_code == 204

    missing_resp = client.delete(f"/api/admin/articles/{article_id}", headers=headers)
    assert missing_resp.status_code == 404

    assert Article.query.count() == 0


def test_admin_list_is_newest_first(client, admin_token):
    first = make_article(client, admin_token, title="Primeiro")
    second = make_article(client, admin_token, title="Segundo")

    resp = client.get("/api/admin/articles", headers=auth_headers(admin_token))

    assert [a["id"] for a in resp.get_json()["data"]] == [second["id"], first["id"]]


def test_article_missing_returns_404(client, admin_token):
    headers = auth_headers(admin_token)

    assert client.get("/api/admin/articles/9999", headers=headers).status_code == 404
    put_resp = client.put("/api/admin/articles/9999", json={"title": "Xis"}, headers=headers)
    assert put_resp.status_code == 404
    assert put_resp.get_json() == {"error": "not_found"}


def test_article_requires_title_and_content(client, admin_token):
    resp = client.post("/api/admin/articles", json={"excerpt": "só resumo"}, headers=auth_headers(admin_token))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "title" in body["details"]
    assert "content" in body["details"]


def test_article_invalid_json_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/articles",
        data="isso não é json",
        content_type="application/json",
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_json"}


def test_article_body_larger_than_default_limit_is_accepted(client, admin_token, app):
    # O teto global de body é 256 KB; artigos têm um teto próprio maior.
    # Texto acentuado dentro do limite de caracteres do campo, mas com mais
    # de 256 KB em bytes.
    content = "<p>" + ("ação " * 39_000) + "</p>"
    assert len(content) < 200_000
    assert len(content.encode("utf-8")) > app.config["MAX_CONTENT_LENGTH"]

    created = make_article(client, admin_token, content=content)

    assert len(created["content"].encode("utf-8")) > app.config["MAX_CONTENT_LENGTH"]


def test_article_content_over_limit_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/articles",
        json={"title": "Longo demais", "content": "<p>" + "a" * 200_001 + "</p>"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert "content" in resp.get_json()["details"]


def test_cover_image_only_accepts_media_path(client, admin_token):
    headers = auth_headers(admin_token)
    valid = "/api/media/" + "a" * 32 + ".png"

    created = make_article(client, admin_token, cover_image=valid)
    assert created["cover_image"] == valid

    for bad in ("https://evil.example/x.png", "/api/media/../../etc/passwd", "javascript:alert(1)"):
        resp = client.put(
            f"/api/admin/articles/{created['id']}", json={"cover_image": bad}, headers=headers
        )
        assert resp.status_code == 400, bad
        assert "cover_image" in resp.get_json()["details"]

    cleared = client.put(
        f"/api/admin/articles/{created['id']}", json={"cover_image": None}, headers=headers
    )
    assert cleared.status_code == 200
    assert cleared.get_json()["data"]["cover_image"] is None


# -------------------------------------------------------------------- slug --

def test_slug_is_generated_from_title_without_accents(client, admin_token):
    created = make_article(client, admin_token, title="Ação de Usucapião: o que é?")

    assert created["slug"] == "acao-de-usucapiao-o-que-e"


def test_empty_slug_is_generated_from_title(client, admin_token):
    created = make_article(client, admin_token, title="Pensão Alimentícia", slug="")

    assert created["slug"] == "pensao-alimenticia"


def test_generated_slug_collision_gets_numeric_suffix(client, admin_token):
    slugs = [make_article(client, admin_token, title="Mesmo Título")["slug"] for _ in range(3)]

    assert slugs == ["mesmo-titulo", "mesmo-titulo-2", "mesmo-titulo-3"]


def test_title_without_slug_characters_uses_fallback(client, admin_token):
    created = make_article(client, admin_token, title="???")

    assert created["slug"] == "artigo"


def test_explicit_duplicate_slug_is_rejected(client, admin_token):
    headers = auth_headers(admin_token)
    make_article(client, admin_token, slug="duplicado")

    resp = client.post(
        "/api/admin/articles",
        json={"title": "Outro", "slug": "duplicado", "content": "<p>x</p>"},
        headers=headers,
    )
    assert resp.status_code == 400
    assert resp.get_json()["error"] == "slug_already_exists"

    other = make_article(client, admin_token, slug="outro")
    put_resp = client.put(
        f"/api/admin/articles/{other['id']}", json={"slug": "duplicado"}, headers=headers
    )
    assert put_resp.status_code == 400
    assert put_resp.get_json()["error"] == "slug_already_exists"
    assert Article.query.filter_by(slug="outro").count() == 1


def test_invalid_slug_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/articles",
        json={"title": "Artigo", "slug": "Com Espaço/e barra", "content": "<p>x</p>"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert "slug" in resp.get_json()["details"]


def test_put_with_empty_slug_regenerates_from_title(client, admin_token):
    created = make_article(client, admin_token, title="Título Antigo")

    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"title": "Título Novo", "slug": ""},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["slug"] == "titulo-novo"


# ------------------------------------------------- publicação / visibilidade --

def test_publish_and_unpublish_controls_public_visibility(client, admin_token):
    headers = auth_headers(admin_token)
    created = make_article(client, admin_token, title="Artigo Público")
    article_id, slug = created["id"], created["slug"]

    # rascunho: invisível no site.
    assert client.get("/api/articles").get_json()["data"] == []
    assert client.get(f"/api/articles/{slug}").status_code == 404

    publish_resp = client.put(f"/api/admin/articles/{article_id}", json={"published": True}, headers=headers)
    assert publish_resp.status_code == 200
    published = publish_resp.get_json()["data"]
    assert published["published"] is True
    # publicar sem data grava "agora" (UTC).
    published_at = datetime.fromisoformat(published["published_at"])
    assert abs(datetime.now(timezone.utc) - published_at) < timedelta(minutes=1)

    list_resp = client.get("/api/articles")
    assert list_resp.status_code == 200
    body = list_resp.get_json()
    assert [a["id"] for a in body["data"]] == [article_id]
    assert "content" not in body["data"][0]
    assert body["meta"] == {"page": 1, "per_page": 9, "total": 1, "pages": 1}

    detail_resp = client.get(f"/api/articles/{slug}")
    assert detail_resp.status_code == 200
    assert detail_resp.get_json()["data"]["content"] == "<p>Conteúdo do artigo.</p>"

    unpublish_resp = client.put(f"/api/admin/articles/{article_id}", json={"published": False}, headers=headers)
    assert unpublish_resp.status_code == 200
    unpublished = unpublish_resp.get_json()["data"]
    assert unpublished["published"] is False
    # despublicar não apaga a data de publicação.
    assert unpublished["published_at"] == published["published_at"]

    assert client.get("/api/articles").get_json()["data"] == []
    not_found = client.get(f"/api/articles/{slug}")
    assert not_found.status_code == 404
    assert not_found.get_json() == {"error": "not_found"}


def test_create_published_without_date_sets_now(client, admin_token):
    created = make_article(client, admin_token, published=True)

    assert created["published"] is True
    assert created["published_at"] is not None


def test_explicit_published_at_is_kept_and_normalized_to_utc(client, admin_token):
    created = make_article(
        client, admin_token, published=True, published_at="2024-03-10T09:00:00-03:00"
    )

    assert created["published_at"] == "2024-03-10T12:00:00+00:00"


def test_article_with_future_published_at_is_not_public(client, admin_token):
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    created = make_article(client, admin_token, title="Agendado", published=True, published_at=future)

    # o painel enxerga...
    admin_list = client.get("/api/admin/articles", headers=auth_headers(admin_token)).get_json()["data"]
    assert [a["id"] for a in admin_list] == [created["id"]]

    # ...o site não, até a data chegar.
    body = client.get("/api/articles").get_json()
    assert body["data"] == []
    assert body["meta"]["total"] == 0
    assert client.get(f"/api/articles/{created['slug']}").status_code == 404


def test_public_list_is_paginated_and_ordered_by_published_at_desc(client, admin_token):
    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    ids = []
    for index in range(5):
        created = make_article(
            client,
            admin_token,
            title=f"Artigo {index}",
            published=True,
            published_at=(base + timedelta(days=index)).isoformat(),
        )
        ids.append(created["id"])
    make_article(client, admin_token, title="Rascunho")

    first = client.get("/api/articles?page=1&per_page=2").get_json()
    assert [a["id"] for a in first["data"]] == [ids[4], ids[3]]
    assert first["meta"] == {"page": 1, "per_page": 2, "total": 5, "pages": 3}

    last = client.get("/api/articles?page=3&per_page=2").get_json()
    assert [a["id"] for a in last["data"]] == [ids[0]]

    beyond = client.get("/api/articles?page=9&per_page=2").get_json()
    assert beyond["data"] == []
    assert beyond["meta"]["total"] == 5


def test_public_list_caps_per_page_and_tolerates_garbage(client):
    capped = client.get("/api/articles?per_page=1000").get_json()
    assert capped["meta"]["per_page"] == 50

    garbage = client.get("/api/articles?page=abc&per_page=-3").get_json()
    assert garbage["meta"] == {"page": 1, "per_page": 9, "total": 0, "pages": 0}


# ------------------------------------------------------------ sanitização --

def test_article_content_xss_is_removed(client, admin_token):
    created = make_article(
        client,
        admin_token,
        content=(
            "<p>Antes</p>"
            "<script>alert('xss')</script>"
            '<img src="x" onerror="alert(1)">'
            '<a href="javascript:alert(1)" onclick="alert(2)">link</a>'
            '<iframe src="https://evil.example"></iframe>'
            '<p style="background:url(javascript:alert(3))">estilo</p>'
            "<!-- comentário -->"
            "<svg onload=alert(4)></svg>"
        ),
    )
    content = created["content"].lower()

    assert "<script" not in content
    assert "alert('xss')" not in content
    assert "onerror" not in content
    assert "onclick" not in content
    assert "onload" not in content
    assert "javascript:" not in content
    assert "<iframe" not in content
    assert "<svg" not in content
    assert "style=" not in content
    assert "comentário" not in content
    assert "<p>antes</p>" in content

    # o que foi gravado no banco já é o HTML limpo.
    assert Article.query.one().content == created["content"]


def test_article_content_keeps_allowed_formatting(client, admin_token):
    media = "/api/media/" + "b" * 32 + ".jpg"
    html = (
        "<h2>Título</h2><h3>Sub</h3><h4>Menor</h4>"
        "<p><strong>negrito</strong> <em>itálico</em> <u>sublinhado</u> <s>riscado</s></p>"
        "<blockquote><p>citação</p></blockquote>"
        "<ul><li>um</li></ul><ol><li>dois</li></ol>"
        "<pre><code>código</code></pre><hr>"
        f'<figure><img src="{media}" alt="foto" width="640" height="480"><figcaption>legenda</figcaption></figure>'
    )

    created = make_article(client, admin_token, content=html)

    assert created["content"] == html


def test_article_links_get_forced_rel_and_safe_schemes(client, admin_token):
    created = make_article(
        client,
        admin_token,
        content=(
            '<p><a href="https://example.com/a" target="_blank" rel="opener">externo</a>'
            '<a href="mailto:contato@example.com">email</a>'
            '<a href="/contato">interno</a>'
            '<a href="//evil.example">protocol-relative</a>'
            '<a href="data:text/html,x" target="janela">data</a></p>'
        ),
    )
    content = created["content"]

    assert '<a href="https://example.com/a" target="_blank" rel="noopener noreferrer">externo</a>' in content
    assert 'href="mailto:contato@example.com"' in content
    assert 'href="/contato"' in content
    assert "evil.example" not in content
    assert "data:" not in content
    assert 'target="janela"' not in content
    # o `rel` do cliente é descartado; todo <a> sai com o rel forçado.
    assert 'rel="opener"' not in content
    assert content.count('rel="noopener noreferrer"') == content.count("<a")


def test_article_text_align_survives_only_as_style(client, admin_token):
    created = make_article(
        client,
        admin_token,
        content=(
            '<p style="text-align: center">centro</p>'
            '<h2 style="text-align:right; color: red; position: fixed">direita</h2>'
            '<p style="color: red">sem alinhamento</p>'
            '<p style="text-align: expression(alert(1))">inválido</p>'
            '<p class="text-center">classe</p>'
            '<span style="text-align: center">span</span>'
        ),
    )

    assert created["content"] == (
        '<p style="text-align: center">centro</p>'
        '<h2 style="text-align: right">direita</h2>'
        "<p>sem alinhamento</p>"
        "<p>inválido</p>"
        "<p>classe</p>"
        "<span>span</span>"
    )


def test_article_img_src_is_restricted(client, admin_token):
    media = "/api/media/" + "c" * 32 + ".webp"
    created = make_article(
        client,
        admin_token,
        content=(
            f'<img src="{media}" alt="ok">'
            '<img src="https://cdn.example.com/a.png" alt="https">'
            '<img src="http://cdn.example.com/a.png" alt="http">'
            '<img src="/api/media/../../etc/passwd" alt="traversal">'
            '<img src="/outra/pasta.png" alt="relativo">'
            '<img src="data:image/png;base64,AAAA" alt="data">'
        ),
    )
    content = created["content"]

    assert f'src="{media}"' in content
    # só uploads do painel: imagem externa perde o src, mesmo em https.
    assert content.count("src=") == 1
    assert "https://" not in content
    assert "http://" not in content
    assert ".." not in content
    assert "/outra/" not in content
    assert "data:" not in content


def test_article_text_fields_strip_all_html(client, admin_token):
    created = make_article(
        client,
        admin_token,
        title="Título <script>alert(1)</script> Teste",
        excerpt="<img src=x onerror=alert(1)>Resumo <b>normal</b>.",
    )

    assert "<" not in created["title"]
    assert "<" not in created["excerpt"]
    assert "Resumo normal." in created["excerpt"]
    assert "<" not in created["slug"]


def test_article_content_that_sanitizes_to_empty_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/articles",
        json={"title": "Só script", "content": "<script>alert(1)</script>"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert "content" in resp.get_json()["details"]


def test_put_content_is_sanitized_too(client, admin_token):
    created = make_article(client, admin_token)

    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"content": '<p onclick="alert(1)">novo</p><script>alert(2)</script>'},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200
    assert resp.get_json()["data"]["content"] == "<p>novo</p>"


# ----------------------------------------------------------------- uploads --

@pytest.mark.parametrize(
    "data,extension,mimetype",
    [
        (PNG_BYTES, "png", "image/png"),
        (JPEG_BYTES, "jpg", "image/jpeg"),
        (GIF_BYTES, "gif", "image/gif"),
        (WEBP_BYTES, "webp", "image/webp"),
    ],
)
def test_upload_valid_image_is_stored_and_served(client, admin_token, upload_dir, data, extension, mimetype):
    # nome e Content-Type do cliente são ignorados de propósito.
    resp = upload(client, admin_token, data, filename="../../evil.svg", content_type="text/html")

    assert resp.status_code == 201
    body = resp.get_json()["data"]
    assert MEDIA_URL_RE.match(body["url"])
    assert body["url"] == f"/api/media/{body['filename']}"
    assert body["filename"].endswith(f".{extension}")
    assert os.listdir(upload_dir) == [body["filename"]]

    # servido publicamente, sem auth, com os headers de cache/segurança.
    media_resp = client.get(body["url"])
    assert media_resp.status_code == 200
    assert media_resp.data == data
    assert media_resp.mimetype == mimetype
    assert media_resp.headers["Cache-Control"] == "public, max-age=31536000, immutable"
    assert media_resp.headers["X-Content-Type-Options"] == "nosniff"
    media_resp.close()


def test_upload_non_image_with_png_extension_is_rejected(client, admin_token, upload_dir):
    resp = upload(client, admin_token, b"<html><script>alert(1)</script></html>", filename="foto.png")

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_image"}
    assert not upload_dir.exists()


def test_upload_svg_is_rejected(client, admin_token, upload_dir):
    svg = b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'

    resp = upload(client, admin_token, svg, filename="logo.svg", content_type="image/svg+xml")

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_image"}
    assert not upload_dir.exists()


def test_upload_without_file_field_is_rejected(client, admin_token):
    resp = client.post(
        "/api/admin/uploads",
        data={"outro": "campo"},
        content_type="multipart/form-data",
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_image"}


@pytest.mark.parametrize("extra_bytes", [1, 2 * 1024 * 1024])
def test_upload_too_large_is_rejected(client, admin_token, app, upload_dir, extra_bytes):
    # +1 byte cai na checagem de tamanho do arquivo; +2 MB estoura antes,
    # no teto de body da rota. Nos dois casos a resposta é a mesma.
    limit = app.config["UPLOAD_MAX_BYTES"]
    data = PNG_BYTES + b"\x00" * (limit - len(PNG_BYTES) + extra_bytes)

    resp = upload(client, admin_token, data)

    assert resp.status_code == 413
    assert resp.get_json() == {"error": "file_too_large"}
    assert not upload_dir.exists()


def test_upload_at_exact_limit_is_accepted(client, admin_token, app):
    limit = app.config["UPLOAD_MAX_BYTES"]
    data = PNG_BYTES + b"\x00" * (limit - len(PNG_BYTES))

    resp = upload(client, admin_token, data)

    assert resp.status_code == 201


def test_default_body_limit_still_applies_to_other_routes(client, app):
    # o teto maior vale só para uploads/artigos - /api/leads continua em 256 KB.
    resp = client.post(
        "/api/leads",
        data=b"x" * (app.config["MAX_CONTENT_LENGTH"] + 1),
        content_type="application/json",
    )

    assert resp.status_code == 413


# ------------------------------------------------------------------- media --

@pytest.mark.parametrize(
    "path",
    [
        "/api/media/../config.py",
        "/api/media/..%2F..%2Fetc%2Fpasswd",
        "/api/media/%2e%2e%2f%2e%2e%2fetc%2fpasswd",
        "/api/media/..%5C..%5Cwsgi.py",
        "/api/media/segredo.txt",
        "/api/media/" + "a" * 32 + ".svg",
        "/api/media/" + "a" * 32 + ".png/../../segredo.txt",
        "/api/media/" + "A" * 32 + ".png",
        "/api/media/" + "a" * 31 + ".png",
    ],
)
def test_media_rejects_traversal_and_unknown_names(client, upload_dir, path):
    # arquivo "sensível" ao lado do diretório de uploads: não pode vazar.
    upload_dir.mkdir()
    (upload_dir.parent / "segredo.txt").write_text("segredo")
    (upload_dir / "segredo.txt").write_text("segredo")

    resp = client.get(path)

    assert resp.status_code == 404
    assert b"segredo" not in resp.data


def test_media_missing_file_returns_404(client):
    resp = client.get("/api/media/" + "d" * 32 + ".png")

    assert resp.status_code == 404
    assert resp.get_json() == {"error": "not_found"}


# ------------------------------------------- allowlist de links e imagens --

@pytest.mark.parametrize(
    "href",
    [
        "/\\evil.example",          # o navegador lê "/\" como "//"
        "\\\\evil.example",
        "\\/evil.example",
        "//evil.example",
        "/\\/evil.example",
        "/&#92;evil.example",       # barra invertida como entidade
        "/&#9;/evil.example",       # tab é removido da URL -> "//evil.example"
        "/&#10;/evil.example",
        "/&#13;/evil.example",
        "&#9;//evil.example",
        " \t//evil.example",
        "&#1;//evil.example",       # controle inicial (ignorado pelo navegador)
        "https:\\\\evil.example",
        "https:/\\evil.example",
        "ht&#9;tps://evil.example",  # tab/newline no meio do esquema
        "java&#10;script:alert(1)",
        "&#9;javascript:alert(1)",
        "https:evil.example",
        "evil.example/pagina",
    ],
)
def test_link_href_variants_pointing_to_other_hosts_are_removed(href):
    from app.utils.sanitize import sanitize_html

    cleaned = sanitize_html(f'<p><a href="{href}">x</a></p>')

    assert "href" not in cleaned
    assert "evil" not in cleaned
    assert "script" not in cleaned
    assert ">x</a>" in cleaned


@pytest.mark.parametrize(
    "href",
    [
        "/contato",
        "/blog/um-artigo?pagina=2#topo",
        "#ancora",
        "https://www.planalto.gov.br/ccivil_03/leis/l8213cons.htm",
        "http://example.com/a?b=c&d=e",
        "mailto:contato@example.com",
        "/",
    ],
)
def test_legitimate_link_hrefs_are_kept(href):
    from app.utils.sanitize import sanitize_html

    cleaned = sanitize_html(f'<p><a href="{href}">x</a></p>')

    assert f'href="{href.replace("&", "&amp;")}"' in cleaned


def test_backslash_link_is_removed_through_the_api(client, admin_token):
    created = make_article(
        client,
        admin_token,
        content='<p><a href="/\\evil.example">sai do site</a><a href="/contato">fica</a></p>',
    )

    assert "evil.example" not in created["content"]
    assert 'href="/contato"' in created["content"]


@pytest.mark.parametrize(
    "src",
    [
        "https://exemplo.com/x.png",
        "https://cdn.example.com/pixel.gif?u=123",
        "HTTPS://EXEMPLO.COM/x.png",
        "//exemplo.com/x.png",
        "/\\exemplo.com/x.png",
        "/api/media/" + "a" * 32 + ".svg",
        "/api/media/" + "a" * 32 + ".png?x=1",
        "/api/media/" + "A" * 32 + ".png",
        "https://exemplo.com/api/media/" + "a" * 32 + ".png",
    ],
)
def test_img_src_outside_uploads_is_removed(src):
    from app.utils.sanitize import sanitize_html

    cleaned = sanitize_html(f'<p>antes</p><img src="{src}" alt="foto">')

    assert "src=" not in cleaned
    assert "exemplo" not in cleaned.lower()
    assert 'alt="foto"' in cleaned


def test_sanitize_html_is_idempotent():
    from app.utils.sanitize import sanitize_html

    media = "/api/media/" + "d" * 32 + ".png"
    dirty = (
        "<h2>Título &amp; subtítulo</h2>"
        '<p style="text-align:center; color:red">a &lt; b <strong>forte</strong><br>linha</p>'
        '<a href="https://example.com/?a=1&b=2" target="_blank" onclick="x()">link</a>'
        f'<figure><img src="{media}" alt="a &quot;b&quot;" width="10"><figcaption>leg</figcaption></figure>'
        '<img src="https://exemplo.com/x.png"><script>alert(1)</script>'
        "<ul><li>um<li>dois</ul><pre><code>x = 1 &amp;&amp; y</code></pre><div>solto</div>"
    )

    once = sanitize_html(dirty)

    assert sanitize_html(once) == once
    assert sanitize_html(sanitize_html(once)) == once


# -------------------------------------------- sanitização na leitura (2ª) --

def _tamper_content(article_id, html):
    """Grava HTML cru direto no banco, sem passar pelo schema - simula um
    UPDATE manual, uma importação ou um registro gravado por uma versão
    antiga do sanitizador.
    """
    from app.extensions import db

    db.session.execute(
        Article.__table__.update().where(Article.id == article_id).values(content=html)
    )
    db.session.commit()
    db.session.expire_all()


DIRTY_STORED_HTML = (
    "<p>texto legítimo</p>"
    "<img src=x onerror=alert(1)>"
    "<script>alert(2)</script>"
    '<a href="javascript:alert(3)">clique</a>'
    '<img src="https://exemplo.com/pixel.gif">'
)


def _assert_clean(content):
    lowered = content.lower()
    assert "<p>texto legítimo</p>" in content
    assert "onerror" not in lowered
    assert "<script" not in lowered
    assert "alert(2)" not in lowered
    assert "javascript:" not in lowered
    assert "exemplo.com" not in lowered


def test_public_article_content_is_sanitized_on_read(client, admin_token):
    created = make_article(client, admin_token, slug="adulterado", published=True)
    _tamper_content(created["id"], DIRTY_STORED_HTML)

    resp = client.get("/api/articles/adulterado")

    assert resp.status_code == 200
    _assert_clean(resp.get_json()["data"]["content"])
    # a leitura não "conserta" o banco: só a resposta é limpa.
    assert Article.query.one().content == DIRTY_STORED_HTML


def test_admin_article_content_is_sanitized_on_read(client, admin_token):
    created = make_article(client, admin_token)
    _tamper_content(created["id"], DIRTY_STORED_HTML)

    resp = client.get(f"/api/admin/articles/{created['id']}", headers=auth_headers(admin_token))

    assert resp.status_code == 200
    _assert_clean(resp.get_json()["data"]["content"])


def test_read_returns_stored_content_unchanged_when_already_clean(client, admin_token):
    media = "/api/media/" + "e" * 32 + ".jpg"
    html = (
        '<h2 style="text-align: center">Título</h2>'
        '<p>a &amp; b <a href="https://example.com/?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">link</a></p>'
        f'<figure><img src="{media}" alt="foto"><figcaption>legenda</figcaption></figure>'
    )
    created = make_article(client, admin_token, slug="limpo", published=True, content=html)

    public = client.get("/api/articles/limpo").get_json()["data"]
    admin_view = client.get(
        f"/api/admin/articles/{created['id']}", headers=auth_headers(admin_token)
    ).get_json()["data"]

    assert created["content"] == html
    assert public["content"] == html
    assert admin_view["content"] == html
    # o resto do formato da resposta não mudou.
    assert set(public) == {
        "id", "slug", "title", "excerpt", "content", "cover_image",
        "published", "published_at", "created_at", "updated_at",
    }


# ------------------------------------------------------------- pré-visualização --

PREVIEW_URL = "/api/admin/articles/preview"


def test_preview_returns_exactly_what_would_be_saved(client, admin_token):
    media = "/api/media/" + "f" * 32 + ".png"
    dirty = (
        '<p style="text-align:center;color:red">oi</p>'
        "<script>alert(1)</script>"
        '<a href="https://example.com" onclick="x()">link</a>'
        '<a href="/\\evil.example">fora</a>'
        f'<img src="{media}" alt="ok"><img src="https://exemplo.com/x.png" onerror="alert(2)">'
    )

    resp = client.post(PREVIEW_URL, json={"content": dirty}, headers=auth_headers(admin_token))

    assert resp.status_code == 200
    body = resp.get_json()
    assert set(body) == {"data"} and set(body["data"]) == {"content"}
    preview = body["data"]["content"]
    assert "<script" not in preview and "onclick" not in preview and "onerror" not in preview
    assert "evil.example" not in preview and "exemplo.com" not in preview
    assert '<p style="text-align: center">oi</p>' in preview

    # idêntico, byte a byte, ao que o POST de artigo grava.
    saved = make_article(client, admin_token, content=dirty)
    assert preview == saved["content"]


def test_preview_does_not_persist_anything(client, admin_token):
    resp = client.post(PREVIEW_URL, json={"content": "<p>rascunho</p>"}, headers=auth_headers(admin_token))

    assert resp.status_code == 200
    assert Article.query.count() == 0


def test_preview_of_content_that_sanitizes_to_empty_is_empty(client, admin_token):
    for content in ("", "<script>alert(1)</script>", "   "):
        resp = client.post(PREVIEW_URL, json={"content": content}, headers=auth_headers(admin_token))

        assert resp.status_code == 200
        assert resp.get_json() == {"data": {"content": ""}}


def test_preview_ignores_other_fields(client, admin_token):
    resp = client.post(
        PREVIEW_URL,
        json={"content": "<p>ok</p>", "title": "<b>x</b>", "published": True},
        headers=auth_headers(admin_token),
    )

    assert resp.get_json() == {"data": {"content": "<p>ok</p>"}}


def test_preview_invalid_json_is_rejected(client, admin_token):
    headers = auth_headers(admin_token)

    not_json = client.post(PREVIEW_URL, data="isso não é json", content_type="application/json", headers=headers)
    assert not_json.status_code == 400
    assert not_json.get_json() == {"error": "invalid_json"}

    not_object = client.post(PREVIEW_URL, json=["<p>x</p>"], headers=headers)
    assert not_object.status_code == 400
    assert not_object.get_json() == {"error": "invalid_json"}


@pytest.mark.parametrize("payload", [{}, {"content": None}, {"content": 123}, {"content": ["<p>x</p>"]}, {"html": "<p>x</p>"}])
def test_preview_requires_string_content(client, admin_token, payload):
    resp = client.post(PREVIEW_URL, json=payload, headers=auth_headers(admin_token))

    assert resp.status_code == 400
    body = resp.get_json()
    assert body["error"] == "validation_error"
    assert "content" in body["details"]


def test_preview_content_over_limit_is_rejected(client, admin_token):
    headers = auth_headers(admin_token)

    # acima do teto do resultado (200 mil caracteres), como no salvar.
    over_clean = client.post(PREVIEW_URL, json={"content": "<p>" + "a" * 200_001 + "</p>"}, headers=headers)
    assert over_clean.status_code == 400
    assert over_clean.get_json()["error"] == "validation_error"

    # acima do teto do valor bruto.
    over_raw = client.post(PREVIEW_URL, json={"content": "<b></b>" * 60_000}, headers=headers)
    assert over_raw.status_code == 400
    assert "content" in over_raw.get_json()["details"]


def test_preview_accepts_body_above_default_limit_like_articles(client, admin_token, app):
    # mesmo teto de body das rotas de artigo, não os 256 KB do resto da API.
    big = "<p>" + "a" * 150_000 + "</p>" + "<!-- " + "x" * 150_000 + " -->"
    assert len(big.encode()) > app.config["MAX_CONTENT_LENGTH"]
    resp = client.post(PREVIEW_URL, json={"content": big}, headers=auth_headers(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["data"]["content"] == "<p>" + "a" * 150_000 + "</p>"


def test_preview_route_does_not_shadow_article_id_routes(client, admin_token):
    headers = auth_headers(admin_token)
    created = make_article(client, admin_token)

    assert client.get(f"/api/admin/articles/{created['id']}", headers=headers).status_code == 200
    assert client.put(f"/api/admin/articles/{created['id']}", json={"title": "Novo título"}, headers=headers).status_code == 200
    # "preview" não é um id: só POST existe nesse caminho.
    assert client.get(PREVIEW_URL, headers=headers).status_code in (404, 405)
    assert client.delete(PREVIEW_URL, headers=headers).status_code in (404, 405)
    assert Article.query.count() == 1


# ------------------------------------------------- limpeza de uploads órfãos --

def _upload_name(client, token, data=PNG_BYTES):
    resp = upload(client, token, data)
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["data"]["filename"]


def _age(path, hours):
    """Envelhece o arquivo (mtime) em `hours` horas."""
    import time

    stamp = time.time() - hours * 3600
    os.utime(path, (stamp, stamp))


def _img(name):
    return f'<p>texto</p><img src="/api/media/{name}" alt="foto">'


def test_deleting_article_removes_its_images(client, admin_token, upload_dir):
    cover = _upload_name(client, admin_token)
    inline = _upload_name(client, admin_token, JPEG_BYTES)
    unrelated = _upload_name(client, admin_token)
    created = make_article(client, admin_token, cover_image=f"/api/media/{cover}", content=_img(inline))

    resp = client.delete(f"/api/admin/articles/{created['id']}", headers=auth_headers(admin_token))

    assert resp.status_code == 204
    assert not (upload_dir / cover).exists()
    assert not (upload_dir / inline).exists()
    # upload recente que nunca foi desse artigo (rascunho em andamento) fica.
    assert (upload_dir / unrelated).exists()
    assert client.get(f"/api/media/{inline}").status_code == 404


def test_deleting_article_keeps_images_used_by_another_article(client, admin_token, upload_dir):
    shared = _upload_name(client, admin_token)
    own = _upload_name(client, admin_token)
    first = make_article(client, admin_token, cover_image=f"/api/media/{shared}", content=_img(own))
    # o outro artigo é um RASCUNHO e usa a mesma imagem no corpo.
    make_article(client, admin_token, title="Outro", content=_img(shared), published=False)

    client.delete(f"/api/admin/articles/{first['id']}", headers=auth_headers(admin_token))

    assert (upload_dir / shared).exists()
    assert not (upload_dir / own).exists()


def test_updating_article_keeps_recent_images_and_purges_old_orphans(client, admin_token, upload_dir):
    old_cover = _upload_name(client, admin_token)
    new_cover = _upload_name(client, admin_token)
    kept = _upload_name(client, admin_token)
    dropped = _upload_name(client, admin_token)
    created = make_article(
        client,
        admin_token,
        cover_image=f"/api/media/{old_cover}",
        content=_img(kept) + _img(dropped),
    )

    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"cover_image": f"/api/media/{new_cover}", "content": _img(kept)},
        headers=auth_headers(admin_token),
    )

    # imagem recém-removida do artigo NÃO some na hora (o admin pode desfazer).
    assert resp.status_code == 200
    for name in (old_cover, dropped, new_cover, kept):
        assert (upload_dir / name).exists()

    # passada a carência, a próxima edição recolhe só as que ficaram órfãs.
    old = time.time() - 48 * 3600
    for name in (old_cover, dropped, new_cover, kept):
        os.utime(upload_dir / name, (old, old))
    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"excerpt": "novo resumo"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 200
    assert not (upload_dir / old_cover).exists()
    assert not (upload_dir / dropped).exists()
    assert (upload_dir / new_cover).exists()
    assert (upload_dir / kept).exists()


def test_updating_unrelated_fields_keeps_all_images(client, admin_token, upload_dir):
    cover = _upload_name(client, admin_token)
    inline = _upload_name(client, admin_token)
    created = make_article(client, admin_token, cover_image=f"/api/media/{cover}", content=_img(inline))

    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"title": "Só o título mudou", "published": True},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 200
    assert (upload_dir / cover).exists()
    assert (upload_dir / inline).exists()


def test_image_moved_from_cover_to_content_is_kept(client, admin_token, upload_dir):
    name = _upload_name(client, admin_token)
    created = make_article(client, admin_token, cover_image=f"/api/media/{name}")

    client.put(
        f"/api/admin/articles/{created['id']}",
        json={"cover_image": None, "content": _img(name)},
        headers=auth_headers(admin_token),
    )

    assert (upload_dir / name).exists()


def test_rejected_update_does_not_remove_images(client, admin_token, upload_dir):
    name = _upload_name(client, admin_token)
    created = make_article(client, admin_token, content=_img(name))
    make_article(client, admin_token, title="Outro", slug="ocupado")
    headers = auth_headers(admin_token)

    # validação falha / slug em conflito: nada foi salvo, nada é apagado.
    invalid = client.put(f"/api/admin/articles/{created['id']}", json={"content": "", "title": "x"}, headers=headers)
    conflict = client.put(
        f"/api/admin/articles/{created['id']}", json={"content": "<p>sem imagem</p>", "slug": "ocupado"}, headers=headers
    )

    assert invalid.status_code == 400
    assert conflict.status_code == 400
    assert (upload_dir / name).exists()
    assert name in Article.query.filter_by(id=created["id"]).one().content


def test_failure_deleting_file_never_breaks_the_request(client, admin_token, upload_dir, monkeypatch):
    from app.services import media_cleanup

    name = _upload_name(client, admin_token)
    other = _upload_name(client, admin_token)
    first = make_article(client, admin_token, content=_img(name))
    second = make_article(client, admin_token, title="Segundo", content=_img(other))
    headers = auth_headers(admin_token)

    def broken_remove(path):
        raise PermissionError("disco somente leitura")

    monkeypatch.setattr(media_cleanup.os, "remove", broken_remove)
    assert client.delete(f"/api/admin/articles/{first['id']}", headers=headers).status_code == 204
    monkeypatch.undo()

    # nem uma falha inesperada na própria rotina de limpeza derruba o PUT.
    def exploding_cleanup(*args, **kwargs):
        raise RuntimeError("banco fora do ar")

    from app.api import articles as articles_api

    monkeypatch.setattr(articles_api, "purge_orphan_uploads", exploding_cleanup)
    resp = client.put(f"/api/admin/articles/{second['id']}", json={"content": "<p>sem imagem</p>"}, headers=headers)

    assert resp.status_code == 200
    assert resp.get_json()["data"]["content"] == "<p>sem imagem</p>"
    assert Article.query.count() == 1
    assert (upload_dir / name).exists()
    assert (upload_dir / other).exists()


def test_orphan_purge_removes_only_old_unreferenced_media_files(client, admin_token, upload_dir, app):
    from app.services.media_cleanup import find_orphan_uploads, purge_orphan_uploads

    published_cover = _upload_name(client, admin_token)
    draft_inline = _upload_name(client, admin_token)
    old_orphan = _upload_name(client, admin_token)
    fresh_orphan = _upload_name(client, admin_token)
    make_article(client, admin_token, cover_image=f"/api/media/{published_cover}", published=True)
    make_article(client, admin_token, title="Rascunho", content=_img(draft_inline), published=False)

    # arquivos que NÃO são uploads do painel nunca são tocados, por mais
    # velhos que sejam.
    strangers = ["leia-me.txt", "A" * 32 + ".png", "a" * 32 + ".svg", "a" * 31 + ".png", ".gitkeep"]
    for stranger in strangers:
        (upload_dir / stranger).write_bytes(b"x")
    (upload_dir / ("b" * 32 + ".png")).mkdir()  # diretório com nome de mídia

    for entry in upload_dir.iterdir():
        if entry.name != fresh_orphan:
            _age(entry, hours=48)

    assert find_orphan_uploads(str(upload_dir), 24) == [old_orphan]

    # dry-run lista e não apaga.
    assert purge_orphan_uploads(str(upload_dir), 24, dry_run=True) == [old_orphan]
    assert (upload_dir / old_orphan).exists()

    assert purge_orphan_uploads(str(upload_dir), 24) == [old_orphan]

    assert not (upload_dir / old_orphan).exists()
    assert (upload_dir / published_cover).exists()   # em uso (capa)
    assert (upload_dir / draft_inline).exists()      # em uso por rascunho
    assert (upload_dir / fresh_orphan).exists()      # dentro da carência
    for stranger in strangers:
        assert (upload_dir / stranger).exists()
    assert (upload_dir / ("b" * 32 + ".png")).is_dir()

    # segunda rodada: nada a fazer.
    assert purge_orphan_uploads(str(upload_dir), 24) == []


def test_orphan_purge_tolerates_missing_upload_dir(app, tmp_path):
    from app.services.media_cleanup import purge_orphan_uploads

    assert purge_orphan_uploads(str(tmp_path / "nao-existe"), 24) == []


def test_purge_orphan_uploads_script(client, admin_token, upload_dir, app, capsys):
    import purge_orphan_uploads as script

    used = _upload_name(client, admin_token)
    old_orphan = _upload_name(client, admin_token)
    fresh_orphan = _upload_name(client, admin_token)
    make_article(client, admin_token, content=_img(used))
    _age(upload_dir / used, hours=100)
    _age(upload_dir / old_orphan, hours=30)
    _age(upload_dir / fresh_orphan, hours=2)

    assert app.config["UPLOAD_ORPHAN_MIN_AGE_HOURS"] == 24

    assert script.run(dry_run=True, app=app) == 1
    out = capsys.readouterr().out
    assert "[dry-run]" in out and old_orphan in out and used not in out
    assert (upload_dir / old_orphan).exists()

    assert script.run(app=app) == 1
    assert old_orphan in capsys.readouterr().out
    assert not (upload_dir / old_orphan).exists()
    assert (upload_dir / used).exists()
    assert (upload_dir / fresh_orphan).exists()

    assert script.run(app=app) == 0
    assert "Nenhum upload órfão" in capsys.readouterr().out

    # carência menor informada na linha de comando alcança o mais novo.
    assert script.run(min_age_hours=1, app=app) == 1
    assert not (upload_dir / fresh_orphan).exists()
    assert (upload_dir / used).exists()


# ------------------------------------- validação que só existia no painel --

@pytest.mark.parametrize(
    "content",
    [
        "<p></p>",
        "<p>&nbsp; </p><p><br></p>",
        "<h2>\u00a0</h2><ul><li></li></ul>",
        "<p>\u200b</p>",
    ],
)
def test_article_content_without_visible_text_is_rejected(client, admin_token, content):
    resp = client.post(
        "/api/admin/articles",
        json={"title": "Sem texto", "content": content},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json()["error"] == "validation_error"
    assert "content" in resp.get_json()["details"]
    assert Article.query.count() == 0


def test_put_content_without_visible_text_is_rejected(client, admin_token):
    created = make_article(client, admin_token)

    resp = client.put(
        f"/api/admin/articles/{created['id']}",
        json={"content": "<p></p>"},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert "content" in resp.get_json()["details"]
    assert db_content(created["id"]) == created["content"]


def db_content(article_id):
    return Article.query.filter_by(id=article_id).one().content


@pytest.mark.parametrize(
    "content",
    [
        "<hr>",
        "<p><img src=\"/api/media/" + "a" * 32 + ".png\"></p>",
    ],
)
def test_article_content_with_only_image_or_rule_is_accepted(client, admin_token, content):
    created = make_article(client, admin_token, content=content)

    assert created["content"]


@pytest.mark.parametrize(
    "published_at",
    ["0001-01-01T00:00:00+05:00", "9999-12-31T23:59:59-05:00"],
)
def test_published_at_out_of_range_after_utc_conversion_is_rejected(client, admin_token, published_at):
    resp = client.post(
        "/api/admin/articles",
        json={"title": "Data impossível", "content": "<p>x</p>", "published_at": published_at},
        headers=auth_headers(admin_token),
    )

    assert resp.status_code == 400
    assert resp.get_json() == {
        "error": "validation_error",
        "details": {"published_at": ["Not a valid datetime."]},
    }


@pytest.mark.parametrize("page", ["9" * 30, str(2**62), "100001"])
def test_public_list_huge_page_is_capped_instead_of_500(client, admin_token, page):
    make_article(client, admin_token, published=True)

    resp = client.get(f"/api/articles?page={page}")

    assert resp.status_code == 200
    body = resp.get_json()
    assert body["data"] == []
    assert body["meta"]["page"] == 100_000
    assert body["meta"]["total"] == 1


@pytest.mark.parametrize("value", ["+2", " 2", "1_0", "2.0", "", "٢"])
def test_public_list_pagination_only_accepts_plain_digits(client, value):
    meta = client.get("/api/articles", query_string={"page": value, "per_page": value}).get_json()["meta"]

    assert (meta["page"], meta["per_page"]) == (1, 9)


@pytest.mark.parametrize("method", ["get", "put", "delete"])
def test_article_id_above_db_integer_is_404_not_500(client, admin_token, method):
    for article_id in (2**31, "9" * 30):
        resp = getattr(client, method)(
            f"/api/admin/articles/{article_id}", json={}, headers=auth_headers(admin_token)
        )

        assert resp.status_code == 404
        assert resp.get_json() == {"error": "not_found"}


def test_article_id_at_db_integer_limit_still_reaches_the_view(client, admin_token):
    # Sem token: se a rota casou, quem responde é o require_admin (401).
    assert client.get(f"/api/admin/articles/{2**31 - 1}").status_code == 401
    assert client.get(f"/api/admin/articles/{2**31}").status_code == 404
