import os
import subprocess
import sys

import pytest
from werkzeug.security import check_password_hash, generate_password_hash

import seed
from app.extensions import db
from app.models import AdminUser, Service

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GOOD_EMAIL = "dr.alecrim@advocaciaalecrim.com.br"
GOOD_PASSWORD = "Uma-Senha-Bem-Forte-2026"


def _set_admin_env(monkeypatch, email, password):
    for name, value in (("ADMIN_EMAIL", email), ("ADMIN_PASSWORD", password)):
        if value is None:
            monkeypatch.delenv(name, raising=False)
        else:
            monkeypatch.setenv(name, value)


def test_seed_creates_admin_with_valid_credentials(app, monkeypatch, capsys):
    _set_admin_env(monkeypatch, f"  {GOOD_EMAIL.upper()} ", GOOD_PASSWORD)

    seed.run(app=app)

    admin = AdminUser.query.one()
    assert admin.email == GOOD_EMAIL
    assert check_password_hash(admin.password_hash, GOOD_PASSWORD)
    assert Service.query.count() == len(seed.SERVICES)
    # a senha nunca vai para a saída do seed.
    assert GOOD_PASSWORD not in capsys.readouterr().out


@pytest.mark.parametrize(
    "email,password,expected",
    [
        # senha curta (mínimo é o mesmo do painel: 12).
        (GOOD_EMAIL, "curta", "ADMIN_PASSWORD tem menos de 12"),
        (GOOD_EMAIL, "123456789", "ADMIN_PASSWORD tem menos de 12"),
        (GOOD_EMAIL, "Xk9#mPq2vLz", "ADMIN_PASSWORD tem menos de 12"),
        # mesma política do painel (app/utils/password_policy.py).
        (GOOD_EMAIL, " " * 16, "ADMIN_PASSWORD é só espaço em branco"),
        (GOOD_EMAIL, "aaaaaaaaaaaa", "ADMIN_PASSWORD é repetitiva"),
        (GOOD_EMAIL, "123456789012", "ADMIN_PASSWORD é uma sequência previsível"),
        (GOOD_EMAIL, "Advocacia2026", "ADMIN_PASSWORD é uma senha comum"),
        (GOOD_EMAIL, "DrAlecrim#8841", "ADMIN_PASSWORD contém o e-mail da conta"),
        (GOOD_EMAIL, GOOD_EMAIL.upper(), "ADMIN_PASSWORD contém o e-mail da conta"),
        # placeholders versionados nos .env.example.
        (GOOD_EMAIL, "troque-por-uma-senha-forte", "ADMIN_PASSWORD é a senha de exemplo"),
        (GOOD_EMAIL, "troque-a-senha", "ADMIN_PASSWORD é a senha de exemplo"),
        (GOOD_EMAIL, "troque-por-uma-chave-aleatoria-longa", "ADMIN_PASSWORD é a senha de exemplo"),
        (GOOD_EMAIL, "change-me-in-production", "ADMIN_PASSWORD é a senha de exemplo"),
        ("admin@example.com", GOOD_PASSWORD, "ADMIN_EMAIL é o e-mail de exemplo"),
        (" Admin@Example.com ", GOOD_PASSWORD, "ADMIN_EMAIL é o e-mail de exemplo"),
        # o par inteiro do backend/.env.example, descomentado sem editar.
        ("admin@example.com", "troque-por-uma-senha-forte", "ADMIN_PASSWORD é a senha de exemplo"),
        ("nao-e-um-email", GOOD_PASSWORD, "ADMIN_EMAIL não é um endereço"),
        # acima do teto, o login recusaria a senha para sempre.
        (GOOD_EMAIL, "x1Y2z3" * 30, "ADMIN_PASSWORD tem mais de 128"),
    ],
)
def test_seed_refuses_weak_or_placeholder_admin(app, monkeypatch, email, password, expected):
    _set_admin_env(monkeypatch, email, password)

    with pytest.raises(SystemExit) as excinfo:
        seed.run(app=app)

    # código de saída != 0 (SystemExit com mensagem = exit 1) e explicação.
    message = str(excinfo.value.code)
    assert excinfo.value.code not in (0, None)
    assert expected in message
    assert "backend/.env" in message
    # a senha recusada não é repetida na mensagem.
    assert password not in message

    db.session.rollback()
    assert AdminUser.query.count() == 0
    # nada do seed é gravado quando ele aborta.
    assert Service.query.count() == 0


def test_seed_reports_every_problem_at_once(app, monkeypatch):
    _set_admin_env(monkeypatch, "admin@example.com", "curta")

    with pytest.raises(SystemExit) as excinfo:
        seed.run(app=app)

    message = str(excinfo.value.code)
    assert "ADMIN_EMAIL" in message and "ADMIN_PASSWORD" in message


@pytest.mark.parametrize(
    "email,password",
    [(None, None), ("", ""), (GOOD_EMAIL, None), (None, GOOD_PASSWORD), (GOOD_EMAIL, "")],
)
def test_seed_without_admin_env_only_warns(app, monkeypatch, capsys, email, password):
    # Comportamento antigo preservado: variáveis ausentes não são erro - o
    # conteúdo é semeado e o seed só avisa que o login ainda não funciona.
    _set_admin_env(monkeypatch, email, password)

    seed.run(app=app)

    assert AdminUser.query.count() == 0
    assert Service.query.count() == len(seed.SERVICES)
    assert "ADMIN_EMAIL/ADMIN_PASSWORD não definidos" in capsys.readouterr().out


def test_seed_ignores_admin_env_when_an_admin_already_exists(app, monkeypatch, capsys):
    # Com a tabela já populada as variáveis nem são lidas: valores de
    # exemplo esquecidos em backend/.env não derrubam um deploy existente.
    db.session.add(AdminUser(email="ja-existe@advocaciaalecrim.com.br", password_hash=generate_password_hash(GOOD_PASSWORD)))
    db.session.commit()
    _set_admin_env(monkeypatch, "admin@example.com", "troque-por-uma-senha-forte")

    seed.run(app=app)

    assert [a.email for a in AdminUser.query.all()] == ["ja-existe@advocaciaalecrim.com.br"]
    assert "já tem dados" in capsys.readouterr().out


def _run_seed_script(tmp_path, **env_overrides):
    """`python seed.py` de verdade, em outro processo, contra um SQLite
    temporário - é o que o entrypoint.sh (com `set -e`) executa.
    """
    from cryptography.fernet import Fernet

    env = {k: v for k, v in os.environ.items() if not k.startswith(("ADMIN_", "FLASK_"))}
    env.update(
        SECRET_KEY="9f2c4b7a1d3e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5061728394a5b6c7d8e",
        FIELD_ENCRYPTION_KEY=Fernet.generate_key().decode(),
        DATABASE_URL="sqlite:///" + str(tmp_path / "seed.db").replace("\\", "/"),
        PYTHONIOENCODING="utf-8",
    )
    env.update(env_overrides)
    return subprocess.run(
        [sys.executable, "seed.py"],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=120,
    )


def test_seed_script_exits_non_zero_with_example_credentials(tmp_path):
    result = _run_seed_script(tmp_path, ADMIN_EMAIL="admin@example.com", ADMIN_PASSWORD="troque-por-uma-senha-forte")

    assert result.returncode != 0
    assert "admin inicial NÃO criado" in result.stderr
    assert "troque-por-uma-senha-forte" not in result.stdout + result.stderr


def test_seed_script_exits_zero_with_valid_credentials(tmp_path):
    result = _run_seed_script(tmp_path, ADMIN_EMAIL=GOOD_EMAIL, ADMIN_PASSWORD=GOOD_PASSWORD)

    assert result.returncode == 0, result.stderr
    assert f"admin criado ({GOOD_EMAIL})" in result.stdout
    assert GOOD_PASSWORD not in result.stdout + result.stderr
