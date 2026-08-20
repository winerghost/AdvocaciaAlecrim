"""Popula o banco com o conteúdo real da landing atual (Dr. Alecrim.dc.html).

Uso:
    python seed.py
    # ou, com o compose já rodando:
    docker compose exec backend python seed.py

É idempotente: só insere se a tabela correspondente estiver vazia.
"""

import os

from werkzeug.security import generate_password_hash

from app import create_app
from app.extensions import db
from app.models import AdminUser, Faq, Service, Testimonial

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


FAQS = [
    dict(
        question="A primeira consulta é gratuita?",
        answer=(
            "Sim. A primeira conversa é sem custo e serve para entender o seu "
            "caso e explicar os próximos passos antes de qualquer contratação."
        ),
        order=1,
    ),
    dict(
        question="Quanto tempo leva um inventário judicial?",
        answer=(
            "Varia com a quantidade de bens e se há ou não divergência entre "
            "herdeiros. Casos sem conflito tendem a ser mais rápidos; a "
            "estimativa exata é passada já na primeira consulta."
        ),
        order=2,
    ),
    dict(
        question="O escritório atende só em Palmas?",
        answer=(
            "Não. O atendimento cobre todo o estado do Tocantins, presencial "
            "ou remoto conforme a necessidade do cliente."
        ),
        order=3,
    ),
    dict(
        question="Quais documentos preciso levar na primeira reunião?",
        answer=(
            "Depende da área (inventário, aposentadoria, trabalhista ou "
            "cível). Após o primeiro contato, o Dr. Alecrim informa a lista "
            "específica para o seu caso."
        ),
        order=4,
    ),
    dict(
        question="Em quanto tempo recebo um retorno após o contato?",
        answer=(
            "A resposta ao primeiro contato acontece no mesmo dia útil, seja "
            "pelo formulário do site, telefone ou WhatsApp."
        ),
        order=5,
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

        if not Faq.query.first():
            db.session.bulk_save_objects([Faq(**f) for f in FAQS])
            print(f"Seed: {len(FAQS)} perguntas frequentes inseridas.")
        else:
            print("Seed: tabela 'faqs' já tem dados, pulando.")

        # Bootstrap do único admin do painel (/admin, login em /login). É a
        # ÚNICA vez que ADMIN_PASSWORD é lida - depois da troca de senha
        # pelo painel, a env var vira só referência histórica, nunca mais é
        # consultada (o hash já está no banco).
        if not AdminUser.query.first():
            admin_email = os.environ.get("ADMIN_EMAIL")
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if admin_email and admin_password:
                admin = AdminUser(
                    email=admin_email.strip().lower(),
                    password_hash=generate_password_hash(admin_password),
                )
                db.session.add(admin)
                print(f"Seed: admin criado ({admin.email}).")
            else:
                print(
                    "Seed: ADMIN_EMAIL/ADMIN_PASSWORD não definidos - o login "
                    "em /login não vai funcionar até você configurar essas "
                    "duas variáveis em backend/.env e rodar o seed de novo "
                    "(ou reiniciar o container)."
                )
        else:
            print("Seed: tabela 'admin_users' já tem dados, pulando.")

        db.session.commit()


if __name__ == "__main__":
    run()
