# Presença online na Auditoria — design

Data: 2026-09-21

## Problema

A sessão do TMS é JWT (`authOptions.ts`, `strategy: "jwt"`). O banco não sabe
quem está com o sistema aberto: fechar a aba não gera evento, e o `LOGOUT` da
auditoria só aparece quando alguém clica em "Sair". O dono quer olhar a tela de
Auditoria e ver **quem está online agora, em qual tela**, e também consultar
**quem esteve online em um dia** e por quanto tempo.

## Escopo

- Retrato de agora: usuário, papel, tela atual, último sinal, online/ausente.
- Histórico por dia: visitas (início, fim, duração, última tela).
- Só usuários internos (ADMIN, FINANCEIRO, OPERACIONAL, CONFERENTE). Cliente
  do portal continua coberto pelos eventos `PORTAL_*` que já existem — e o
  middleware da `main` (PR #1 de segurança) já nega a CLIENTE qualquer
  `/api/*` fora de `/api/portal`, então o beacon nem tenta para esse papel.
- Visível só para ADMIN, como a página de Auditoria inteira.

Fora desta rodada: trilha de telas por visita (por onde passou), tempo real via
websocket, detecção de inatividade por mouse/teclado.

## Abordagem

Heartbeat do navegador + uma linha por **visita** no banco (não por sinal).

O navegador manda `POST /api/presenca` com a tela atual ao montar, ao trocar de
rota e a cada 60 s enquanto a aba está visível. O servidor procura a visita
mais recente do usuário: se o `ultimoSinal` tem menos de 5 min, atualiza
`ultimoSinal` e `tela`; senão, cria uma visita nova. Não existe coluna "fim":
visita encerrada é a que está sem sinal há mais de 5 min, e o fim é o
`ultimoSinal`.

Por que assim:
- Uma linha por visita mantém a tabela pequena (~30 linhas/dia para 10
  usuários) e responde retrato e histórico com a mesma estrutura.
- Sem coluna "fim" não há beacon de saída, que no App Router não dispara em
  navegação interna e fragmentaria visitas a cada reload.
- 60 s de intervalo dá ~100 mil invocações/mês para 10 usuários, dentro do
  plano da Vercel; a troca de rota pinga na hora, então a tela atual nunca
  fica 60 s atrasada.

Alternativas descartadas: inferir por LOGIN/LOGOUT da auditoria (não sabe de
aba fechada); serviço de presença em tempo real (dependência externa para uma
equipe pequena).

## Modelo de dados

```prisma
model PresencaVisita {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  inicio      DateTime @default(now())
  ultimoSinal DateTime @default(now())
  tela        String              // pathname da ultima tela vista
  ip          String?
  userAgent   String?  @db.Text

  @@index([ultimoSinal])
  @@index([userId, ultimoSinal])
}
```

`User` ganha `presencas PresencaVisita[]`. É só `CREATE TABLE` + índices —
conferir com `prisma migrate diff` que não há `DROP` antes do `db push`.

Constantes (em `src/lib/presenca.ts`):
- `INTERVALO_SINAL_MS = 60_000`
- `ONLINE_ATE_MS = 2 * 60_000` — sinal mais novo que isso = online.
- `VISITA_ABERTA_ATE_MS = 5 * 60_000` — sinal mais novo que isso = visita
  aberta (entre 2 e 5 min = "ausente").

## API — `src/app/api/presenca/route.ts`

Autorização pelo gate único `requireApi` de `@/lib/api-auth` (veio com o PR
de segurança): sem argumento aceita só papéis internos, o que já exclui
CLIENTE — o middleware, aliás, nem deixa CLIENTE chegar em `/api/presenca`.

- `POST` — body `{ tela: string }`. `requireApi()`; se negar, devolve a
  resposta do gate. Usa `extractRequestMeta` de `@/lib/audit` para
  ip/userAgent. Atualiza ou cria a visita conforme a regra acima. Responde 204.
- `GET` — `requireApi(["ADMIN"])`.
  - Sem parâmetro: `{ online: Visita[] }` — visitas com `ultimoSinal` mais
    novo que `VISITA_ABERTA_ATE_MS`, com `user { name, email, role }` e
    `status: "online" | "ausente"`. Pela regra dos 5 min, cada usuário tem
    no máximo uma visita aberta, então já sai uma linha por pessoa.
  - `?inicio=<ISO>&fim=<ISO>`: `{ visitas: Visita[] }` — visitas que tocam o
    intervalo (`inicio <= fim && ultimoSinal >= inicio`), ordenadas por
    `inicio` desc, com `aberta: boolean`. O cliente calcula o intervalo do
    dia escolhido no fuso do navegador e manda em ISO — o servidor da Vercel
    roda em UTC e não pode decidir onde o dia começa.
- `DELETE /api/auditoria?dias=N` (já existe) passa a apagar também
  `PresencaVisita` com `ultimoSinal` anterior ao limite.

Nome da tela: o cliente manda o `pathname` cru; a página de Auditoria converte
em rótulo com `navGroups` de `nav-items.ts` (item cujo `href` é prefixo do
pathname; `/dashboard` só por igualdade). Sem correspondência, mostra o
pathname.

## Cliente

`src/components/layout/PresencaBeacon.tsx` (client component, sem UI),
montado em `src/app/(dashboard)/layout.tsx` ao lado da `Sidebar`.

- Lê `usePathname()` e `useSession()`. Se o papel for CLIENTE, não faz nada.
- Pinga ao montar e a cada mudança de `pathname`.
- `setInterval` de 60 s que só pinga se `document.visibilityState === "visible"`.
- Em `visibilitychange` para `visible`, pinga na hora.
- `fetch` com `keepalive: true`; erro é silencioso (presença não pode quebrar
  a navegação).

## Tela — `src/components/auditoria/PresencaPanel.tsx`

Card acima dos KPIs em `auditoria/page.tsx` (que já está em 367 linhas — o
painel entra como componente, e a página só o importa). Duas abas dentro do
card:

- **Agora** — contador no título ("3 online"), lista: inicial do nome em
  círculo, nome, badge do papel (`badge-<ROLE>` que já existe no CSS), tela
  atual com rótulo do menu, "há 40 s" e bolinha verde (online) ou âmbar
  (ausente). Recarrega sozinho a cada 30 s enquanto a página está aberta.
  Vazio: "Ninguém online agora".
- **Histórico** — `input type="date"` (padrão hoje); o painel converte o dia
  em `inicio`/`fim` locais (00:00 e 23:59:59) e chama a API. Lista de visitas:
  usuário, início, fim (ou "em aberto"), duração, última tela. Vazio:
  "Nenhuma visita nesse dia".

Componentes de `@/components/ui` (Card, Button, Input, Empty) e os tokens
`var(--*)` que a página já usa.

## Limitações aceitas

- Aba visível sem ninguém na frente conta como online.
- Duas abas do mesmo usuário aparecem como uma visita; a última tela pingada
  vence.
- Duração de visita tem precisão de ~60 s (o intervalo do sinal).
- Duas abas abertas no mesmo instante (ou o StrictMode do Next em dev) podem
  criar duas visitas; "Agora" mostra só a mais recente por usuário, e o
  histórico fica com uma visita-fantasma de ~1 min.
- `tela` é informada pelo próprio navegador: serve de conveniência, não de
  prova.

## Verificação

1. `npx prisma migrate diff --from-url "<DATABASE_URL>" --to-schema-datamodel prisma/schema.prisma --script` — só `CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`, nenhum `DROP`. Só então `npx prisma db push` + `npx prisma generate`, com autorização explícita do dono (o `.env` aponta para produção).
2. `curl` sem sessão: `POST /api/presenca` → 401; `GET` → 401.
3. No localhost, logar em dois navegadores com usuários diferentes; abrir
   Auditoria no ADMIN: os dois aparecem em "Agora" com a tela certa; trocar de
   tela num deles atualiza em até 30 s; fechar a aba dele → "ausente" em 2 min,
   some em 5.
4. Aba Histórico com o dia de hoje lista as visitas com duração.
5. `npm run lint:quality` em 0 erros; `npx tsc --noEmit` nos mesmos 6 erros
   pré-existentes; arquivos novos abaixo de 350 linhas.
