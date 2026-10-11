import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    # Só para rodar à mão na máquina de desenvolvimento (em produção quem
    # serve é o gunicorn do entrypoint.sh). Escuta só em loopback por padrão, e
    # `debug=False` explícito: o depurador do Werkzeug executa código
    # arbitrário e FLASK_DEBUG=1 no ambiente o ligaria sem este argumento.
    app.run(host=os.environ.get("FLASK_RUN_HOST", "127.0.0.1"), port=8000, debug=False)
