"""Limite de tamanho do body por rota.

`MAX_CONTENT_LENGTH` (config.py) é propositalmente baixo (256 KB) para todo
o resto da API. Só duas famílias de rota precisam de mais: o upload de
imagens e o JSON dos artigos (o corpo de um artigo é HTML e pode ser bem
maior que qualquer outro payload). Em vez de subir o teto global - e abrir
`/api/leads`, que é público, para bodies de vários MB - o teto é escolhido
por caminho aqui.

Também moram aqui dois outros limites "de forma" da requisição, aplicados
antes de qualquer view: a profundidade do JSON (`get_json`) e a faixa dos
ids inteiros na URL (`reject_out_of_range_ids`).
"""

from flask import Request, current_app, request
from werkzeug.exceptions import BadRequest

UPLOADS_PATH = "/api/admin/uploads"
ARTICLES_PATH_PREFIX = "/api/admin/articles"

# Folga para o envelope multipart (boundaries/headers do campo) em cima do
# tamanho máximo do arquivo em si, que é conferido de novo na view.
_MULTIPART_OVERHEAD = 64 * 1024


class RouteLimitedRequest(Request):
    @property
    def max_content_length(self) -> int | None:  # type: ignore[override]
        if current_app:
            if self.path == UPLOADS_PATH:
                return current_app.config["UPLOAD_MAX_BYTES"] + _MULTIPART_OVERHEAD
            if self.path.startswith(ARTICLES_PATH_PREFIX):
                return current_app.config["ARTICLE_MAX_CONTENT_LENGTH"]
            return current_app.config["MAX_CONTENT_LENGTH"]
        return None

    def get_json(self, force: bool = False, silent: bool = False, cache: bool = True):  # type: ignore[override]
        # Um body como "[[[[...]]]]" com milhares de níveis cabe folgado nos
        # 256 KB e estoura a recursão do parser (RecursionError). Como não é
        # ValueError, o `silent=True` das views não pegava e a resposta era
        # 500 - inclusive em /api/leads, que é público. Tratado como
        # qualquer outro JSON inválido.
        try:
            return super().get_json(force=force, silent=silent, cache=cache)
        except RecursionError:
            if silent:
                return None
            raise BadRequest() from None


# Maior valor de uma coluna INTEGER (32 bits com sinal) - todas as chaves
# primárias do projeto.
DB_INT_MAX = 2**31 - 1


def reject_out_of_range_ids():
    """`before_request` (registrado em app/__init__.py) para toda rota com
    `<int:...>`.

    O conversor `int` aceita qualquer quantidade de dígitos; um id acima do
    INTEGER do banco chegava até a consulta e estourava em 500 ("integer out
    of range" no Postgres). Um id desses não existe, então a resposta é o
    mesmo 404 `not_found` de um id inexistente. (O `max=` do próprio
    conversor não serve: com várias regras no mesmo caminho, uma por método,
    o werkzeug responde 405 em vez de 404.)
    """
    for value in (request.view_args or {}).values():
        # bool é subclasse de int, mas nenhum conversor de rota devolve bool.
        if isinstance(value, int) and value > DB_INT_MAX:
            return {"error": "not_found"}, 404
    return None
