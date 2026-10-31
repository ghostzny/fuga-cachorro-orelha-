# Fuga do Cachorro Orelha — Multiplayer online (beta de 2 jogadores)

## O que esta versão implementa

- Salas online limitadas a **2 jogadores**.
- Criação de sala, código de convite e entrada por código.
- Posição dos dois jogadores transmitida pelo servidor.
- Um anfitrião mantém a simulação compartilhada de inimigos, projéteis e estado básico do mundo.
- O segundo jogador envia pedidos de ataque ao anfitrião; o anfitrião resolve os acertos e distribui snapshots do mundo.
- A inteligência artificial dos inimigos e chefes comuns seleciona o jogador conectado mais próximo como alvo.
- Dano recebido pelo segundo jogador é encaminhado à sua sessão.
- A desconexão temporária mantém a sessão durante o período de reconexão já configurado.
- O modo solo continua no mesmo HTML e não depende do servidor para jogar.

## Executar localmente

Requisitos: Node.js 20 ou superior.

```bash
npm start
```

Abra `http://localhost:8080` no navegador. O servidor também responde em `/healthz`.

Para testar dois dispositivos na mesma rede local, inicie o servidor em um computador e abra `http://IP-DO-COMPUTADOR:8080` nos dois dispositivos. A porta 8080 precisa estar acessível na rede local. Isso testa a rede local, não a internet pública.

Para jogar pela internet, publique a aplicação em um serviço que mantenha processos Node.js e conexões WebSocket. Os dois jogadores devem abrir o mesmo endereço público. Se o site for servido por outro domínio, abra o jogo com `?server=wss://SEU-SERVIDOR/ws` e configure `ALLOWED_ORIGINS` no servidor para aceitar o domínio do site. Use HTTPS/WSS na publicação.

Variáveis opcionais:

- `PORT`: porta HTTP (padrão 8080).
- `ALLOWED_ORIGINS`: lista de origens permitidas separadas por vírgula (padrão `*`, indicado apenas para testes).
- `DATA_FILE`: caminho do arquivo JSON que registra o estado de encerramento Hardcore (padrão `data/campaigns.json`).
- `RECONNECT_GRACE_MS`: tolerância para reconexão em milissegundos (padrão 60000).

## Limitações conhecidas desta beta

Esta entrega é um primeiro marco técnico, não a versão final do cooperativo.

- O estado do mundo é mantido pelo navegador do anfitrião e retransmitido pelo servidor. Isso é uma arquitetura **host-authoritative**, não um servidor de jogo totalmente autoritativo.
- Se o navegador do anfitrião fechar ou perder a conexão por tempo prolongado, a sessão pode ficar sem uma autoridade funcional; a transferência de anfitrião ainda precisa de testes e ajustes para continuar a simulação.
- A sincronização de inventários individuais, recompensas individuais, baús/portas/quests compartilhados, coleta de itens por ambos, salvamento completo de campanha e recuperação de mundo após reiniciar o servidor ainda precisa ser concluída.
- O multiplayer foi limitado a 2 jogadores nesta etapa. O limite de quatro não está ativo.
- A sincronização de chefes precisa de teste real em partida cooperativa, especialmente transições de fase, ataques de área, drops e recompensas.
- Não houve teste real com dois celulares em redes diferentes nesta execução.

## Segurança e publicação

O servidor valida a sala, o limite de jogadores, o anfitrião autorizado a publicar snapshots e a frequência básica de ataques. Como o anfitrião é um cliente, esta beta não é apropriada para partidas competitivas ou ambientes com jogadores desconhecidos. Para um produto público, a simulação de inimigos, dano, inventários e recompensas deve migrar gradualmente para o servidor.
