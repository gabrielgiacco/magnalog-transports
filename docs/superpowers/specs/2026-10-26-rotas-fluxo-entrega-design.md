# Rotas com o mesmo fluxo da entrega direta

Aprovado pelo usuário em 2026-10-26.

## Objetivo

A rota passa pelas mesmas etapas da entrega direta: Em Separação → Carregado → Em Rota → Entregue → Finalizado. Isso vale tanto na tela de Rotas quanto no Kanban.

## Regras

- **Etapa da rota.** É a etapa da entrega mais atrasada da rota, sem contar as que estão em Ocorrência. Se todas estiverem em Ocorrência, a etapa é Ocorrência. Uma rota sem entregas não tem etapa.
- **Criar rota.** As entregas entram em Em Separação. Antes entravam em Carregado.
- **Mover a rota para uma etapa X** (botão em Rotas ou arraste no Kanban):
  - Avançando: entregas que estão antes de X vão para X.
  - Voltando, o que só acontece pelo Kanban: entregas depois de X voltam para X. Entregue e Finalizado não são desfeitos, a não ser que X também seja Entregue ou depois.
  - Entregas em Ocorrência nunca mudam. Uma rota não pode ser levada para Ocorrência: a ocorrência é registrada na entrega.
  - Entregue e Finalizado exigem data de entrega. A data informada vale só para as entregas que ainda não têm data.
  - Finalizado marca o canhoto como recebido.
  - Concluir dá baixa nas ocorrências abertas apenas das entregas que mudaram (`resolucaoAutomatica`).
  - O `Rota.status` é derivado da etapa resultante:
    - Em Separação e Carregado → PLANEJADA
    - Em Rota → EM_ANDAMENTO
    - Entregue e Finalizado → CONCLUIDA
  - Rota cancelada não se move.
- **Entrega adicionada depois** a uma rota existente entra na etapa da rota (Carregado ou Em Rota). Nos outros casos, entra em Em Separação.
- **`Rota.status` não muda no banco.** Ele segue sendo usado pelo link do motorista, pelas diárias, pelos relatórios e pelo stats. O "Iniciar rota" do motorista continua avançando só as entregas que estão em Carregado.
- **Lista de Rotas.** Por padrão esconde as rotas canceladas e as concluídas cujas entregas estão todas em Finalizado ou Ocorrência. Assim uma rota em Entregue continua visível até ser finalizada.
- **Rotas antigas** não são convertidas.

## Peças

- `src/lib/rota-etapa.ts`, módulo puro: `FLUXO_ENTREGA`, `etapaDaRota`, `proximaEtapa`, `statusRotaDaEtapa`, `statusParaNovaEntrega`, `deveMover`.
- `src/lib/rota-mover.ts`, no servidor: `moverRota(db, rotaId, etapa, dataEntrega)`. É a única regra, usada pelo `PUT /api/rotas/[id]` (`{ etapa, dataEntrega }`) e pelo `PATCH /api/kanban` (`rota_…`).
- `src/components/rota/AvancarEtapaRota.tsx`: botão para a próxima etapa, com o modal de data. Usado na lista e no detalhe de Rotas no lugar de Iniciar/Concluir/Finalizar.
- Kanban: o cartão da rota usa `etapaDaRota` em vez do status da primeira entrega.

## Verificação

Não há suíte de testes. Valem `npx tsc --noEmit` (linha de base de 6 erros) e `npm run lint:quality` (0 erros). A conferência funcional é em produção depois do deploy:
1. Criar rota: as entregas aparecem em Em Separação.
2. Avançar pela tela de Rotas até Finalizado.
3. Arrastar no Kanban, com a tela de Rotas mostrando a mesma etapa.
