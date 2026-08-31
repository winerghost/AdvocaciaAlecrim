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

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

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
RUN chmod +x entrypoint.sh \
    && useradd --create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

ENTRYPOINT ["./entrypoint.sh"]
