"""Popula o banco com o conteúdo real da landing atual (Dr. Alecrim.dc.html).

Uso:
    python seed.py
    # ou, com o compose já rodando:
    docker compose exec backend python seed.py

É idempotente: só insere se a tabela correspondente estiver vazia.

O admin inicial só é criado se ADMIN_EMAIL/ADMIN_PASSWORD passarem em
`admin_credentials_problems` (senha forte, nada de valores de exemplo dos
.env.example). Se não passarem, o script termina com erro (código != 0) sem
gravar nada - e, como o entrypoint.sh roda com `set -e`, o container não
sobe com uma credencial pública no painel.
"""

import os

from email_validator import EmailNotValidError, validate_email
from werkzeug.security import generate_password_hash

from app import create_app
from app.api.admin_auth import MAX_EMAIL_LENGTH
from app.extensions import db
from app.models import AdminUser, Faq, Service, Testimonial
from app.utils.boot_checks import PLACEHOLDER_ADMIN_EMAILS, is_known_placeholder
from app.utils.password_policy import password_problem
from app.utils.schema_upgrades import apply_schema_upgrades

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


def admin_credentials_problems(email: str, password: str) -> list[str]:
    """O que impede usar esse par como admin inicial (lista vazia = ok).

    Mesmas regras de `POST /api/admin/users` (política de senha de
    app/utils/password_policy.py, sintaxe do e-mail), mais a recusa dos
    valores de exemplo versionados em
    backend/.env.example - públicos, portanto equivalentes a deixar o painel
    aberto. As mensagens nunca repetem a senha.
    """
    problems = []

    normalized_email = email.strip().lower()
    if normalized_email in PLACEHOLDER_ADMIN_EMAILS:
        problems.append(
            "ADMIN_EMAIL é o e-mail de exemplo do .env.example - use o "
            "e-mail real de quem vai administrar o painel."
        )
    else:
        try:
            if len(normalized_email) > MAX_EMAIL_LENGTH:
                raise EmailNotValidError("muito longo")
            # Só a sintaxe, sem DNS - igual ao cadastro pelo painel.
            validate_email(normalized_email, check_deliverability=False)
        except EmailNotValidError:
            problems.append("ADMIN_EMAIL não é um endereço de e-mail válido.")

    if is_known_placeholder(password):
        problems.append(
            "ADMIN_PASSWORD é a senha de exemplo do .env.example - defina "
            "uma senha própria, forte e que não seja usada em outro lugar."
        )
    else:
        # Inclui o teto de tamanho: o login recusa senhas acima dele sem nem
        # conferir o hash - o admin seria criado e nunca conseguiria entrar.
        problem = password_problem(password, normalized_email)
        if problem is not None:
            problems.append(f"ADMIN_PASSWORD {problem[1]}.")

    return problems


def run(app=None) -> None:
    # `app` é injetável só pra testes (mesmo padrão de purge_leads.py) - em
    # uso real (CLI/entrypoint) sempre cria um app de verdade.
    app = app or create_app()
    with app.app_context():
        db.create_all()
        # No boot do container o entrypoint.sh já fez isso; repete aqui (é
        # idempotente) para o seed rodado à mão num banco antigo não
        # quebrar ao consultar uma coluna que ainda não existe.
        apply_schema_upgrades()

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
        # Por isso mesmo: depois do primeiro login, troque a senha pelo
        # painel e REMOVA ADMIN_PASSWORD de backend/.env.
        if not AdminUser.query.first():
            admin_email = os.environ.get("ADMIN_EMAIL")
            admin_password = os.environ.get("ADMIN_PASSWORD")
            if admin_email and admin_password:
                problems = admin_credentials_problems(admin_email, admin_password)
                if problems:
                    # Nada do seed é gravado (o commit fica lá embaixo) e o
                    # processo sai com código 1: com o `set -e` do
                    # entrypoint.sh o container não sobe. É de propósito -
                    # melhor não subir do que publicar /login com uma
                    # credencial fraca ou conhecida.
                    db.session.rollback()
                    raise SystemExit(
                        "Seed: admin inicial NÃO criado - corrija em "
                        "backend/.env e suba de novo:\n"
                        + "\n".join(f"  - {problem}" for problem in problems)
                    )
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
