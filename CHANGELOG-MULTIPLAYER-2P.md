# Registro desta entrega — Multiplayer 2 jogadores

## Alterações feitas

- Servidor passa a limitar salas a dois jogadores.
- O menu e as mensagens informam o limite desta etapa.
- O servidor encaminha a posição e o estado básico de movimento dos dois jogadores.
- O anfitrião publica snapshots do estado compartilhado de inimigos, projéteis, áreas de efeito, mapa e drop.
- O segundo jogador envia pedidos de ataque; o anfitrião resolve esses ataques no seu estado de jogo.
- Inimigos e chefes selecionam o jogador conectado mais próximo como alvo, de acordo com posição recebida pelo servidor.
- Dano causado por ataques e colisões pode ser refletido para o segundo jogador.
- Snapshots do mundo são limitados e aceitos somente do anfitrião.
- A interpolação dos inimigos recebidos reduz saltos visuais entre snapshots.
- Foi preservado o modo solo e mantido o servidor sem dependências externas.

## Verificações realizadas nesta entrega

- `node --check server.js`: aprovado.
- JavaScript embutido em `public/index.html`, extraído e verificado com `node --check`: aprovado.
- Parser HTML padrão: aprovado.
- Teste de integração WebSocket local: aprovado para conexão, criação de sala, entrada, bloqueio do terceiro jogador, início, sincronização de posições, snapshot do mundo, pedido de ataque do convidado e encaminhamento de dano ao convidado.
- `npm start` com porta alternativa: servidor iniciou e permaneceu ativo durante o smoke test.

## Ainda não validado / ainda incompleto

- Não foi possível realizar uma partida real entre dois celulares em redes externas diferentes nesta execução.
- Inventários e recompensas individuais ainda precisam de sincronização completa.
- Baús, portas, missões, economia e coleta de itens ainda não possuem um protocolo completo de campanha compartilhada.
- O estado salvo completo do mundo ainda não é persistido para sobreviver a reinicializações do processo. O JSON atual registra apenas informações limitadas da campanha, não substitui um banco de dados.
- A autoridade do mundo é o navegador do anfitrião. Isso é adequado apenas como beta/teste com pessoas conhecidas; não é uma simulação autoritativa no servidor.
- Chefes, transições de região, respawn e Hardcore precisam de testes de jogo completos com duas pessoas.
- O limite de quatro jogadores fica para uma etapa posterior.
