# Excluir usuário — design

Data: 2026-09-21

## Problema

A tela de Usuários só sabe **desativar**. Desativar já bloqueia a entrada na
hora (login por senha e por Google recusam, e o gate de API derruba a sessão
na requisição seguinte), mas o usuário continua na lista e **segura o
e-mail**, que é único no banco. O dono quer excluir de vez: sumir da lista,
não entrar mais, e liberar o e-mail para uma conta nova.

Não existe limite de usuários no sistema; a exclusão é por organização.

## Decisão: excluir de verdade, com trava por histórico

Quatro relações apontam para `User` de forma obrigatória — `Avaria.registradoPor`,
`Orcamento.criadoPor`, `DeclaracaoSaida.emitidoPor`, `QualidadeOperacional.admin`.
Apagar um usuário com qualquer uma delas apagaria histórico operacional/fiscal
(ou falharia no banco). Decidido com o dono: **recusar** e manter "Desativar"
como saída.

Sem essas relações, o `delete` do Prisma:
- leva junto `Account`, `Session`, `FornecedorAutorizado`, `PresencaVisita`
  (cascade já declarado);
- deixa sem autor anexos, mensagens de WhatsApp, notas canceladas, tickets e
  avarias resolvidas (relações opcionais → `SetNull`). A auditoria já guarda
  nome e e-mail em texto e sobrevive.

## API — `src/app/api/usuarios/route.ts`

- `DELETE /api/usuarios?id=<id>` — `requireApi(["ADMIN"])`.
  - Sem `id` → 400. `id` do próprio solicitante → 400 ("Você não pode
    excluir a si mesmo"). Como o solicitante é um ADMIN ativo e não pode ser
    o alvo, nunca fica zero ADMIN — não precisa de checagem extra.
  - Alvo inexistente → 404.
  - `_count` das quatro relações; qualquer uma > 0 → 409 com a lista
    ("2 avaria(s) registrada(s), 1 orçamento(s) criado(s). Desative em vez de
    excluir.").
  - `prisma.user.delete`; um P2003 inesperado também vira 409 com a mesma
    orientação.
  - `logAudit` `USUARIO_APAGADO` com o ADMIN como ator e o excluído em
    `recursoId`/`recursoDesc`.
- `POST /api/usuarios` — antes de criar, `findUnique` por e-mail: se existe,
  409 "E-mail já cadastrado" (com "em um usuário inativo — exclua-o ou
  reative-o" quando for o caso). Hoje estoura o unique com 500.

## Sessão — `src/lib/authOptions.ts`

O callback `jwt` acha o usuário pelo **e-mail** do token. Com e-mail
reaproveitado, o token do excluído (30 dias) viraria sessão da conta nova.
Passa a valer só se `token.userId` está vazio (primeiro sinal) ou é igual ao
`id` encontrado; caso contrário, `ativo = false`.

## Tela — `src/app/(dashboard)/usuarios/page.tsx`

- Botão de lixeira ao lado do lápis.
- Modal de confirmação: "Excluir <nome>? Ele some da lista, o e-mail fica livre
  e ele não entra mais. Isso não pode ser desfeito." Cancelar / Excluir.
- Resposta 409: o modal mostra a mensagem e oferece **"Desativar em vez
  disso"** (se ainda ativo) ou Fechar.
- Erro do cadastro (409 do POST) aparece no toast em vez de "Erro ao salvar".

## Fora do escopo

Esconder o botão para o próprio usuário (a API recusa e o toast avisa);
exclusão em lote; recuperar um excluído.

## Verificação

1. `curl -X DELETE http://localhost:3000/api/usuarios?id=x` sem sessão → 401.
2. No localhost como ADMIN: criar um usuário de teste, excluir → some; criar de
   novo com o mesmo e-mail → funciona. Tentar excluir um usuário com avaria
   registrada → mensagem com a contagem e botão "Desativar em vez disso".
   Tentar excluir a si mesmo → toast de recusa. Cadastrar e-mail de um inativo
   → "E-mail já cadastrado em um usuário inativo".
3. Auditoria mostra `USUARIO_APAGADO` com o nome do excluído.
4. `lint:quality` 0 erros; `tsc` nos 6 de baseline; página abaixo de 350 linhas.
