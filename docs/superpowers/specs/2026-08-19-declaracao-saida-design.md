# Declaração de Saída — design

Data: 2026-08-19

## Problema

Quando mercadoria de avaria/devolução sai do CD, alguém vem buscar. Hoje existe o botão **Dar Saída** na tela de uma avaria ([src/app/(dashboard)/avarias/[id]/page.tsx:140](../../../src/app/(dashboard)/avarias/[id]/page.tsx#L140)), mas ele tem três limites:

1. **Escopo de uma avaria só** — não dá para juntar itens de registros, ocorrências e devoluções diferentes numa retirada única, que é como acontece na prática.
2. **Não imprime nada** — é só mudança de status, então não há documento para o motorista assinar.
3. **Dados não estruturados** — transportadora, motorista e placa são concatenados numa string dentro de `observacoes` da `NotaDevolucao`. Não dá para reimprimir, consultar nem auditar depois.

A Declaração de Recebimento (`/imprimir/declaracao-recebimento/[id]`) resolve o lado da entrada. Falta o equivalente na saída.

## Solução

Um documento novo, **Declaração de Saída**, que agrega itens selecionados de três fontes (avarias/registros, notas de devolução, ocorrências), registra quem está retirando e é impresso para assinatura do motorista.

### Modelo de dados

```prisma
enum OrigemSaidaItem {
  AVARIA
  DEVOLUCAO
  OCORRENCIA
}

model DeclaracaoSaida {
  id     String @id @default(cuid())
  codigo String @unique              // DS-00001

  // Quem está retirando a mercadoria
  transportadora String
  motoristaNome  String
  motoristaCpf   String?
  placa          String

  observacoes String? @db.Text
  valorTotal  Float   @default(0)    // snapshot do total impresso

  emitidoPorId String
  emitidoPor   User   @relation("DeclaracaoSaidaEmitida", fields: [emitidoPorId], references: [id])
  createdAt    DateTime @default(now())

  itens DeclaracaoSaidaItem[]

  @@index([createdAt])
}

model DeclaracaoSaidaItem {
  id           String          @id @default(cuid())
  declaracaoId String
  declaracao   DeclaracaoSaida @relation(fields: [declaracaoId], references: [id], onDelete: Cascade)

  origem          OrigemSaidaItem
  avariaId        String?
  notaDevolucaoId String?
  ocorrenciaId    String?

  // Snapshot do que foi impresso — o documento é assinado, não pode mudar
  // se a avaria de origem for editada depois.
  referencia  String            // "AVR-00025" | "NF 12345" | "ENT-00088"
  descricao   String
  quantidade  Float?
  valor       Float   @default(0)

  @@index([declaracaoId])
  @@index([avariaId])
  @@index([notaDevolucaoId])
}
```

`User` ganha a back-relation `declaracoesSaida DeclaracaoSaida[] @relation("DeclaracaoSaidaEmitida")`.

**Por que snapshot:** o documento é assinado pelo motorista e vira comprovante. Se alguém corrigir a quantidade ou o valor da avaria depois, a via assinada e a tela precisam continuar batendo. Os ids ficam para navegação e rastreio ("esta avaria saiu na DS-00003"), não como fonte do que foi impresso.

### Geração do código

Derivar do maior código existente, não de `count()`:

```ts
const ultima = await prisma.declaracaoSaida.findFirst({
  orderBy: { codigo: "desc" }, select: { codigo: true },
});
const proximo = ultima ? parseInt(ultima.codigo.slice(3)) + 1 : 1;
const codigo = `DS-${String(proximo).padStart(5, "0")}`;
```

O padrão atual em [src/app/api/avarias/route.ts:85](../../../src/app/api/avarias/route.ts#L85) usa `count() + 1`, que colide se um registro for apagado. Não vamos replicar o defeito no modelo novo.

### API

- `GET /api/declaracoes-saida` — lista paginada com contagem de itens.
- `POST /api/declaracoes-saida` — cria. Body: dados de quem retira + array de itens (`{origem, refId}`). O servidor monta o snapshot lendo cada origem, calcula `valorTotal`, cria tudo numa `prisma.$transaction`, e marca as devoluções.
- `GET /api/declaracoes-saida/[id]` — detalhe com itens.
- `GET|POST|PUT /api/declaracoes-saida/[id]/anexos` e `DELETE|PATCH .../[anexoId]` — delegam para os helpers de [src/lib/anexos.ts](../../../src/lib/anexos.ts).

Fonte do snapshot por origem:

| Origem | referencia | descricao | quantidade | valor |
|---|---|---|---|---|
| AVARIA | `avaria.codigo` | `avaria.descricao` | soma de `produtos.quantidadeAvaria` | `avaria.valorPrejuizo` |
| DEVOLUCAO | `NF {numero}` | `emitenteRazao` | — | `valorNota` |
| OCORRENCIA | `entrega.codigo` | `{tipo} — {descricao}` | — | 0 |

### Efeito no status

Ao emitir, dentro da mesma transação:

- **Devoluções** → `status: "RETIRADO"`, `dataRetirada: new Date()`. Mesmo efeito do "Dar Saída" atual.
- **Avarias e ocorrências** → *não mudam de status*. Sair do CD não é o mesmo que estar resolvida: a avaria pode seguir em disputa depois da mercadoria ir embora. O vínculo pelo id já permite exibir "saiu na DS-00003" onde interessar.

### Telas

**Nova aba "Declaração de Saída"** em `/avarias`, ao lado de "Declaração Recebimento" (lista de tabs em [src/app/(dashboard)/avarias/page.tsx:702](../../../src/app/(dashboard)/avarias/page.tsx#L702)). Lista as declarações com código, data, motorista/placa, contagem de itens, valor e ações Reimprimir / Anexar via assinada.

**Modal de 2 etapas**, no formato do modal de declaração de recebimento que já existe:

- *Etapa 1 — seleção*: três blocos com checkbox. Avarias (status ≠ RESOLVIDA), notas de devolução (status `PENDENTE`) e ocorrências não resolvidas. Cada bloco com busca. Rodapé mostra o total selecionado.
- *Etapa 2 — quem retira*: transportadora, motorista, CPF, placa, observações, e a prévia do que vai ser impresso. Botão **Salvar e Imprimir** cria e abre a impressão em nova aba.

**Impressão** — `/imprimir/declaracao-saida/[id]`, espelhando a estrutura de [src/app/imprimir/declaracao-recebimento/[id]/page.tsx](../../../src/app/imprimir/declaracao-recebimento/[id]/page.tsx): server component, mesmo cabeçalho com logo, CSS embutido, `@page A4 portrait`, botão de imprimir com `.no-print`. Título **DECLARAÇÃO DE SAÍDA**, dados de quem retira, uma seção por tipo de origem, total geral e linhas de assinatura (quem entregou / quem retirou).

### Anexo da via assinada

`Anexo.ownerType` é `String` livre no schema, com a união TypeScript em [src/lib/anexos.ts:13](../../../src/lib/anexos.ts#L13). Basta acrescentar `"DECLARACAO_SAIDA"` à união e criar as rotas — sem migration.

O `visivelPortal` recém-criado **não se aplica** aqui: declaração de saída é documento interno de retirada, não vai ao portal do cliente. As rotas não passam `portalToggle` ao `AnexosCard`, e `anexosSetVisibilidade` já rejeita `ownerType !== "AVARIA"` com 400.

## Fora de escopo

- Não altera o "Dar Saída" existente na tela da avaria. Ele continua funcionando para o caso simples de uma avaria só.
- Não migra os dados antigos que estão concatenados em `observacoes`.
- Sem edição de declaração emitida — documento assinado não se edita. Para corrigir, emitir outra.

## Verificação

1. `npx prisma db push && npx prisma generate` sem erro de relation.
2. `npx tsc --noEmit` sem erro novo (o projeto tem 7 pré-existentes).
3. `npm run build` compila.
4. Fluxo completo: `/avarias` → aba Declaração de Saída → Nova → selecionar 1 avaria + 2 devoluções + 1 ocorrência → preencher motorista/placa/transportadora → Salvar e Imprimir.
   - abre `/imprimir/declaracao-saida/DS-xxxxx` com as três seções e o total certo;
   - as 2 devoluções ficam `RETIRADO` com `dataRetirada` preenchida;
   - a avaria e a ocorrência **não** mudam de status.
5. Editar a avaria de origem (mudar valor) e reimprimir: o documento mantém o valor original (snapshot).
6. Anexar um PDF na declaração e reabrir a lista: o anexo aparece.
7. Emitir uma segunda declaração: código sai `DS-00002`. Apagar a primeira e emitir outra: sai `DS-00003`, não repete.
