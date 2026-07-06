---
name: Bridge MultCloud
description: Sistema operacional multi-cloud para governança, finops e automação com clareza de decisão.
colors:
  primary: "oklch(0.627 0.265 328.36)"
  primary-foreground: "oklch(0.985 0 0)"
  background: "oklch(1 0 0)"
  foreground: "oklch(0.141 0.005 285.823)"
  card: "oklch(1 0 0)"
  card-foreground: "oklch(0.141 0.005 285.823)"
  muted: "oklch(0.967 0.001 286.375)"
  muted-foreground: "oklch(0.552 0.016 285.938)"
  border: "oklch(0.92 0.004 286.32)"
  ring: "oklch(0.627 0.265 328.36)"
  success: "oklch(0.627 0.171 146.12)"
  warning: "oklch(0.763 0.177 89.65)"
  destructive: "oklch(0.637 0.237 25.33)"
  sidebar-surface: "oklch(0.985 0 0)"
  sidebar-accent: "oklch(0.967 0.001 286.375)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "0.01em"
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.md}"
    padding: "0 1rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "0 0.75rem"
    height: "2.25rem"
  input-default:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0.25rem 0.625rem"
    height: "2rem"
  card-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.xl}"
    padding: "{spacing.md}"
  sidebar-menu-active:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "{spacing.xs}"
---

# Design System: Bridge MultCloud

## 1. Overview

**Creative North Star: "Ops Grid"**

Bridge MultCloud opera como uma malha de decisão: confiável, objetiva, rápida, técnica e clara. A interface não busca espetáculo; ela prioriza leitura de estado, acesso previsível a ações e transições curtas que mantêm o usuário no fluxo operacional.

A composição visual parte de uma base neutra de alto contraste, com o acento magenta reservado para pontos de comando e seleção. Densidade é tratada como recurso funcional: cada bloco existe para reduzir custo cognitivo em tarefas de governança, finops e automação.

Este sistema rejeita explicitamente: interfaces genéricas sem hierarquia visual clara ("cara de template"), superfícies que dificultam localizar rapidamente estados críticos e ações prioritárias, e decorações visuais que competem com dados, contexto operacional e tomada de decisão.

**Key Characteristics:**
- Hierarquia de decisão visível em segundos.
- Vocabulário de estado consistente entre módulos.
- Neutros estáveis com acento único para ação primária.
- Densidade controlada para operação contínua.
- Feedback explícito para sucesso, erro, carregamento e bloqueio.

## 2. Colors

A paleta é restrita e operacional: neutros de alta legibilidade sustentam o conteúdo e um único acento de comando orienta foco e ação.

### Primary
- **Magenta de Comando** (oklch(0.627 0.265 328.36)): cor exclusiva para ação primária, foco ativo e seleção atual. O uso deve permanecer raro para preservar prioridade visual.

### Secondary
- **Névoa Operacional** (oklch(0.967 0.001 286.375)): superfície de apoio para estados secundários, hover discreto e preenchimentos de baixo risco visual.

### Tertiary
- **Verde de Confirmação** (oklch(0.627 0.171 146.12)): confirmações e estados de sucesso em fluxos de execução.
- **Âmbar de Atenção** (oklch(0.763 0.177 89.65)): alertas de atenção que não bloqueiam a operação.
- **Vermelho de Bloqueio** (oklch(0.637 0.237 25.33)): erro, invalidação e interrupção crítica.

### Neutral
- **Plano Base** (oklch(1 0 0)): fundo principal da área de trabalho.
- **Tinta Operacional** (oklch(0.141 0.005 285.823)): texto principal e ícones de alta prioridade.
- **Superfície de Cartão** (oklch(1 0 0)): containers de conteúdo com contraste direto.
- **Texto Muted** (oklch(0.552 0.016 285.938)): metadados e descrição auxiliar, nunca para conteúdo essencial.
- **Divisor Estrutural** (oklch(0.92 0.004 286.32)): bordas e limites de separação.

**The One Accent Rule.** O acento primário aparece em no máximo um foco de ação dominante por bloco visual. Se dois elementos competem em magenta, um deles está errado.

## 3. Typography

**Display Font:** Geist (fallback: ui-sans-serif, system-ui, sans-serif)
**Body Font:** Geist (fallback: ui-sans-serif, system-ui, sans-serif)
**Label/Mono Font:** Geist Mono para contextos técnicos curtos e dados monoespaçados

**Character:** tipografia sem serifa, compacta e precisa, desenhada para interfaces densas e leitura rápida de estado. O contraste entre níveis é funcional, não dramático.

### Hierarchy
- **Display** (600, 1.5rem, 1.2): títulos de página e cabeçalhos de módulo.
- **Headline** (600, 1.25rem, 1.3): subtítulos de seção e agrupamentos de decisão.
- **Title** (500, 1rem, 1.35): títulos de cards, painéis e blocos funcionais.
- **Body** (400, 0.875rem, 1.5): conteúdo principal e labels extensos. Em trechos longos, manter largura de leitura entre 65ch e 75ch.
- **Label** (500, 0.75rem, 0.01em): legenda, chips, estados compactos e microcópia estrutural.

**The Operational Scale Rule.** Toda escala textual deve permanecer em progressão curta (aprox. 1.125-1.2). Saltos maiores quebram ritmo de varredura e prejudicam priorização.

## 4. Elevation

A filosofia é flat-by-default com elevação por estado. A profundidade é comunicada primeiro por contraste tonal e borda estrutural; sombra aparece apenas como reforço de interação ou separação de camada em contextos específicos (sidebar inset/floating).

### Shadow Vocabulary
- **Inset Lift** (`0 1px 3px color-mix(in oklab, var(--foreground) 14%, transparent)`): separação leve de superfícies móveis sobre o plano base.
- **Focus Halo** (`0 0 0 3px color-mix(in oklab, var(--ring) 50%, transparent)`): foco visível em componentes interativos.

**The State-Lift Rule.** Sem estado, sem elevação. Se não há interação, a superfície permanece plana.

## 5. Components

A filosofia de componentes é: tátil e confiante, sem decoração supérflua.

### Buttons
- **Shape:** cantos moderados e controlados (calc(var(--radius) - 2px), aproximadamente 8px).
- **Primary:** plano magenta sólido com texto claro, altura compacta (2.25rem), acionamento direto.
- **Hover / Focus:** hover reduz opacidade para sinal de disponibilidade; foco usa halo de 3px em ring token.
- **Secondary / Ghost / Outline:** variantes semânticas preservam mesma geometria para consistência motora.

### Chips
- **Style:** cápsula pequena (h-5) com tipografia de rótulo e variantes semânticas (default, secondary, destructive, outline, ghost, link).
- **State:** foco com halo, hover discreto por variant, e uso para status curtos e filtros rápidos.

### Cards / Containers
- **Corner Style:** arredondamento amplo, porém controlado (var(--radius) + 4px).
- **Background:** superfície clara com conteúdo em alto contraste.
- **Shadow Strategy:** plano por padrão com separação por anel/borda; sem sombra decorativa difusa.
- **Border:** uso de ring/1px estrutural para delimitar blocos.
- **Internal Padding:** base em 1rem (sm: 0.75rem).

### Inputs / Fields
- **Style:** campo compacto (h-8), borda de input token, fundo transparente para integrar à superfície.
- **Focus:** anel de 3px com ring token e borda ativa explícita.
- **Error / Disabled:** estado inválido em destructive token; desabilitado com opacidade e bloqueio de interação.

### Navigation
- **Style:** sidebar com superfície neutra dedicada, menu em tipografia curta (text-sm), seleção por fundo de acento lateral e peso de fonte.
- **States:** hover, active, focus-visible e disabled obrigatórios para itens de menu.
- **Mobile treatment:** sidebar troca para sheet lateral mantendo o mesmo vocabulário visual.

### Signature Component
- **Sidebar Shell:** estrutura de navegação com variantes `sidebar`, `floating` e `inset`, além de colapso por ícone. É o principal padrão espacial do produto e deve permanecer previsível entre módulos.

## 6. Do's and Don'ts

### Do:
- **Do** usar o magenta primário apenas para ação dominante, item selecionado e foco ativo.
- **Do** manter contraste alto entre texto principal e fundo (foreground sobre background/card).
- **Do** manter feedback explícito de estado (hover, focus, active, disabled, loading, error) em todos os componentes interativos.
- **Do** preservar densidade operacional com espaçamento curto e ritmo tipográfico estável.
- **Do** manter foco visível com halo de 3px e navegação completa por teclado nos fluxos principais.

### Don't:
- **Don't** criar interfaces genéricas sem hierarquia visual clara ("cara de template").
- **Don't** construir superfícies que dificultam localizar rapidamente estados críticos e ações prioritárias.
- **Don't** introduzir decorações visuais que competem com dados, contexto operacional e tomada de decisão.
- **Don't** usar gradiente de texto, side-stripe decorativo ou glassmorphism como recurso padrão de interface.
- **Don't** usar acento saturado em estados inativos.
