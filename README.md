# 🧟 Zumbi 3D: Resident Evil 5 Style (B.S.A.A. Kijuju Mission)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Demo-brightgreen?logo=github)](https://webpadawan.github.io/zombie-coop/)
[![Three.js](https://img.shields.io/badge/Three.js-r128-black?logo=three.js)](https://threejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla%20ES6+-yellow?logo=javascript)](https://developer.mozilla.org/pt-BR/docs/Web/JavaScript)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS%20CDN-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Tests](https://img.shields.io/badge/Tests-18%2F18%20Passing-success?logo=node.js)](tests/gameplay.test.mjs)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **Jogo de sobrevivência e ação em primeira pessoa (FPS) 3D** inspirado no modo *The Mercenaries* de **Resident Evil 5**. Desenvolvido em Three.js puro e Web Audio API procedural, sem necessidade de download de assets externos, pronto para jogar direto no navegador ou no **GitHub Pages**!

---

## 🎮 Demonstração Online (GitHub Pages)

O jogo está configurado com caminhos relativos e pronto para execução direta no GitHub Pages:

🔗 **Jogue agora:** [https://webpadawan.github.io/zombie-coop/](https://webpadawan.github.io/zombie-coop/)

*(Caso você tenha feito um fork, ative o GitHub Pages em **Settings > Pages > Build and deployment > Branch: `main` / `/ (root)`**)*.

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

### 🌐 Co-op P2P (Mesmo Navegador / Abas Locais)
- Suporte a sincronização cooperativa em tempo real via **`BroadcastChannel`** e **`LocalStorage`**.
- Abra duas abas ou janelas lado a lado e conecte-se instantaneamente usando códigos de sala gerados dinamicamente (ex: `RE5-ABCD`), sem precisar de backend Node.js.

---

## 🏛️ Arquitetura dos Módulos

O código foi cuidadosamente desmembrado e modularizado, garantindo carregamento rápido, ausência de bloqueios de CORS e compatibilidade universal com o GitHub Pages:

```
zombie-coop/
├── index.html              # Estrutura HTML limpa, HUD e telas modais (~438 linhas)
├── css/
│   └── style.css           # Estilos visuais, overlays de dano/cura e animações
├── js/
│   ├── config.js           # Constantes (CONFIG, WEAPONS, ZOMBIE_TYPES), estado e DOM
│   ├── audio.js            # SoundSystem procedural via Web Audio API
│   ├── network.js          # Sincronização P2P, BroadcastChannel e IA da parceira Sheva
│   ├── entities.js         # Builders 3D (Three.js), zumbis, sentinelas, loot e colisões
│   └── main.js             # Loop de animação, combate RE5, HUD e eventos de entrada
├── tests/
│   └── gameplay.test.mjs   # Suíte de testes automatizados unitários e de integração
└── README.md               # Documentação técnica e guia do jogador
```

---

## 🧪 Testes Automatizados

O projeto conta com uma suíte de testes automatizados em **Node.js nativo** (`node:test` e `node:assert/strict`), validando todas as mecânicas sem necessidade de navegadores headless pesados:

```bash
# Executar a suíte de testes
node --test tests/gameplay.test.mjs
```

### Cenários cobertos (18/18 testes passando):
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

---

## 🚀 Como Executar Localmente

Como o jogo utiliza scripts padrão com caminhos relativos e Three.js via CDN HTTPS, você pode executá-lo de qualquer uma das seguintes formas:

### Opção 1: Abrir direto no navegador
Dê um duplo clique no arquivo `index.html` ou arraste-o para o Google Chrome, Edge, Firefox ou Safari.

### Opção 2: Servidor estático local (Recomendado para testar P2P entre abas)
```bash
# Com Python 3
python -m http.server 8000

# Com Node.js
npx serve .
```
Acesse `http://localhost:8000` em seu navegador.

---

## 📜 Licença

Distribuído sob a licença **MIT**. Consulte `LICENSE` para mais informações.
