# MDF-e no TMS — design

Data: 2026-08-20

## Problema

A Magna Log emite MDF-e, mas ele vive fora do TMS. Hoje o sistema conhece NF-e, CT-e e NFS-e; o manifesto que amarra a viagem inteira — motorista, veículo, e todos os documentos transportados — não existe aqui. Consultar qual manifesto cobre qual rota depende de abrir o emissor.

Pior: o MDF-e precisa ser **encerrado** depois da viagem. Manifesto esquecido em aberto gera problema com a SEFAZ, e ninguém no TMS tem visibilidade disso.

## Escopo

**Importar, não emitir.** O XML vem do emissor que já usam. Emissão pelo TMS exigiria certificado A1 no servidor, assinatura, webservice da SEFAZ e homologação — outra ordem de grandeza, com risco fiscal. Fica de fora.

Três usos, decididos com o usuário: vincular à Rota, controlar encerramento e gerar o DAMDFE em PDF.

## A restrição que molda o desenho

**O encerramento é um evento separado (tpEvento 110112), não um campo do manifesto.** O XML do MDF-e autorizado não diz se ele foi encerrado — do mesmo jeito que o XML da NF-e não diz que ela foi cancelada, como já provamos na Fase 0 varrendo 1.737 XMLs e confirmando com chamada ao vivo.

A API do Meu Danfe não responde situação de documento. Logo, **o TMS não tem como descobrir sozinho que um manifesto foi encerrado.** Três saídas possíveis, e o desenho usa as duas primeiras:

1. **Marcação manual** — quem encerra no emissor marca no TMS. Simples, mas depende de disciplina.
2. **Importar o XML do evento de encerramento** — o emissor gera esse arquivo; importá-lo é o mesmo fluxo do manifesto. Confiável, e sem trabalho extra além de subir o arquivo.
3. ~~Consultar a SEFAZ~~ — exigiria certificado A1 e integração própria. Fora de escopo.

O alerta de "manifesto aberto há N dias" funciona com qualquer uma das duas: sem informação de encerramento, o manifesto conta como aberto.

## Modelo de dados

```prisma
enum StatusMdfe {
  AUTORIZADO
  ENCERRADO
  CANCELADO
}

model Mdfe {
  id          String @id @default(cuid())
  chaveAcesso String @unique
  numero      String
  serie       String?
  modelo      String @default("58")

  emitenteCnpj String
  emitenteNome String?

  ufInicio String
  ufFim    String

  dataEmissao    DateTime?
  dataInicioViagem DateTime?

  // Modal rodoviário
  placaTracao String?
  rntrc       String?
  condutorNome String?
  condutorCpf  String?

  // Totais declarados no manifesto
  qtdCTe   Int   @default(0)
  qtdNFe   Int   @default(0)
  valorCarga Float @default(0)
  pesoCarga  Float @default(0)

  status       StatusMdfe @default(AUTORIZADO)
  encerradoEm  DateTime?
  // MANUAL quando alguém marcou na tela, EVENTO quando veio do XML 110112.
  // Guardar a origem importa: uma é palavra, a outra é documento fiscal.
  encerradoPor String?

  rotaId String?
  rota   Rota?   @relation(fields: [rotaId], references: [id])

  xmlOriginal String? @db.Text
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  documentos MdfeDocumento[]

  @@index([status])
  @@index([rotaId])
  @@index([dataInicioViagem])
}

model MdfeDocumento {
  id     String @id @default(cuid())
  mdfeId String
  mdfe   Mdfe   @relation(fields: [mdfeId], references: [id], onDelete: Cascade)

  tipo        String // "NFE" | "CTE"
  chaveAcesso String
  municipioDescarga String?
  ufDescarga        String?

  @@index([mdfeId])
  @@index([chaveAcesso])
}
```

`Rota` ganha `mdfes Mdfe[]`.

Os documentos manifestados ficam numa tabela própria porque um MDF-e lista dezenas de chaves, e é por elas que se cruza com as `NotaFiscal` e `CTe` que já existem — permitindo responder "qual manifesto cobre esta nota?".

## Vínculo com a Rota

Automático quando der, manual sempre disponível. Ao importar, tenta casar por:

1. **Placa + data de início da viagem** — `Rota.veiculo.placa` e `Rota.data`. É o caminho mais direto e cobre o caso normal.
2. **Chaves manifestadas** — se as NF-e do manifesto pertencem a entregas de uma única rota, é essa.

Casou em exatamente uma rota, vincula. Ambíguo ou sem candidato, fica solto e a tela oferece escolher.

## Telas

Aba **MDF-e** na tela de Importação, ao lado de CT-e, seguindo o padrão de componente separado (`CteTab`, `NfseTab`, `SincronizacaoTab`):

- Upload de XML — aceita o manifesto e o evento de encerramento no mesmo campo, distinguindo pelo conteúdo (`procEventoMDFe` / `tpEvento` 110112 → encerra o manifesto correspondente).
- Lista com número, série, placa, UF origem→destino, data de início, quantidade de documentos, valor da carga, status e rota vinculada.
- **Filtro "Em aberto"** com destaque para os que passaram de N dias desde o início da viagem.
- Ação de marcar encerrado manualmente, gravando `encerradoPor = "MANUAL"`.

Na tela da **Rota**, um bloco mostrando o manifesto vinculado.

## DAMDFE em PDF — pendente

O Meu Danfe converte MDF-e em PDF, mas o endpoint está na seção de *Conversão* da documentação, que veio truncada. Também não há OpenAPI exposto (`/v2/api-docs`, `/v2/openapi.json` e variantes retornam 404), e não vou adivinhar caminho de endpoint.

Enquanto isso não chega, o botão de PDF fica fora. Vale lembrar que o emissor de vocês provavelmente já entrega o DAMDFE — então isso é conveniência, não bloqueio.

Quando o endpoint aparecer, entra em `src/lib/meudanfe.ts` junto dos demais, e a rota espelha o `POST /api/danfe`. Atenção: a doc diz que MDF-e **não fica armazenado** na Área do Cliente, então cada PDF exige reenviar o XML — não existe o atalho de download gratuito que a NF-e tem.

## Fora de escopo

- Emissão e transmissão à SEFAZ.
- Consulta de situação na Receita.
- Outros modais além do rodoviário.

## Verificação

1. `npx prisma db push && npx prisma generate` — parar o dev server antes, ele segura o engine.
2. `npx tsc --noEmit` sem erro novo (6 pré-existentes) e `npx next build` compilando.
3. Importar um MDF-e real de vocês: confere número, série, placa, UFs, data de início, quantidade de documentos e valor da carga contra o que o emissor mostra.
4. Conferir que as chaves manifestadas casam com `NotaFiscal`/`CTe` que já existem no TMS.
5. Vínculo automático: importar um manifesto cuja placa e data batam com uma rota existente e verificar que amarrou sozinho; importar um sem correspondência e verificar que ficou solto sem quebrar.
6. Importar o XML do evento de encerramento e conferir que o manifesto virou `ENCERRADO` com `encerradoPor = "EVENTO"`.
7. Marcar outro como encerrado pela tela e conferir `encerradoPor = "MANUAL"`.
8. Filtro "Em aberto" lista só os não encerrados e destaca os antigos.
