# TMS Magnalog

> Memória de projeto do Claude Code. Manter curto e de alto sinal.
> Base: `templates/CLAUDE.md.template` do vibe-coding-toolkit
> (`docs/vibe-coding-toolkit/`), preenchido com o que este projeto de fato é.

@AGENTS.md

## Diretrizes de comportamento

1. **Pensar antes de codar** — declarar as premissas. Havendo mais de uma
   leitura possível do pedido, apresentar as leituras em vez de escolher uma
   em silêncio. Dizer quando existe caminho mais simples. Se algo for
   genuinamente ambíguo, parar e perguntar.
2. **Simplicidade primeiro** — o mínimo de código que resolve. Sem feature
   especulativa, sem abstração para uso único, sem configurabilidade que
   ninguém pediu, sem tratamento de erro para cenário impossível.
3. **Mudança cirúrgica** — mexer só no que o pedido exige. Seguir o estilo que
   já está lá. Não refatorar nem reformatar código vizinho que não fazia parte
   do pedido.
4. **Execução por objetivo verificável** — "consertar o bug" vira "escrever o
   teste que reproduz, depois fazer passar". Em trabalho de várias etapas,
   declarar o plano com uma checagem por etapa e repetir até cada uma estar
   verificada.
5. **Orquestrar, não implementar** — a sessão principal planeja, decide e
   coordena. Implementação e análise delegáveis vão para subagente, em
   paralelo quando os escopos não colidem. Ver
   `.claude/rules/parallel-subagent-driven-development.md`.

## Stack

TypeScript · Next.js 14 (App Router) · React 18 · Prisma 5 + PostgreSQL (Neon,
`sa-east-1`) · NextAuth · Tailwind · Cloudflare R2 · npm

## Comandos canônicos

Usar exatamente estes — não adivinhar.

- **Instalar:** `npm install`
- **Dev:** `npm run dev`
- **Build:** `npm run build` (roda `prisma generate` antes do `next build`)
- **Lint (quality gates):** `npm run lint:quality` — hoje fecha com **0 erros
  e ~1625 avisos**. Erro novo = regressão introduzida agora. Ver
  `eslint.config.mjs`, bloco "DÍVIDA MEDIDA".
- **Typecheck:** `npx tsc --noEmit` — **não fecha limpo**: 6 erros
  pré-existentes (`ContasPagarTab.tsx`, `faturamento/transportadora/[id]/export`).
  Por isso `next.config.js` tem `typescript.ignoreBuildErrors: true`. Comparar
  contra essa linha de base, não contra zero.
- **Teste:** não existe suíte de testes neste projeto. Verificação é por
  execução real (`npm run dev`) ou sondagem de rota.

## Deploy e banco — ler antes de mexer em schema

- **Deploy** é por integração GitHub→Vercel: `git push` na `main` já publica em
  `https://tms-magnalog.vercel.app`. Não há passo manual. O Vercel CLI desta
  máquina está logado em conta **sem acesso** a este projeto (403), então
  `vercel whoami` retornar "Not authorized" é esperado.
- **Schema** vai com `npx prisma db push` seguido de `npx prisma generate`.
  **Nunca** `prisma migrate dev`: o histórico de migrations está vazio contra
  um banco com ~40 tabelas populadas, então ele acusa drift e oferece **dropar
  e recriar produção**. O `README.md` está desatualizado nesse ponto.
- O `.env` local aponta para o **mesmo banco de produção** da Vercel. O
  `db push` roda à mão e **antes** do push do código. Para revisar sem aplicar:
  `npx prisma migrate diff --from-url "<DATABASE_URL>" --to-schema-datamodel prisma/schema.prisma --script`
  e conferir que não há `DROP`.

## Vocabulário do domínio

A Magnalog é a **transportadora**. "Cliente", no vocabulário do dono do
projeto, é o **embarcador** — o emitente da NF, o fornecedor que contrata o
frete e para quem se dá o retorno — e **não** o destinatário da carga.

Isso é traiçoeiro porque o schema tem um model `Cliente` (ligado a
`Entrega.clienteId`) que é o **destinatário**. O embarcador não tem model
próprio: é derivado de `NotaFiscal.emitenteCnpj`, e o cadastro dele (e-mails,
WhatsApp, valores) vive em `TabelaTicket`, chaveado por `cnpjEmbarcador`.
Padrões em `src/lib/ticket-data.ts` e `src/lib/embarcador-contato.ts`.

Em qualquer feature de comunicação, cobrança ou retorno: confirmar qual dos
dois lados é o alvo antes de codar.

## Roteamento de agentes

O template original traz uma tabela de ~20 papéis (`orchestrator`,
`backend-specialist` etc.) que **não existem** nesta instalação — despachar
para eles falharia. Abaixo, os que realmente existem aqui.

| Agente / skill | Quando usar |
|---|---|
| `Explore` | Varredura ampla no código quando a resposta exige olhar muitos arquivos e só a conclusão importa. |
| `Plan` | Desenhar a estratégia de implementação antes de escrever código. |
| `general-purpose` | Tarefa de vários passos que precisa buscar e editar. |
| `superpowers:brainstorming` | Antes de qualquer trabalho criativo — feature nova, componente, mudança de comportamento. |
| `superpowers:systematic-debugging` | Antes de propor conserto para bug ou comportamento inesperado. |
| `security-and-hardening` | Entrada não confiável, autenticação, sessão, dados pessoais, integração externa. |
| `performance-optimization` | Suspeita de regressão de performance, N+1, tempo de carga. |
| `/code-review` | Revisão do diff antes de commitar ou mergear. |

## Convenções

- Comentários e mensagens de commit em **português**, sem acento em mensagem de
  commit (o histórico segue esse padrão).
- Imports por alias `@/*` (mapeado para `./src/*`).
- Acesso ao banco: `import { prisma } from "@/lib/prisma"`. Componente em
  `src/components/` e hook em `src/hooks/` **não** importam o Prisma direto —
  isso é erro de lint. Server component em `src/app/` pode.
- Teto de **350 linhas por arquivo** para arquivo novo. Os 32 que já passavam
  do teto estão na baseline do `eslint.config.mjs` — a lista existe para
  diminuir, não para crescer.
