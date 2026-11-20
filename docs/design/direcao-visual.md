# Direção visual — Plataforma de Gestão de Provas Off-Road

> Status: **proposta para aprovação, revisão 2** (nov/2026).
> **Referência obrigatória:** o escopo ilustrado do contratante (PDF, não versionado). As cores, a tipografia e o
> layout das telas seguem o PDF. Os ajustes feitos aqui servem só para cumprir acessibilidade (contraste AA, alvos de
> toque) e estão listados na seção 6.
> A revisão 1 ("placa de número", paleta alumínio/cobalto) foi **descartada** em favor do visual do escopo.

## 1. Linguagem visual do PDF

- **Laranja de competição** como cor da marca: faixa no topo, títulos de seção, menu ativo, botões primários, barras
  do gráfico, número do piloto e relógio da bateria.
- **Grafite** no menu lateral, nos cabeçalhos de tabela, no cabeçalho da cronometragem e no telão.
- **Conteúdo claro** em fundo cinza-areia, com cartões brancos de borda fina e linhas zebradas em areia.
- **Estados em pílula sólida**: verde (Pronta, Pago, Em prova), âmbar (Grid pendente, Pendente, Offline), cinza
  (Aguardando) e vermelho (Desclassificar, penalidade).
- **Cards de totais com borda colorida à esquerda**: laranja para inscritos, verde para pagos, âmbar para pendentes e
  azul para baterias.
- **Bandeira quadriculada** como detalhe gráfico (capa do PDF).
- Logo **MX** em laranja com **PRO** em branco: é o padrão até o contratante enviar a identidade dele.

## 2. Paleta (tokens)

Os componentes consomem somente tokens; nenhum hex fica nos componentes. A identidade do contratante substitui os
tokens `--brand-*` pelo `Settings`.

### 2.1 Marca
| Token | Hex | Uso |
|---|---|---|
| `--brand-primary` | `#E8590C` | Faixa do topo, barras, bordas, títulos grandes, relógio, números grandes, laranja no fundo escuro |
| `--brand-primary-strong` | `#C84D0A` | Fundo de botão, menu ativo e aba ativa com texto branco (4,6:1), e texto laranja pequeno sobre branco |
| `--brand-primary-soft` | `#FFF0E8` | Fundo do item selecionado (ex.: modelo de prova escolhido no wizard) |
| `--brand-on-primary` | `#FFFFFF` | Texto sobre a marca. Calculado automaticamente quando o contratante troca a cor |

### 2.2 Neutros
| Token | Hex | Uso |
|---|---|---|
| `--c-ink` | `#1B1E23` | Texto principal (14,7:1 sobre areia) |
| `--c-chrome` | `#1A1D23` | Menu lateral, cabeçalhos de tabela, barra da cronometragem |
| `--c-bg` | `#F8F6F4` | Fundo da área de conteúdo |
| `--c-zebra` | `#F4F0EB` | Linha alternada de tabela, campos de leitura |
| `--c-surface` | `#FFFFFF` | Cartões, tabelas, formulários |
| `--c-border` | `#E6E4DD` | Borda de cartão |
| `--c-border-strong` | `#D8D4CA` | Divisórias, borda de input |
| `--c-text-2` | `#5B6168` | Texto secundário (5,5:1 sobre areia) |
| `--c-text-muted` | `#9AA0A8` | **Só** sobre grafite (6,4:1) ou em texto decorativo; nunca texto pequeno sobre branco |

### 2.3 Estados
| Estado | Token | Fundo da pílula | Texto da pílula |
|---|---|---|---|
| Pronta / Pago / Aprovada / Em prova | `--state-ok` | `#2F9E44` no visual; `#28863A` quando tem texto pequeno | branco |
| Grid pendente / Pendente / Offline | `--state-warn` | `#F49E00` | **grafite** (7,8:1). No PDF era branco (2,2:1) |
| Aguardando / inativo | `--state-idle` | `#6B7179` | branco (4,9:1). No PDF era `#9AA0A8` (2,6:1) |
| Desclassificar / erro / penalidade | `--state-danger` | `#E03131` (texto/contorno, 4,5:1) | — |
| Informação / baterias / controle de horário | `--state-info` | `#1C7ED6` (borda e nó); `#1A76C9` com texto | branco |
| Tempo no telão | `--live-time` | `#74C0FC` sobre fundo escuro (9,8:1) | — |

### 2.4 Telão e página pública
| Token | Hex |
|---|---|
| `--live-bg` | `#0E0F13` |
| `--live-surface` | `#1A1D23` |
| `--live-leader-row` | `#2A2118` (realce marrom-alaranjado do líder, como no PDF) |
| `--live-text` | `#FFFFFF` |
| `--live-muted` | `#9AA0A8` |

### 2.5 Tema escuro do painel (requisito do Passo 2)
O PDF só mostra o tema claro. O tema escuro é derivado dos mesmos tokens: conteúdo `#14161A`, cartões `#1A1D23`, bordas
`#2A2F36`, texto `#F1F3F5`. O laranja `#E8590C` sobre o escuro dá 4,7:1. O menu lateral continua grafite nos dois
temas.

## 3. Tipografia

- **Família do PDF: Helvetica.** Pilha de fontes: `"Helvetica Neue", Helvetica, Arial, sans-serif`. É fonte do
  sistema, então não precisa baixar nada e funciona **offline** na tela da pista sem precache.
- Pesos: **Bold** para títulos, números, botões, nomes e cabeçalhos de tabela; **Regular** para o resto.
- Tempos e números em coluna com `font-variant-numeric: tabular-nums`.
- Caixa alta só onde o PDF usa: `EM PROVA`, `OFFLINE`, `BANDEIRADA`, `AO VIVO`, `INSCRIÇÕES ABERTAS` e cabeçalhos do
  telão.

| Contexto | Escala (px) |
|---|---|
| Painel | 12 · 13 · 14 · 16 · 20 · 24 (título da página) · 32 (número dos totais) |
| Pista | 14 · 16 · 18 · 24 · 40 (número do piloto) · 56 (relógio) |
| Telão | relativa à tela (`clamp`/`vw`): corpo ≈ 1,6vw, cabeçalho ≈ 2vw |

## 4. Espaçamento, raios e sombras

- Base de **4px** (`4, 8, 12, 16, 20, 24, 32, 48`).
- Raios (como no PDF):
  - cartões e contêineres: 8px;
  - inputs e botões: 6px;
  - cards de piloto da pista: 10px;
  - badges e abas: pílula;
  - nós de percurso e avatar: círculo.
- Sombras quase inexistentes: o PDF usa **borda fina** em vez de sombra. Sombra só em toast e menus flutuantes.
- Densidade:
  - painel: linhas de tabela de 32–40px;
  - pista: **alvos de no mínimo 64px**, cartões de piloto com pelo menos 120px de altura e 12px de espaço entre
    eles (o PDF é ilustrativo; os tamanhos de toque vêm do docs/arquitetura.md §4.3);
  - telão: linhas grandes.

## 5. Estados de interação

| Estado | Tratamento |
|---|---|
| Hover (painel) | Item do menu: fundo `#2A2F36`. Linha de tabela: fundo `--c-zebra` |
| Foco | Contorno de 3px `--brand-primary` com afastamento de 2px, sempre visível |
| Item ativo | Menu e aba: pílula `--brand-primary-strong` com texto branco. Wizard: borda laranja e fundo `--brand-primary-soft` |
| Último toque (pista) | Cartão inteiro em laranja, como o nº 14 do PDF, até o próximo toque |
| Erro de campo | Borda e mensagem em `--state-danger`, com `aria-describedby` |
| Offline (pista) | Pílula âmbar `OFFLINE – N pendentes` e pílula cinza `Sincroniza ao reconectar` no cabeçalho |
| Sincronizando | A pílula âmbar mostra a contagem diminuindo e, ao zerar, vira verde `ONLINE` |
| Desclassificado | Cartão com contorno vermelho e marca `DSQ` |
| Movimento | Só em resposta a ação (toque, troca de posição no telão); desligado com `prefers-reduced-motion` |

## 6. Ajustes em relação ao PDF (e por quê)

| Ponto do PDF | Ajuste | Motivo |
|---|---|---|
| Botão e menu ativo em `#E8590C` com texto branco (3,6:1) | Fundo `#C84D0A` | AA exige 4,5:1 em texto pequeno; a diferença de tom é discreta |
| Pílulas âmbar com texto branco (2,2:1) | Texto grafite | AA |
| Pílula "Aguardando" `#9AA0A8` (2,6:1) | `#6B7179` | AA |
| Pílula verde com texto branco (3,5:1) | `#28863A` | AA |
| Cartões da pista pequenos, rótulo "TOQUE" | Mesmo visual, porém alvos ≥ 64px e cartões maiores | Uso com luva (docs/arquitetura.md §4.3) |
| Logo "MXPRO" fixo | Vem do `Settings` | Identidade configurável (docs/arquitetura.md §2.7) |

## 7. Componentes base (Passo 2)

| Componente | Visual do PDF |
|---|---|
| `app-shell` | Faixa laranja fina no topo, menu lateral grafite com logo e itens; o ativo é uma pílula laranja |
| `button` | Primário laranja sólido; secundário branco com borda; perigo com contorno e texto vermelhos; "pista" grande |
| `input` / `select` | Rótulo pequeno acima, campo branco com borda `--c-border-strong` e raio de 6px |
| `status-badge` | Pílula sólida (ok, aviso, inativo) |
| `card` | Branco, borda de 1px, raio de 8px, título em negrito |
| `stat-tile` | Card com borda colorida de 4px à esquerda, rótulo pequeno e número grande em negrito |
| `table` | Cabeçalho grafite com texto branco em negrito, linhas zebradas em areia, nº do piloto em laranja |
| `tabs` | Pílulas; a ativa em laranja (página pública por categoria) |
| `toast` | Grafite com ação "Desfazer" |
| `stepper` | Círculos numerados para o wizard: laranja nos concluídos e no atual, cinza nos próximos |
