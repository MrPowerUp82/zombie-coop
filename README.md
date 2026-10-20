# 🧟 Zumbi 3D: Resident Evil 5 Style (B.S.A.A. Kijuju Mission)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen?logo=github)](https://webpadawan.github.io/zombie-coop/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black?logo=three.js)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-yellow?logo=javascript)](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%20CDN-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-25%2F25%20Passing-success?logo=node.js)](tests/multiplayer.test.mjs)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Jogo de sobrevivência e ação em primeira pessoa (FPS) 3D** inspirado no modo *The Mercenaries* de **Resident Evil 5**. Desenvolvido em Three.js puro e Web Audio API procedural, sem necessidade de download de assets externos, pronto para jogar direto no navegador ou no **GitHub Pages**!

---

## 🎮 Demonstração Online (GitHub Pages)

O jogo está configurado com caminhos relativos e pronto para execução direta no GitHub Pages:

🔗 **Jogue agora:** [https://webpadawan.github.io/zombie-coop/](https://webpadawan.github.io/zombie-coop/)

*(Caso você tenha feito um fork, ative o GitHub Pages em **Settings > Pages > Build and deployment > Branch: `main` / `/ (root)`**)*.

---

## ✨ Atualização visual: versão cinematográfica

Esta versão conserva a jogabilidade original e aprimora a apresentação **diretamente no Three.js**, sem importar modelos ou texturas de terceiros:

- **Personagens mais detalhados:** zumbis e aliada cooperativa agora usam esferas, cilindros de muitos segmentos e elementos anatômicos, em vez de membros inteiramente cúbicos. Inclui olhos emissivos, rostos, roupas, mãos e botas, ombreiras e variações nos mutantes.
- **Animações procedurais:** balanço das pernas e dos braços, respiração sutil, movimento da cabeça, agachamento nos atordoamentos e animação da aliada ao andar. Sem bibliotecas adicionais.
- **Cenário refinado:** texturas de asfalto, madeira e contêineres geradas no navegador; nervuras de metal, relevo de superfície, iluminação mais natural, sombras mais suaves e pedras/matos instanciados com baixo custo de renderização.
- **Efeitos especiais:** clarões, faíscas esféricas, explosões com camadas expansivas de fogo e fumaça, rastros de projéteis, marcas no solo e ondas de choque.
- **Pós-processamento no modo ULTRA:** bloom dos pontos brilhantes, correção de cores, vinheta, granulação cinematográfica e leve aberração cromática. Feito com shaders próprios, sem dependências extras.
- **Escalonamento de detalhes (LOD):** microdetalhes dos inimigos mais distantes são ocultados; geometria instanciada e descarte de objetos temporários ajudam a evitar perda de desempenho.

**Tecla `V`:** alterna entre `ULTRA` (sombras 2048 px, pós-processamento, densidade de pixels mais alta e LOD distante) e `ALTO` (sombras 1024 px, sem bloom e resolução de pixel menor). Para máquinas com GPU integrada, experimente `ALTO`.

> O visual é **procedural/estilizado**, não modelos escaneados com textura PBR comercial. A qualidade e o FPS dependem da GPU e do navegador. A biblioteca Three.js r128 e as fontes continuam carregadas por CDN, como na versão original.

---

## 🕹️ Controles do Jogo

### 💻 Teclado & Mouse

| Tecla / Ação | Função |
| :--- | :--- |
| **W, A, S, D** | Movimentação em 4 direções |
| **Shift** | Corrida tática (*Sprint* consome estamina) |
| **Espaço** | Pulo tático |
| **Q** | **Esquiva Tática (Dash WASD)** com *i-frames* (invulnerabilidade temporária) |
| **E** | **Golpe Físico Melee / Finalização RE5** (execução marcial em zumbis atordoados ou empurrão defensivo) |
| **Botão Esquerdo do Mouse** | Disparar arma equipada |
| **Botão Direito do Mouse** | Mirar com zoom tático / Luneta na Sniper |
| **R** | Recarregar arma |
| **1, 2, 3, 4** ou **Scroll** | Trocar rapidamente de arma |
| **G** | Lançar Granada Incendiária |
| **F** | Ligar / Desligar Lanterna tática |
| **B** | Abrir Loja de Armas & Melhorias B.S.A.A. |
| **T** | Enviar Sinal Tático (*Ping*) para o parceiro |
| **V** | Alternar qualidade gráfica (*Ultra* / *Alto*) |
| **M** | Ativar / Desativar áudio |
| **Esc / P** | Pausar a missão |

### 📱 Dispositivos Móveis (Touchscreen)

- **Joystick Virtual:** Movimentação fluida à esquerda da tela.
- **Área Touch Direita:** Rotação livre de câmera e mira.
- **Botões Dedicados:** Disparo, Melee 🥊, Recarga 🔄, Pulo ⬆️ e Troca de Armas 🔫.

---

## 💥 Mecânicas Inspiradas em Resident Evil 5

### 1. Sistema Anatômico de Atordoamento (*Stagger*)
- **Tiros na Cabeça:** Atordoam os Majinis temporariamente (`staggerType = 'HEAD'`), fazendo-os cambalear com anel indicador sobre a cabeça.
- **Tiros no Joelho/Perna:** Fazem o zumbi se ajoelhar de dor (`staggerType = 'KNEE'`), abrindo brecha perfeita para finalização.

### 2. Ataque Físico Melee de Contexto (`Tecla [E]`)
- **Execução Marcial B.S.A.A.:** Ao se aproximar de um zumbi atordoado (até 3.8m), pressione `[E]` para desferir um golpe físico devastador (180 de dano primário + 95 de dano em área, empurrão de 2.6m, +2x multiplicador de combo e *i-frames* de 0.6s).
- **Empurrão Tático Defensivo:** Quando não há inimigos atordoados próximos, pressione `[E]` para afastar aglomerações (35 de dano, 1.6m de repulsão e retardo de ataque inimigo).

### 3. Física de Morte e Desmembramento
- Tiros críticos na cabeça e golpes de misericórdia explodem a cabeça do zumbi com jatos de partículas.
- Inimigos derrotados possuem animação física de recuo dinâmico antes de desaparecerem.

### 4. Espólios Magnéticos (*Loot Drops*)
Os inimigos eliminados soltam itens no solo que são magneticamente atraídos para o jogador ao se aproximar:
- 🟡 **Ouro & Tesouros:** Pontos extras para compras na loja.
- 🔵 **Munição Tática:** Reabastecimento para fuzil, escopeta e rifle.
- 🟢 **Ervas Verdes:** Recuperação imediata de 25 HP.
- 🔴 **Bônus de Combo:** Eleva o multiplicador de pontuação até o limite de 10x!

### 5. Chefão Némesis Majini
- A cada 3 capítulos, surge um mutante colossal com machado gigante.
- Possui ataque de investida brutal (*Charge Windup*) e drop garantido de tesouros de alto valor.

---

## 👥 Modos Cooperativos B.S.A.A.

### 👩‍✈️ Sheva Alomar (Bot IA Parceira)
- Ative o modo **"Sheva (IA Co-op)"** no menu inicial para jogar com uma aliada inteligente.
- Sheva segue o jogador mantendo formação tática, atira nos inimigos próximos com seu fuzil e corre para **reanimar você caso seja abatido**!
- Você também pode se aproximar de Sheva caso ela caia para reanimá-la em campo.

### 🌐 Multiplayer real (2 jogadores)

**Corrigido:** a primeira implementação somente enviava dados via `BroadcastChannel`/`localStorage`. Isso não se conecta com pessoas em outros computadores. Esta versão usa **WebRTC/PeerJS** em modo online e inclui um **servidor HTTP + WebSocket próprio** para rede local (sem bibliotecas do npm).

#### Modo 1: amigos pela internet, sem instalar servidor

1. **Ambos** abrem a mesma versão do jogo (por exemplo, hospedada no GitHub Pages). Tenham acesso à internet.
2. O primeiro jogador preenche o nome e clica **Criar Sala P2P**. Aguarde aparecer **Sala RE5XXXXX pronta**.
3. Copie o código de **oito caracteres** e envie para o amigo.
4. O segundo jogador preenche o nome, digita o código e clica **Conectar ao Host**.
5. Espere a confirmação **Conectado ao host**, nos dois computadores. **O host** clica **Iniciar Missão Kijuju**; a missão do cliente inicia automaticamente.

Usa um servidor de **sinalização PeerJS público** e conexão de dados **WebRTC** entre os navegadores (e a biblioteca PeerJS via CDN). **Não há servidor online nosso incluso.** Certas redes corporativas, firewalls, VPNs ou NATs restritivos podem bloquear a conexão P2P. Nesses casos use um servidor WebSocket próprio (abaixo), com um endereço acessível pelos dois clientes; pode ser necessário hospedá-lo na internet com TLS/WSS.

#### Modo 2: computadores na mesma rede Wi-Fi/LAN (recomendado para teste)

1. Instale [Node.js](https://nodejs.org/) no computador que será o servidor.
2. Extraia o ZIP e, na pasta `zombie-coop-main`, execute **`INICIAR_MULTIPLAYER.bat`** (Windows) ou `node server.js` (terminal, Windows/macOS/Linux).
3. No computador do servidor, abra `http://localhost:8080`.
4. No outro computador da **mesma rede**, abra `http://IP_DO_COMPUTADOR_SERVIDOR:8080` (ex.: `http://192.168.1.10:8080`). Para descobrir o IP no Windows, use `ipconfig` e procure o endereço IPv4.
5. Deixe **Servidor opcional** vazio nos dois navegadores: a página disponibilizada pelo `server.js` seleciona automaticamente o WebSocket do servidor. Crie a sala, compartilhe o código, conecte-se e inicie a missão pelo host.

Se não conseguir abrir o endereço no segundo PC, confira se ambos estão na mesma rede e se o **Firewall do Windows** permite o Node.js e a porta **8080/TCP**. O servidor escuta em todas as interfaces de rede por padrão; para alterar a porta, defina `PORT` antes de executar o Node.

#### Hospedagem de site estático + servidor separado

Se o HTML estiver no **GitHub Pages** e você já tiver um servidor WebSocket acessível, insira o endereço em **Servidor opcional** nos dois navegadores (ex.: `wss://seu-dominio.com`). Para HTTPS, use **WSS com certificado válido**: conexões `ws://` são normalmente bloqueadas em páginas HTTPS. O servidor integrado fala WebSocket em `ws://` e precisa ficar **atrás de um proxy TLS** para oferecer `wss://`.

#### Testar com duas abas

Abra duas abas **do mesmo endereço HTTP/HTTPS** e clique **Testar em duas abas** em cada uma. A primeira vira anfitriã e a segunda cliente automaticamente. `BroadcastChannel` só funciona entre abas da mesma origem e **não substitui** o multiplayer em computadores diferentes. Se abrir o arquivo com `file://`, prefira rodar o servidor para esse teste.

#### Observações

- Um host e um cliente por sala; sair da página/desconectar atualiza o status do parceiro.
- O host controla ondas, posições e ataques dos zumbis; o cliente sincroniza seus avatares e envia golpes.
- O servidor `server.js` é simples e foi criado para LAN/testes. Se hospedar publicamente, configure HTTPS/WSS, proteção de acesso, monitoramento e recursos de produção.
- A conexão WebRTC depende de um serviço público externo e pode falhar em redes que precisem de TURN; o servidor WebSocket é a alternativa previsível quando ambos alcançam o mesmo endereço.

---

## 🏛️ Arquitetura dos Módulos

O código foi cuidadosamente desmembrado e modularizado, garantindo carregamento rápido, ausência de bloqueios de CORS e compatibilidade universal com o GitHub Pages:

```
zombie-coop-main/
├── index.html              # Interface e HUD
├── server.js               # HTTP + WebSocket local, sem bibliotecas npm
├── INICIAR_MULTIPLAYER.bat  # Inicia o servidor LAN no Windows
├── css/
│   └── style.css           # Estilos, overlays e animações CSS
├── js/
│   ├── config.js           # Constantes, estado e DOM
│   ├── audio.js            # Áudio procedural
│   ├── network.js          # WebRTC, WebSocket, abas locais e bot
│   ├── entities.js         # Objetos 3D e zumbis
│   ├── visuals.js          # Efeitos de pós-processamento
│   └── main.js             # Loop, combate, HUD e controles
├── tests/
│   ├── harness.mjs          # Simulação do navegador para testes
│   ├── gameplay.test.mjs   # Testes de jogabilidade e gráficos
│   └── multiplayer.test.mjs # Testes de conexão e sincronização
└── README.md               # Documentação

```

---

## 🧪 Testes Automatizados

O projeto conta com uma suíte de testes automatizados em **Node.js nativo** (`node:test` e `node:assert/strict`), validando todas as mecânicas sem necessidade de navegadores headless pesados:

```bash
# Executar a suíte de testes
node --test tests/*.test.mjs
```

### Cenários cobertos (25/25 testes passando):
- Simetria de movimentação lateral (`A` e `D`)
- Esquiva direcional (*Dash*) e invulnerabilidade (*i-frames*)
- Cancelamento de recarga ao trocar de armas
- Pausa de zumbis e do bot ao abrir a Loja B.S.A.A.
- Hitboxes anatômicas segmentadas (`HEAD`, `BODY`, `LEG`)
- Geração segura de zumbis fora de obstáculos
- Navegação tangencial com desvio de caixas e contêineres
- IA da parceira Sheva (rotação de mira, reanimação mútua)
- Atordoamento (*Stagger*) por tiros na cabeça e perna
- Ataque Melee RE5 (finalização em zumbi atordoado e empurrão defensivo)
- Física de morte e atração magnética de espólios
- Limite de tempo e capacidade máxima de espólios no mapa
- Criação, entrada, limite de 2 usuários, retransmissão e desconexão de salas via WebSocket
- Dois clientes do jogo conectando-se a um servidor real no teste
- Início de missão, sincronização de posição e dano remoto
- Handshake do WebRTC simulado e detecção de queda de conexão
- Eleição anfitrião/cliente e conexão correta entre duas abas locais

---

## 🚀 Como Executar Localmente

**Para multiplayer na rede local:** execute `INICIAR_MULTIPLAYER.bat` no Windows (requer Node.js), ou `node server.js` no terminal, e abra `http://localhost:8080`. O segundo jogador acessa `http://IP-DO-HOST:8080`.

**Para testar solo:** `index.html` pode abrir diretamente no navegador, mas a biblioteca Three.js, o Tailwind e o PeerJS precisam de internet para carregar. Em alguns navegadores, `file://` tem limitações de segurança; usar um servidor HTTP é recomendado.

**Servidor estático, sem modo LAN:** `python -m http.server 8000` serve os arquivos, mas **não** fornece o servidor WebSocket para sessões LAN. Nesse caso, deixar o campo opcional vazio usa WebRTC/PeerJS pela internet.

**Testes:** `node --test tests/*.test.mjs` (Node.js 22+ para o teste WebSocket do cliente integrado; o servidor em si usa apenas APIs nativas do Node.js).

---

## 📜 Licença

Distribuído sob a licença **MIT**. Consulte `LICENSE` para mais informações.
