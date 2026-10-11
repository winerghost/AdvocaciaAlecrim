"""Configuração do gunicorn lida automaticamente do diretório de trabalho
(/app) - bind, workers e timeouts continuam nos argumentos do entrypoint.sh.

O gunicorn 26 passou a abrir por padrão um "control socket" Unix em
~/.gunicorn/ que permite administrar o servidor em execução (ajustar e
derrubar workers, recarregar). Aqui ninguém usa isso e o `docker compose
restart` já cobre o que for preciso: desligado, uma superfície a menos
dentro do container (o socket é 0600 do próprio usuário, mas não há motivo
para existir).
"""

control_socket_disable = True
