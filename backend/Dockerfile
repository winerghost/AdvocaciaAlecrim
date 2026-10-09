# ---- builder ----
# gcc/libpq-dev só existem pra compilar as dependências Python (algumas
# ainda trazem sdist sem wheel pronto pra essa combinação de plataforma) -
# não precisam sobreviver na imagem final que roda em produção.
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt constraints.txt ./
# requirements.txt lista só as dependências diretas; constraints.txt trava
# a versão de todas (inclusive as transitivas), pra que dois builds do mesmo
# commit instalem exatamente os mesmos pacotes.
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt -c constraints.txt
# Um pacote instalado que não esteja em constraints.txt entrou com versão
# livre (uma transitiva nova, por exemplo): falha o build em vez de deixar
# passar - a correção é regenerar o constraints.txt (instruções no próprio
# arquivo). Nomes comparados sem diferenciar maiúsculas nem "-" de "_".
RUN pip freeze --path /install/lib/python3.12/site-packages | tr 'A-Z_' 'a-z-' > /tmp/instalado.txt \
    && sed 's/ *;.*//' constraints.txt | tr -d '\r' | tr 'A-Z_' 'a-z-' > /tmp/travado.txt \
    && if grep -vxFf /tmp/travado.txt /tmp/instalado.txt; then \
         echo "ERRO: pacotes acima instalados sem versão travada em constraints.txt" >&2; exit 1; \
       fi

# ---- runtime ----
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# libpq5 é só a lib cliente do Postgres em runtime (sem headers/compilador)
# - psycopg2-binary já embute a maior parte do necessário, mas mantemos
# isso como garantia sem aumentar a superfície com gcc/libpq-dev na imagem
# que roda exposta.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /install /usr/local

COPY . .
# /app/uploads é onde o docker-compose.yml monta o volume `uploads_data`
# (imagens enviadas pelo painel). O diretório precisa existir na imagem já
# com o dono certo: um volume nomeado novo herda dono/permissão do caminho
# da imagem, e é o `appuser` (não root) que grava ali.
RUN chmod +x entrypoint.sh \
    && mkdir -p /app/uploads \
    && useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
