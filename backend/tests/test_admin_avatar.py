"""Foto/avatar do admin (Configurações > Perfil): toda regra no backend."""

import io
import os
import re
import time

import pytest
from PIL import Image, features
from werkzeug.security import generate_password_hash

from app.extensions import db
from app.models import AdminUser, AuditEvent
from app.services import avatar as avatar_service
from app.utils.auth import issue_token

from conftest import ADMIN_PASSWORD
from purge_orphan_uploads import run as run_orphan_purge

AVATAR_URL = "/api/admin/me/avatar"
PRESET_URL = "/api/admin/me/avatar/preset"
NAME_RE = re.compile(r"^[0-9a-f]{32}\.webp$")


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def make_image(fmt="PNG", size=(800, 600), mode="RGB", **save_kwargs) -> bytes:
    color = (200, 10, 10, 255)[: len(mode)] if mode in ("RGB", "RGBA") else 1
    out = io.BytesIO()
    Image.new(mode, size, color).save(out, format=fmt, **save_kwargs)
    return out.getvalue()


def post_avatar(client, token, data, filename="foto.png", content_type="image/png", **extra):
    return client.post(
        AVATAR_URL,
        data={"file": (io.BytesIO(data), filename, content_type), **extra},
        headers=auth(token),
        content_type="multipart/form-data",
    )


@pytest.fixture(autouse=True)
def upload_dir(app, tmp_path):
    directory = tmp_path / "uploads"
    app.config["UPLOAD_DIR"] = str(directory)
    return directory


@pytest.fixture
def avatar_dir(upload_dir):
    return upload_dir / "avatars"


@pytest.fixture
def other_admin(app):
    user = AdminUser(email="outro@example.com", password_hash=generate_password_hash("Outra-Senha-123!"))
    db.session.add(user)
    db.session.commit()
    return user


def files_in(directory):
    return sorted(os.listdir(directory)) if directory.exists() else []


def stored_name(client, token):
    url = client.get("/api/admin/me", headers=auth(token)).get_json()["avatar"]["url"]
    return url.rsplit("/", 1)[1]


# ------------------------------------------------------------ autenticação --

def test_webp_support_is_available():
    assert features.check("webp")


@pytest.mark.parametrize(
    "method,url",
    [
        ("post", AVATAR_URL),
        ("put", PRESET_URL),
        ("delete", AVATAR_URL),
        ("get", "/api/admin/avatars/" + "a" * 32 + ".webp"),
    ],
)
def test_avatar_routes_require_auth(client, avatar_dir, method, url):
    kwargs = {"json": {"preset": "livro"}} if method == "put" else {}
    resp = getattr(client, method)(url, **kwargs)
    assert resp.status_code == 401
    assert resp.get_json() == {"error": "unauthorized"}
    assert files_in(avatar_dir) == []


def test_upload_only_affects_own_account(client, admin, admin_token, other_admin, avatar_dir):
    other_token = issue_token(other_admin)
    assert client.put(PRESET_URL, json={"preset": "pena"}, headers=auth(other_token)).status_code == 200

    # Campos extras que tentem apontar outra conta são ignorados.
    resp = post_avatar(client, admin_token, make_image(), user_id=str(other_admin.id), id=str(other_admin.id))
    assert resp.status_code == 200, resp.get_json()

    db.session.expire_all()
    assert db.session.get(AdminUser, other_admin.id).avatar == "preset:pena"
    assert NAME_RE.match(db.session.get(AdminUser, admin.id).avatar)


# ------------------------------------------------------------ processamento --

def test_upload_returns_256_webp_without_metadata(client, admin_token, avatar_dir):
    exif = Image.Exif()
    exif[0x010F] = "Canon"  # fabricante
    exif[0x8825] = {2: (10.0, 20.0, 30.0)}  # bloco GPS
    resp = post_avatar(client, admin_token, make_image("JPEG", (1200, 800), exif=exif.tobytes()), "foto.jpg", "image/jpeg")
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()["data"]["avatar"]
    assert data["type"] == "photo"
    assert re.fullmatch(r"/api/admin/avatars/[0-9a-f]{32}\.webp", data["url"])

    [name] = files_in(avatar_dir)
    with Image.open(avatar_dir / name) as image:
        assert image.format == "WEBP"
        assert image.size == (256, 256)
        assert len(image.getexif()) == 0
        assert "icc_profile" not in image.info and "xmp" not in image.info


def test_transparent_png_and_webp_are_accepted(client, admin_token):
    assert post_avatar(client, admin_token, make_image("PNG", (300, 300), "RGBA")).status_code == 200
    assert post_avatar(client, admin_token, make_image("WEBP", (300, 400))).status_code == 200


def test_client_filename_and_type_are_ignored(client, admin_token, avatar_dir, upload_dir):
    resp = post_avatar(client, admin_token, make_image(), "../../evil.svg", "text/html")
    assert resp.status_code == 200
    [name] = files_in(avatar_dir)
    assert NAME_RE.match(name)
    assert files_in(upload_dir) == ["avatars"]


def _png_with_trailing_html():
    return make_image() + b"<html><script>alert(1)</script></html>"


@pytest.mark.parametrize(
    "payload",
    [
        b"<html><script>alert(1)</script></html>",
        b"\x89PNG\r\n\x1a\n" + b"\x00" * 64,  # só a assinatura
        make_image()[:200],  # truncada
        b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        b"GIF89a" + b"\x00" * 32 + b"<script>alert(1)</script>",
        make_image("GIF", (300, 300), "P"),  # GIF não é aceito
        make_image("BMP", (300, 300)),
        make_image("TIFF", (300, 300)),
        b"",
    ],
    ids=["html", "fake-magic", "truncated", "svg", "gif-polyglot", "gif", "bmp", "tiff", "empty"],
)
def test_bad_payloads_are_rejected(client, admin, admin_token, avatar_dir, payload):
    resp = post_avatar(client, admin_token, payload)
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_image"}
    assert files_in(avatar_dir) == []
    assert db.session.get(AdminUser, admin.id).avatar is None


def test_polyglot_is_reencoded(client, admin_token, avatar_dir):
    # Imagem válida com HTML "pendurado" depois: aceita, mas o que fica no
    # disco é um WebP novo, sem o conteúdo extra.
    assert post_avatar(client, admin_token, _png_with_trailing_html()).status_code == 200
    [name] = files_in(avatar_dir)
    assert b"<script>" not in (avatar_dir / name).read_bytes()


def test_missing_file_field(client, admin_token):
    resp = client.post(AVATAR_URL, data={}, headers=auth(admin_token), content_type="multipart/form-data")
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "invalid_image"}


def test_decompression_bomb_is_rejected(client, admin_token, avatar_dir):
    bomb = make_image("PNG", (6000, 6000), "1")  # 36 MP em poucos KB
    assert len(bomb) < 200_000
    resp = post_avatar(client, admin_token, bomb)
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "image_too_large_dimensions"}
    assert files_in(avatar_dir) == []


def test_tiny_image_is_rejected(client, admin_token):
    resp = post_avatar(client, admin_token, make_image("PNG", (40, 300)))
    assert resp.get_json() == {"error": "image_too_small"}


def test_file_too_large(app, client, admin_token, avatar_dir):
    app.config["AVATAR_MAX_BYTES"] = 50_000
    big = make_image("PNG", (600, 600)) + b"\x00" * 60_000
    resp = post_avatar(client, admin_token, big)
    assert resp.status_code == 413
    assert resp.get_json() == {"error": "file_too_large"}
    assert files_in(avatar_dir) == []


def test_avatar_body_limit_is_route_specific(app, client, admin_token):
    # Acima do teto global de 256 KB, abaixo do teto do avatar.
    payload = make_image("PNG", (900, 900)) + b"\x00" * (400 * 1024)
    assert len(payload) > app.config["MAX_CONTENT_LENGTH"]
    assert post_avatar(client, admin_token, payload).status_code == 200


# ----------------------------------------------------------- armazenamento --

def test_avatar_is_not_public_media_nor_in_gallery(client, admin_token):
    post_avatar(client, admin_token, make_image())
    name = stored_name(client, admin_token)
    assert client.get(f"/api/media/{name}").status_code == 404
    gallery = client.get("/api/admin/uploads", headers=auth(admin_token)).get_json()["data"]
    assert all(name not in item["url"] for item in gallery)


def test_serve_avatar_headers(client, admin_token):
    post_avatar(client, admin_token, make_image())
    name = stored_name(client, admin_token)
    resp = client.get(f"/api/admin/avatars/{name}", headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.mimetype == "image/webp"
    assert resp.headers["X-Content-Type-Options"] == "nosniff"
    assert "sandbox" in resp.headers["Content-Security-Policy"]
    assert resp.headers["Cross-Origin-Resource-Policy"] == "same-origin"
    assert resp.headers["Cache-Control"].startswith("private")


@pytest.mark.parametrize(
    "name",
    ["..%2F..%2Fapp.db", "a" * 32 + ".png", "A" * 32 + ".webp", "a" * 31 + ".webp", "x.webp.tmp", "a" * 32 + ".webp"],
)
def test_serve_avatar_rejects_other_names(client, admin_token, name):
    assert client.get(f"/api/admin/avatars/{name}", headers=auth(admin_token)).status_code == 404


def test_replace_and_switch_remove_old_files(client, admin_token, avatar_dir):
    post_avatar(client, admin_token, make_image())
    first = files_in(avatar_dir)
    post_avatar(client, admin_token, make_image("JPEG", (400, 400)), "b.jpg", "image/jpeg")
    second = files_in(avatar_dir)
    assert len(second) == 1 and second != first

    assert client.put(PRESET_URL, json={"preset": "balanca"}, headers=auth(admin_token)).status_code == 200
    assert files_in(avatar_dir) == []


def test_delete_avatar_is_idempotent(client, admin, admin_token, avatar_dir):
    post_avatar(client, admin_token, make_image())
    for _ in range(2):
        resp = client.delete(AVATAR_URL, headers=auth(admin_token))
        assert resp.status_code == 200
        assert resp.get_json() == {"data": {"avatar": None}}
    assert files_in(avatar_dir) == []
    assert db.session.get(AdminUser, admin.id).avatar is None


def test_deleting_admin_removes_photo(client, admin_token, other_admin, avatar_dir):
    post_avatar(client, issue_token(other_admin), make_image())
    assert len(files_in(avatar_dir)) == 1
    resp = client.delete(
        f"/api/admin/users/{other_admin.id}", json={"current_password": ADMIN_PASSWORD}, headers=auth(admin_token)
    )
    assert resp.status_code == 204
    assert files_in(avatar_dir) == []


def test_failed_commit_leaves_no_file(app, client, admin_token, avatar_dir, monkeypatch):
    from sqlalchemy.exc import OperationalError

    def broken_commit():
        raise OperationalError("UPDATE", {}, Exception("db down"))

    monkeypatch.setattr(db.session, "commit", broken_commit)
    resp = post_avatar(client, admin_token, make_image())
    monkeypatch.undo()
    assert resp.status_code == 500
    assert resp.get_json() == {"error": "storage_error"}
    assert files_in(avatar_dir) == []


def test_orphan_purge_keeps_avatars_in_use(app, client, admin_token, avatar_dir):
    post_avatar(client, admin_token, make_image())
    [in_use] = files_in(avatar_dir)
    orphan = avatar_dir / ("b" * 32 + ".webp")
    stale_tmp = avatar_dir / ("c" * 32 + ".webp.tmp")
    fresh_orphan = avatar_dir / ("d" * 32 + ".webp")
    for path in (orphan, stale_tmp, fresh_orphan):
        path.write_bytes(b"x")
    old = time.time() - 2 * 3600
    for path in (avatar_dir / in_use, orphan, stale_tmp):
        os.utime(path, (old, old))

    run_orphan_purge(app=app)
    assert files_in(avatar_dir) == sorted([in_use, fresh_orphan.name])


# ------------------------------------------------------------------ preset --

def test_preset_allowlist(client, admin_token):
    resp = client.put(PRESET_URL, json={"preset": "livro"}, headers=auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json() == {"data": {"avatar": {"type": "preset", "preset": "livro"}}}
    for bad in ("../x", "http://evil.example/a.png", "", 123, None, "LIVRO", "preset:livro"):
        resp = client.put(PRESET_URL, json={"preset": bad}, headers=auth(admin_token))
        assert resp.get_json() == {"error": "invalid_preset"}, bad
    resp = client.put(PRESET_URL, data="x", headers={**auth(admin_token), "Content-Type": "application/json"})
    assert resp.get_json() == {"error": "invalid_json"}


# --------------------------------------------------------------------- /me --

def test_me_returns_avatar(client, admin, admin_token):
    me = client.get("/api/admin/me", headers=auth(admin_token)).get_json()
    assert me["avatar"] is None
    assert me["avatar_presets"] == list(avatar_service.AVATAR_PRESETS)

    post_avatar(client, admin_token, make_image())
    me = client.get("/api/admin/me", headers=auth(admin_token)).get_json()
    assert me["avatar"]["type"] == "photo"
    assert "uploads" not in me["avatar"]["url"]


@pytest.mark.parametrize("value", ["preset:inexistente", "../../etc/passwd", "a" * 32 + ".png", "lixo"])
def test_unexpected_db_value_reads_as_no_avatar(client, admin, admin_token, value):
    admin.avatar = value
    db.session.commit()
    assert client.get("/api/admin/me", headers=auth(admin_token)).get_json()["avatar"] is None
    # E nenhum arquivo é tocado ao trocar.
    assert client.put(PRESET_URL, json={"preset": "folha"}, headers=auth(admin_token)).status_code == 200


# --------------------------------------------------------- auditoria/limite --

def test_avatar_change_is_audited(client, admin, admin_token):
    post_avatar(client, admin_token, make_image())
    client.put(PRESET_URL, json={"preset": "folha"}, headers=auth(admin_token))
    client.delete(AVATAR_URL, headers=auth(admin_token))
    events = AuditEvent.query.filter_by(event="profile_avatar_updated", actor_id=admin.id).all()
    assert sorted(e.detail.get("kind") for e in events) == ["preset", "removed", "upload"]
    activity = client.get("/api/admin/me/activity", headers=auth(admin_token)).get_json()["data"]
    assert any(e["event"] == "profile_avatar_updated" for e in activity)


def test_upload_is_rate_limited(client, admin_token):
    image = make_image("PNG", (100, 100))
    codes = [post_avatar(client, admin_token, image).status_code for _ in range(11)]
    assert codes[:10] == [200] * 10
    assert codes[10] == 429
