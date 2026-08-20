# Orçamento a partir do Catálogo de Produtos — design

Data: 2026-08-19

## Problema

O Catálogo de Produtos (`/produtos`) já guarda o último valor unitário de cada produto por fornecedor. Hoje, para montar uma cotação, é preciso buscar produto por produto, anotar o valor à mão e somar fora do sistema — foi exatamente o que fizemos manualmente numa lista de 31 linhas de Softys e Unicharm.

Falta poder selecionar vários produtos e sair com um documento pronto.

## Solução

Um carrinho na tela do catálogo e um documento **Orçamento** salvo e imprimível.

### Decisões tomadas

- **Preço a custo**, sem margem. É o `valorUnitario` da última NF do fornecedor. O usuário aplica margem por fora. *Consequência aceita: o PDF imprime o custo de compra.*
- **Sem dados de cliente** no documento.
- **Salvo** com código próprio, para consulta e reimpressão.
- **Carrinho lateral**, porque a busca do catálogo é por query: sem carrinho persistente, procurar o segundo produto apagaria o primeiro.

### Modelo de dados

```prisma
model Orcamento {
  id          String  @id @default(cuid())
  codigo      String  @unique // ORC-00001
  observacoes String? @db.Text
  valorTotal  Float   @default(0)

  criadoPorId String
  criadoPor   User     @relation("OrcamentoCriado", fields: [criadoPorId], references: [id])
  createdAt   DateTime @default(now())

  itens OrcamentoItem[]

  @@index([createdAt])
}

model OrcamentoItem {
  id          String    @id @default(cuid())
  orcamentoId String
  orcamento   Orcamento @relation(fields: [orcamentoId], references: [id], onDelete: Cascade)

  produtoCatalogoId String? // vínculo, não fonte do que foi impresso

  // Snapshot: o preço do catálogo muda sozinho a cada NF nova do produto.
  // Sem congelar, um orçamento reimpresso amanhã sairia com outro número.
  codigo          String
  descricao       String
  fornecedorNome  String?
  fornecedorCnpj  String
  unidade         String?
  valorUnitario   Float
  valorUnitarioEm DateTime?

  quantidade Float
  valorTotal Float

  @@index([orcamentoId])
}
```

`User` ganha `orcamentos Orcamento[] @relation("OrcamentoCriado")`.

### Código sequencial

Derivado do maior existente, como em `DeclaracaoSaida` — nunca `count()`, que repete após exclusão.

### API

- `GET /api/orcamentos` — lista com contagem de itens. ADMIN.
- `POST /api/orcamentos` — body `{ observacoes, itens: [{ produtoCatalogoId, quantidade }] }`. O servidor lê o catálogo pelos ids, monta o snapshot e calcula os totais. O cliente não envia preço.
- `GET /api/orcamentos/[id]` — detalhe.

Todas exigem `role === "ADMIN"`, igual às rotas de `/api/produtos/*`.

### Telas

`/produtos` ganha duas abas:

- **Catálogo** — a busca atual, com checkbox por linha e painel lateral do carrinho (quantidade editável, subtotal por linha, total, botão Gerar Orçamento). A seleção é guardada por `ProdutoCatalogo.id`, o que resolve os 88 códigos que existem em CNPJs diferentes com preços diferentes: cada linha do resultado já é uma entrada distinta.
- **Orçamentos** — histórico com código, data, nº de itens, total e reimpressão.

`/imprimir/orcamento/[id]` — server component no padrão dos outros documentos: cabeçalho Magna Log, CSS embutido, `@page A4 portrait`, botão com `.no-print`.

A coluna **Un** fica colada ao valor na impressão. O valor é por embalagem (CX, FRD), não por item — R$ 37,80 é a caixa de 27×200g, não o pote. Sem isso o documento se lê errado.

## Fora de escopo

- Margem e preço de venda.
- Dados de cliente e validade da proposta.
- Edição de orçamento emitido — para corrigir, emitir outro.

## Verificação

1. `npx prisma db push && npx prisma generate`.
2. `npx tsc --noEmit` sem erro novo (7 pré-existentes).
3. `npx next build` compila.
4. Buscar "creme", marcar um item; buscar "doce", marcar outro — o primeiro continua no carrinho.
5. Alterar quantidade e conferir subtotal e total.
6. Gerar: abre `/imprimir/orcamento/ORC-00001` com os itens, unidade visível e total batendo com a tela.
7. Aba Orçamentos lista o registro e reimprime igual.
8. Simular chegada de NF nova que muda o preço do produto e reimprimir: o orçamento mantém o valor original (snapshot).
9. Emitir o segundo: sai `ORC-00002`. Apagar o primeiro e emitir outro: sai `ORC-00003`, sem repetir.
