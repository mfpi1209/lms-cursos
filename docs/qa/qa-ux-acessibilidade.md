# QA de UX e acessibilidade: Estúdio e Aprender

23/10/2026 · `localhost:3000` (dev) · Playwright (Chromium) + axe-core 4.10.2 (WCAG 2.x A/AA + best-practice) · desktop 1280×800 e mobile 390×844. Scripts em `/tmp/qa-ux/`. Capturas em `docs/qa/screens/` (sufixo `-desktop`/`-mobile`). O botão "N" nas capturas é o Next Dev Tools e só existe em dev.

**Efeitos colaterais:**
- A navegação pelo wizard (trilho e "Próximo passo") pode ter gravado o passo atual.
- O aluno clicou em "Fazer de novo" em *Negociar um prazo*, o que criou a Tentativa 14 com 2 decisões.
- O rascunho passou da revisão 69 para a 86. A maior parte veio dos vídeos da fila que terminaram (62/62).
- Nenhuma ação de IA, geração, publicação ou cancelamento foi acionada.

---

## 1. Achados

### ALTA

**A1. Storyboard no mobile: título da cena aninhada com 1 letra por linha.** `zoom-storyboard-mobile-titulo-estreito.png`, `storyboard-mobile.png`
Nas consequências (cenas 4–6, 8–10, 14–16), a textarea do título fica com **31 px de largura e 370–708 px de altura**. O recuo do ramo, o `SpineNode` aninhado e as ações `shrink-0` (Variar e "⋯") ocupam toda a largura.
*Correção* (`scene-card.tsx`):
- Abaixo de `sm`, zerar o recuo dos ramos.
- Dar `flex-wrap` ao `<header>` e mover as ações para uma linha própria (`order-last w-full sm:w-auto`).
- Alternativa: `min-w-[12rem] basis-full sm:basis-auto` no bloco do título.

**A2. Produção no mobile: a página fica com 793 px de largura.** `producao-mobile.png`, `zoom-producao-mobile-viewport.png`
O `scrollWidth` chega a 793 px num viewport de 390 e as linhas saem do cartão. A causa é `production-panel.tsx:235`, `<ul className="grid gap-2 sm:grid-cols-2">`: abaixo de `sm` a trilha implícita é `auto` e o `truncate` do `SceneLabel` a alarga.
*Correção:* `grid grid-cols-1 sm:grid-cols-2`, pois `grid-cols-1` gera `minmax(0,1fr)`. O mesmo componente aparece no passo 6 do wizard.

**A3. Botões primários abaixo do AA.** `estudio-desktop.png`, `matricula-desktop.png`
- Branco sobre `#2f8bff` (estúdio) = **3,35:1** em Novo curso, Continuar montagem, Publicar curso e na numeração da espinha.
- Branco sobre `#0e9f93` (aluno) = **3,28:1** em Continuar e Confirmar escolha.

São textos de 14–16 px em peso normal, então o mínimo é 4,5:1.
*Correção* (`globals.css`): fundo do preenchimento em `#1a66d1` (5,43:1) ou no `--t-accent-strong #1f6fe0` já existente (4,76:1) no estúdio, e `#0b7d74` (5,00:1) no aluno.

**A4. Texto "faint" ilegível.** `matricula-desktop.png`, `player-1-desktop.png`
- Aluno: `#94a0b8` sobre `#f4f6fb` = **2,43:1** em "Versão 1 · 2 aulas…", "Tentativa 14" e "Cerca de 15 min".
- Estúdio: `#8b95a8` sobre branco = **3,01:1** no breadcrumb, em "Estúdio", no papel "author", nas descrições do trilho e nos metadados.

*Correção:* `--t-fg-faint` para `#5f6b7e` no aluno (4,99:1) e `#667085` no estúdio (4,97:1).

**A5. Novo curso: campo obrigatório oculto.** `novo-typed-desktop.png`
Preencher o título não habilita "Criar curso e continuar". O botão só habilita quando "Sobre o que é o curso" também está preenchido, e esse campo não tem `required`, marca visual nem mensagem. As dicas não estão ligadas aos campos por `aria-describedby`.
*Correção:*
- "(obrigatório)" e `aria-required` nos dois campos.
- Mensagem "Preencha título e tema para continuar" junto ao botão, ou validação no envio.
- Dicas ligadas por `aria-describedby`.

### MÉDIA

**M1. Não há link "Pular para o conteúdo".** O primeiro Tab vai para o logo, e são 11 Tabs até o conteúdo no storyboard.
*Correção:* `<a href="#main" class="sr-only focus:not-sr-only">` e `id="main" tabindex="-1"` no `<main>`.

**M2. Prévia e player: o vídeo bloqueia "Continuar" na ordem de Tab.** `focus-previa-desktop-tab11.png`
Os controles nativos do `<video>` somam 6 paradas, e "Continuar" não foi alcançado em 12 Tabs. O vídeo também fica abaixo da dobra a 1280×800.
*Correção:* colocar "Continuar" antes do vídeo no DOM, mantendo a posição visual.

**M3. São 30 links "Ver na cena" com nome idêntico (WCAG 2.4.4), de 65×32 px.** Aparecem no passo 6 do wizard e na Produção.
*Correção:* `aria-label="Ver a cena “{título}” no editor"` e `min-h-11`.

**M4. Logo do estúdio no mobile sem nome acessível** (axe `link-name`). O texto fica `hidden md:inline` e o alvo mede 36×44.
*Correção:* `aria-label="Rede de Polos Estúdio, início"` e `min-w-11`.

**M5. Wizard, passo 4 (Apresentação).** `wizard-4-desktop.png` (7.171 px), `wizard-4-mobile.png` (10.388 px)
- O axe acusa `listitem` com 99 nós: o `<ul aria-label="Apresentadores">` tem um `role` que não é `list`. Use `role="radiogroup"` com itens `role="radio"`.
- O axe acusa `label` (critical) em `#bg-upload`: o input `sr-only` não tem rótulo. Corrija com `<label htmlFor>` ou `aria-label`.
- São cerca de 50 apresentadores e 40 vozes numa lista única, com nomes técnicos truncados ("Dante Living Ro…"). Adicione busca e filtros, `line-clamp-2` e `title` nos nomes, e fixe a escolha atual no topo.

**M6. Navegação confusa entre Painel, wizard e storyboard.**
- `/estudio/cursos/{id}` redireciona para `/montar` enquanto o curso está em montagem. Assim a aba "Painel" e o "← Painel do curso" levam ao wizard.
- No editor de aula a aba ativa é "Painel" (`zoom-storyboard-desktop-viewport.png`), e no modo avançado o mesmo link se chama "Visão geral".

*Correção:* aba "Aulas" (ou nenhuma aba ativa) no editor e rótulo único nos dois modos. Se o redirecionamento for intencional, chamar a aba de "Montagem" até a publicação.

**M7. Abas do curso e h1 cortados no mobile.** `zoom-storyboard-mobile-topo.png`
A `nav "Seções do curso"` tem 572 px de largura num espaço de 390, com "Revisão e pub…" cortado sem indicação de rolagem. O h1 sai "Primeira entrevi…".
*Correção:* fade nas bordas (`mask-image`), `scrollIntoView` na aba ativa e `line-clamp-2` no h1.

**M8. Modo avançado.** `zoom-storyboard-avancado-desktop-viewport.png`
- O texto dos nós fica com cerca de 4 px no zoom inicial. Use `fitView` com `minZoom` em torno de 0,6.
- O axe acusa `aria-prohibited-attr` com 41 nós: os handles do React Flow têm `aria-label` em `div` sem role. Aplique `aria-hidden`.
- O axe acusa `aria-input-field-name`: o editor TipTap `#node-body-*` não tem nome. Use `aria-labelledby`.
- Os botões de zoom medem 26×26 px e os da barra do editor 36×36.

**M9. Hierarquia de títulos (axe `heading-order`).** Os `h3` "Fontes do curso", "Ao terminar…", "Quem apresenta" e "Lista de lançamento" vêm logo depois do h1 do passo. Troque por `h2`.

**M10. Badges abaixo do AA no estúdio.**
| Par | Razão | Onde | Sugestão |
|---|---|---|---|
| `#1f8a4c`/`#dff5e7` | 3,82 | Pronto, Concluído, Correta | `#176b3a` (5,73) |
| `#b26a00`/`#fff0d6` | 3,77 | ação paga | `#8a5200` (5,68) |
| `#6d4cff`/`#ece7ff` | 4,22 | Variar esta cena | `#5536e0` (5,83) |
| `#2f8bff`/`#e4efff` | 2,89 | Primeira cena, Início (10–11 px) | `#1a5fcc` (5,09) |
| `#d9432c`/`#ffe4df` | 3,63 | tom negativo | `#b8331f` (4,93) |
| `#1f6fe0`/`#f6f8fc` 12 px | 4,48 | Ver na cena | `#1a66d1` (5,11) |

### BAIXA

- **B1. Alvos de toque menores que 44 px:**
  - Breadcrumb "Cursos" (45×18) e "Modo avançado" (102×20).
  - "Voltar ao editor" (36 px de altura) e "Abrir vídeo gerado" (15 px).
  - Os `summary` "Transcrição", "Regras avançadas" e "Mais detalhes" (24 px).
  - Os títulos-link em `/estudio` (25 px).

  *Correção:* `min-h-11 inline-flex items-center`.
- **B2.** A live region "Resposta registrada. Próxima etapa." é anunciada também após "Continuar" em cena de conteúdo, em que não houve resposta. Use "Próxima cena: {título}".
- **B3.** `<aside aria-label="Sua escolha">` está dentro de `<main>` (axe `landmark-complementary-is-top-level`). Troque por `<section>`.
- **B4. Copy:**
  - O papel "author" aparece em inglês.
  - "Encerramento" aparece duas vezes.
  - "tentativa 13" e "Tentativa 13" divergem na caixa.
  - O storyboard mistura "cena", "bloco" e "roteiro".
  - "Tudo certo para publicar" aparece ao lado de "Nunca publicado".
  - "nada é salvo" se repete duas vezes na prévia.
  - "Rever" abre só a tela final da aula; use "Ver resumo".
- **B5.** Na matrícula há dois "Continuar" seguidos para o mesmo destino. Inclua o nome da aula no `aria-label`.
- **B6.** `/estudio` tem 13 cursos sem busca nem filtro, e cursos de teste ("Curso e2e 1792…") se misturam aos reais.
- **B7.** O storyboard desktop tem 16.406 px e 18 cenas sem índice. Adicione um sumário fixo com âncoras `#scene-*`.
- **B8.** "Gerar vídeos de todas as cenas sem mídia" fica desabilitado sem motivo aparente. Mostre "Todas as cenas já têm vídeo".

---

## 2. Axe por página (nós)

| Página | Desktop | Mobile |
|---|---|---|
| /estudio, /estudio/novo | cc 3 | cc 1, link-name 1 |
| Painel, que redireciona para montar (passo 6) | cc 9, heading 1 | cc 2, heading 1, link-name 1 |
| Wizard 1 / 5 | cc 11 | cc 3, link-name 1 |
| Wizard 2 / 3 | cc 11, heading 1 | cc 3, heading 1, link-name 1 |
| Wizard 4 | cc 11, heading 1, **label 1 (critical)**, **listitem 99** | idem + link-name |
| Wizard 6 | cc 9, heading 1 | cc 2, heading 1, link-name 1 |
| Produção | **cc 68** | cc 62, link-name 1 |
| Storyboard | **cc 83** | cc 52, link-name 1 |
| Storyboard avançado | aria-input-field-name 1, **aria-prohibited-attr 41**, cc 16 | aria-input-field-name 1, cc 12, link-name 1 |
| Prévia | cc 4 (+ landmark 1) | cc 2, link-name 1 (+ landmark 1) |
| /aprender · matrícula · player | cc 1 · 6 · 1–3 (+ landmark 1) | cc 1 · 7 · 1–3 (+ landmark 1) |

(cc = color-contrast; heading = heading-order)

## 3. Teclado

- **Foco visível:** ok em todos os elementos percorridos (outline de 3 px na cor de destaque, `:focus-visible`).
- **Wizard:** a ordem é lógica (cabeçalho, breadcrumb, 6 passos, conteúdo). Os nomes dos passos incluem a descrição inteira; use `aria-describedby` e `aria-current="step"`.
- **Storyboard:** a ordem é lógica (abas, título, ações e cena por cena).
- **Decisão só com teclado:** funciona na prévia e no player, desktop e mobile. Tab leva ao radio, Espaço seleciona, Tab vai a "Confirmar escolha" e Enter confirma. O foco vai para o h2 da cena seguinte (`focus-previa-radio-selected-desktop.png`, `focus-player-confirm-desktop.png`).

## 4. Latência (desktop, dev aquecido, média de 2)

Medi do `goto` até o conteúdo principal e até o networkidle.

| Página | Conteúdo | Networkidle |
|---|---|---|
| /estudio · novo · painel | 122 · 98 · 170 ms | 0,6–0,75 s |
| Produção | 105 ms | **1,9 s** (30 `<video preload=metadata>`) |
| Storyboard | 197 ms | **1,6 s** (cerca de 1,4 MB no primeiro carregamento) |
| Storyboard avançado | 307 ms | 0,88 s |
| Prévia | 153 ms | 0,67 s |
| /aprender · matrícula · player | 81 · 91 · 144 ms | cerca de 0,6 s |

Na Produção, use poster (imagem) no lugar das miniaturas `<video>`. No mobile várias miniaturas apareceram vazias.

## 5. Console

Nenhum `pageerror`, `console.error` ou resposta HTTP 4xx/5xx. Só apareceu o aviso de atribuição do React Flow, no modo avançado.

---

## 6. Top 10 correções

1. **Storyboard mobile:** quebrar o cabeçalho dos cartões aninhados e zerar o recuo abaixo de `sm` (A1).
2. **Produção:** `grid-cols-1 sm:grid-cols-2` na lista "Prontos" para acabar com os 793 px no mobile (A2).
3. **Botões primários:** fundo `#1a66d1` (estúdio) e `#0b7d74` (aluno) para chegar a 4,5:1 ou mais (A3).
4. **`--t-fg-faint`:** `#667085` no estúdio e `#5f6b7e` no aluno (A4).
5. **Novo curso:** sinalizar título e tema como obrigatórios e explicar o botão desabilitado (A5).
6. **Apresentação:** corrigir o `role` da lista, rotular `#bg-upload` e paginar ou filtrar apresentadores e vozes (M5).
7. **Link "Pular para o conteúdo"** (M1).
8. **Player e prévia:** "Continuar" antes do `<video>` na ordem de Tab (M2).
9. **Navegação:** rótulo do logo no mobile, nome da cena nos "Ver na cena" e alvos de 44 px ou mais (M3, M4, B1).
10. **Navegação e copy:** aba ativa no editor, "Painel" versus "Visão geral" e o redirecionamento para `/montar`, "cena" versus "bloco", e "author" em inglês (M6, B4).
