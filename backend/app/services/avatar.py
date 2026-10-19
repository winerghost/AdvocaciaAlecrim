"""Foto/avatar do admin (Configurações > Perfil).

Toda regra mora aqui; o frontend só envia o arquivo e mostra o resultado.

`admin_users.avatar` guarda uma de três formas, sempre conferida na leitura:
  - `NULL`             -> sem avatar (o painel mostra as iniciais);
  - `preset:<id>`      -> um dos avatares padrão de `AVATAR_PRESETS`;
  - `<32 hex>.webp`    -> foto enviada, em `UPLOAD_DIR/avatars/`.

Foto enviada:
  - só JPEG, PNG ou WebP, e só esses decodificadores do Pillow rodam
    (`formats=`): SVG, GIF, TIFF, EPS etc. nem são abertos;
  - teto de bytes (`AVATAR_MAX_BYTES`), de pixels (antes de decodificar, contra
    "bomba de descompressão") e lado mínimo;
  - a imagem é decodificada, girada pelo EXIF, recortada em quadrado e
    redimensionada para 256x256 e gravada como um WebP NOVO. Os bytes
    enviados nunca vão para o disco: some EXIF/GPS (dado pessoal) e qualquer
    conteúdo escondido (polyglot imagem + HTML/script);
  - nome aleatório gerado aqui; o nome enviado pelo cliente é ignorado;
  - pasta própria, fora de `/api/media` (público), da galeria e do expurgo de
    imagens de artigo. Servida só para admin logado.
"""

from __future__ import annotations

import io
import os
import re
import threading
import time
import uuid
import warnings

from flask import current_app

AVATAR_SIZE = 256
AVATAR_FILENAME_PATTERN = r"[0-9a-f]{32}\.webp"
_AVATAR_FILENAME_RE = re.compile(AVATAR_FILENAME_PATTERN)
_PRESET_PREFIX = "preset:"

# Avatares padrão. O frontend desenha cada id; a lista que vale é esta.
AVATAR_PRESETS = (
    "balanca",
    "livro",
    "pilar",
    "folha",
    "pena",
    "escudo",
    "estrela",
    "monograma",
)

_ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")
MIN_SIDE = 64
# 25 MP cobre foto de celular comum; acima disso a decodificação sozinha
# passa de 100 MB de RAM num container de 512 MB.
MAX_PIXELS = 25_000_000
# No máximo 2 decodificações ao mesmo tempo por processo (memória).
_DECODE_SLOTS = threading.BoundedSemaphore(2)


class AvatarError(Exception):
    """Erro de validação com o código devolvido à API."""

    def __init__(self, code: str, status: int = 400):
        super().__init__(code)
        self.code = code
        self.status = status


# ------------------------------------------------------------- leitura --

def avatar_dir() -> str:
    return os.path.join(os.path.abspath(current_app.config["UPLOAD_DIR"]), "avatars")


def is_avatar_filename(value) -> bool:
    return isinstance(value, str) and _AVATAR_FILENAME_RE.fullmatch(value) is not None


def stored_filename(value) -> str | None:
    """Nome do arquivo de foto guardado na coluna, ou None (preset/nada/lixo)."""
    return value if is_avatar_filename(value) else None


def avatar_payload(value) -> dict | None:
    """Forma pública do avatar para `/me`. Valor fora do formato = sem avatar."""
    if is_avatar_filename(value):
        return {"type": "photo", "url": f"/api/admin/avatars/{value}"}
    if isinstance(value, str) and value.startswith(_PRESET_PREFIX):
        preset = value[len(_PRESET_PREFIX):]
        if preset in AVATAR_PRESETS:
            return {"type": "preset", "preset": preset}
    return None


def preset_value(preset) -> str:
    if not isinstance(preset, str) or preset not in AVATAR_PRESETS:
        raise AvatarError("invalid_preset")
    return _PRESET_PREFIX + preset


# --------------------------------------------------------- processamento --

def process_image(data: bytes) -> bytes:
    """Valida e recodifica a imagem enviada. Devolve os bytes do WebP final."""
    from PIL import Image, ImageOps, UnidentifiedImageError

    if not data:
        raise AvatarError("invalid_image")

    with _DECODE_SLOTS, warnings.catch_warnings():
        # Aviso de "imagem grande demais" vira erro em vez de seguir.
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        try:
            with Image.open(io.BytesIO(data), formats=_ALLOWED_FORMATS) as image:
                width, height = image.size
                # Só o cabeçalho foi lido até aqui: recusa antes de alocar.
                if width * height > MAX_PIXELS:
                    raise AvatarError("image_too_large_dimensions")
                if min(width, height) < MIN_SIDE:
                    raise AvatarError("image_too_small")
                if image.format == "JPEG":
                    # Decodifica já reduzido (1/2, 1/4, 1/8): bem menos RAM.
                    image.draft("RGB", (AVATAR_SIZE * 2, AVATAR_SIZE * 2))
                image.seek(0)  # animado (WebP/PNG): só o primeiro quadro
                image.load()
                image = ImageOps.exif_transpose(image)
                image = image.convert("RGBA" if _has_alpha(image) else "RGB")
                image = ImageOps.fit(image, (AVATAR_SIZE, AVATAR_SIZE), Image.Resampling.LANCZOS)
                image.info = {}
                out = io.BytesIO()
                image.save(out, format="WEBP", quality=85, method=4, exif=b"", icc_profile=None)
        except AvatarError:
            raise
        except (
            UnidentifiedImageError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
            OSError,
            ValueError,
            SyntaxError,
            EOFError,
            TypeError,
            IndexError,
            KeyError,
        ):
            raise AvatarError("invalid_image") from None
        except MemoryError:
            raise AvatarError("image_too_large_dimensions") from None
    return out.getvalue()


def _has_alpha(image) -> bool:
    return image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)


# ---------------------------------------------------------------- disco --

def write_avatar(webp: bytes) -> str:
    """Grava atomicamente (.tmp + rename) e devolve o nome gerado."""
    directory = avatar_dir()
    os.makedirs(directory, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.webp"
    final = os.path.join(directory, filename)
    tmp = final + ".tmp"
    try:
        with open(tmp, "wb") as handle:
            handle.write(webp)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, final)
    except OSError:
        _silent_remove(tmp)
        raise AvatarError("storage_error", 500) from None
    return filename


def remove_avatar_file(value) -> None:
    """Apaga o arquivo de uma foto (melhor esforço). Preset/nada: não faz nada."""
    filename = stored_filename(value)
    if filename is None:
        return
    path = os.path.join(avatar_dir(), filename)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass
    except OSError:
        current_app.logger.exception("Falha ao apagar avatar %s", filename)


def _silent_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass


def purge_orphan_avatars(referenced: set[str], min_age_seconds: float = 3600, *, dry_run: bool = False) -> list[str]:
    """Fotos que nenhum admin usa (sobra de queda no meio da troca) e `.tmp`
    esquecidos, com mais de `min_age_seconds`. Outros arquivos são ignorados."""
    directory = avatar_dir()
    try:
        names = os.listdir(directory)
    except FileNotFoundError:
        return []
    now = time.time()
    removed = []
    for name in sorted(names):
        is_tmp = name.endswith(".webp.tmp") and is_avatar_filename(name[:-4])
        if not (is_tmp or (is_avatar_filename(name) and name not in referenced)):
            continue
        path = os.path.join(directory, name)
        try:
            if not os.path.isfile(path) or now - os.path.getmtime(path) < min_age_seconds:
                continue
            if not dry_run:
                os.remove(path)
        except OSError:
            continue
        removed.append(name)
    return removed
