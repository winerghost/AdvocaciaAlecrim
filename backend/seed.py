"""Popula o banco com o conteúdo real da landing atual (Dr. Alecrim.dc.html).

Uso:
    python seed.py
    # ou, com o compose já rodando:
    docker compose exec backend python seed.py

É idempotente: só insere se a tabela correspondente estiver vazia.
"""

from app import create_app
from app.extensions import db
from app.models import Service, Testimonial

SERVICES = [
    dict(
        slug="inventario-judicial",
        title="Inventário Judicial",
        icon="scale",
        description=(
            "Condução completa em juízo para casos com divergência entre "
            "herdeiros ou complexidade patrimonial."
        ),
        order=1,
    ),
    dict(
        slug="aposentadoria",
        title="Aposentadoria",
        icon="users",
        description=(
            "Gestão completa de processos de aposentadoria com expertise em "
            "documentação e legislação previdenciária."
        ),
        order=2,
    ),
    dict(
        slug="acao-trabalhista",
        title="Ação Trabalhista",
        icon="arrows",
        description=(
            "Defesa de direitos trabalhistas com análise detalhada de "
            "contratos e reparação de danos."
        ),
        order=3,
    ),
    dict(
        slug="acao-civel",
        title="Ação Cível",
        icon="circle",
        description=(
            "Representação em ações civis diversas com foco em indenizações "
            "e resolução de conflitos."
        ),
        order=4,
    ),
]

TESTIMONIALS = [
    dict(
        author="Maria Silva",
        role="Cliente satisfeita",
        rating=5,
        approved=True,
        content=(
            "Dr. Alecrim foi muito atencioso no processo de inventário. "
            "Explicou tudo com clareza e resolveu rápido."
        ),
    ),
    dict(
        author="João Santos",
        role="Cliente satisfeito",
        rating=5,
        approved=True,
        content=(
            "Excelente profissional. Conseguiu resolver meu caso trabalhista "
            "de forma justa e rápida."
        ),
    ),
    dict(
        author="Ana Martins",
        role="Cliente satisfeita",
        rating=5,
        approved=True,
        content=(
            "Profissional experiente e humano. Entendeu perfeitamente a "
            "situação e deu a melhor orientação."
        ),
    ),
]


def run() -> None:
    app = create_app()
    with app.app_context():
        db.create_all()

        if not Service.query.first():
            db.session.bulk_save_objects([Service(**s) for s in SERVICES])
            print(f"Seed: {len(SERVICES)} serviços inseridos.")
        else:
            print("Seed: tabela 'services' já tem dados, pulando.")

        if not Testimonial.query.first():
            db.session.bulk_save_objects([Testimonial(**t) for t in TESTIMONIALS])
            print(f"Seed: {len(TESTIMONIALS)} depoimentos inseridos.")
        else:
            print("Seed: tabela 'testimonials' já tem dados, pulando.")

        db.session.commit()


if __name__ == "__main__":
    run()
