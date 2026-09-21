# Presença online na Auditoria — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela de Auditoria mostra quem está com o TMS aberto agora (e em qual tela) e o histórico de visitas por dia.

**Architecture:** O navegador manda um sinal (`POST /api/presenca`) ao montar, ao trocar de rota e a cada 60 s com a aba visível. O servidor guarda **uma linha por visita** (`PresencaVisita`): sinal novo atualiza a visita aberta; sem sinal há mais de 5 min, a próxima abre uma visita nova. `GET /api/presenca` responde o retrato de agora ou as visitas de um intervalo; um painel na Auditoria mostra os dois.

**Tech Stack:** Next.js 14 App Router · Prisma 5 + PostgreSQL (Neon) · NextAuth (JWT) · React 18 · Tailwind + tokens `var(--*)`.

Spec: `docs/superpowers/specs/2026-09-21-presenca-online-design.md`.

## Global Constraints

- Comentários em português; mensagens de commit em português **sem acento**.
- Imports por alias `@/*`. Prisma só via `import { prisma } from "@/lib/prisma"`, e **nunca** dentro de `src/components/` ou `src/hooks/` (erro de lint).
- Arquivo novo com no máximo **350 linhas** (`quality/max-lines`).
- `npm run lint:quality` deve fechar com **0 erros** (avisos existem, ~1627). `npx tsc --noEmit` tem **6 erros pré-existentes** (`ContasPagarTab.tsx` e `faturamento/transportadora/[id]/export/route.ts`) — comparar contra essa linha de base, não contra zero.
- Não existe suíte de testes: cada tarefa verifica por `tsc`, `eslint` no arquivo e sondagem real (`curl` / `npm run dev`).
- **Implementador não commita.** Deixa as mudanças no working tree e reporta os arquivos tocados; o controlador commita por tarefa depois da onda (`.claude/rules/parallel-subagent-driven-development.md`).
- `npx prisma db push` toca o banco de **produção** (o `.env` local aponta para lá). Só o controlador roda, depois de conferir o `migrate diff`. **Nunca** `prisma migrate dev`.
- Só usuários internos são rastreados. CLIENTE fica de fora do beacon (o middleware já nega `/api/*` fora de `/api/portal` para esse papel).

## Ondas

| Onda | Tarefas | Por quê |
|---|---|---|
| 1 | Task 1 | Schema + constantes: as outras três dependem do client Prisma gerado e das constantes. Depois dela o controlador roda `db push` + `generate`. |
| 2 | Task 2, Task 3, Task 4 em paralelo | Arquivos disjuntos; só consomem o que a Task 1 produz. A Task 4 consome a **forma** da API da Task 2, definida no bloco Interfaces — não precisa do código dela pronto. |
| 3 | Task 5 | Verificação integrada, feita pelo controlador. |

---

### Task 1: Modelo `PresencaVisita` e constantes de tempo

**Files:**
- Modify: `prisma/schema.prisma` (linha 70, relação no `User`; e após o `model AuditLog`, que termina na linha 152)
- Create: `src/lib/presenca.ts`

**Depends-on:** none

**Interfaces:**
- Produces: model Prisma `PresencaVisita` (`prisma.presencaVisita`) com campos `id, userId, inicio, ultimoSinal, tela, ip, userAgent` e relação `user`.
- Produces: `INTERVALO_SINAL_MS`, `ONLINE_ATE_MS`, `VISITA_ABERTA_ATE_MS`, tipo `StatusPresenca`, função `statusDoSinal(ultimoSinal: Date | string, agora?: number): StatusPresenca` em `@/lib/presenca`.

- [ ] **Step 1: Relação no `User`**

Em `prisma/schema.prisma`, logo abaixo da linha `auditLogs               AuditLog[]` (linha 70), adicionar:

```prisma
  presencas               PresencaVisita[]
```

- [ ] **Step 2: Model novo**

Depois do fechamento do `model AuditLog` (a linha `}` após `@@index([recursoTipo, recursoId])`) e antes de `model FornecedorAutorizado`, inserir:

```prisma
// Presenca online: uma linha por VISITA, nao por sinal. O beacon do navegador
// atualiza a visita aberta; visita sem sinal ha mais de VISITA_ABERTA_ATE_MS
// (src/lib/presenca.ts) conta como encerrada e o proximo sinal abre outra.
model PresencaVisita {
  id          String   @id @default(cuid())
  userId      String
  inicio      DateTime @default(now())
  ultimoSinal DateTime @default(now())
  tela        String   // pathname da ultima tela vista
  ip          String?
  userAgent   String?  @db.Text

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([ultimoSinal])
  @@index([userId, ultimoSinal])
}
```

- [ ] **Step 3: Constantes**

Criar `src/lib/presenca.ts`:

```ts
// Regras de tempo da presenca online. Compartilhadas entre o beacon (cliente),
// a API e o painel da Auditoria — mudar aqui muda nos tres.

/** Intervalo entre sinais enquanto a aba esta visivel. */
export const INTERVALO_SINAL_MS = 60_000;

/** Sinal mais novo que isso = online. */
export const ONLINE_ATE_MS = 2 * 60_000;

/** Sinal mais novo que isso = visita ainda aberta. Entre ONLINE e isto = ausente. */
export const VISITA_ABERTA_ATE_MS = 5 * 60_000;

export type StatusPresenca = "online" | "ausente";

export function statusDoSinal(ultimoSinal: Date | string, agora = Date.now()): StatusPresenca {
  return agora - new Date(ultimoSinal).getTime() < ONLINE_ATE_MS ? "online" : "ausente";
}
```

- [ ] **Step 4: Validar o schema e mostrar o diff (sem aplicar)**

```bash
npx prisma validate
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script
```

(`DATABASE_URL` está no `.env`; em bash, `export $(grep -E '^DATABASE_URL=' .env | sed 's/"//g')` antes.)

Esperado: `CREATE TABLE "PresencaVisita"`, dois `CREATE INDEX`, um `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY`. **Nenhum `DROP`.** Colar a saída inteira no relatório. **Não rodar `db push`** — é o controlador que roda.

- [ ] **Step 5: Lint do arquivo novo**

```bash
npx eslint src/lib/presenca.ts
```

Esperado: sem erro.

- [ ] **Step 6: Reportar** os dois arquivos tocados e a saída do `migrate diff`. Não commitar.

**Depois da Task 1, o controlador roda** (autorizado pelo dono nesta sessão):

```bash
npx prisma db push
npx prisma generate
npx tsc --noEmit 2>&1 | grep -c "error TS"   # esperado: 6
```

---

### Task 2: API `/api/presenca` e limpeza junto com a auditoria

**Files:**
- Create: `src/app/api/presenca/route.ts`
- Modify: `src/app/api/auditoria/route.ts:86-100` (handler `DELETE`)

**Depends-on:** Task 1

**Interfaces:**
- Consumes: `prisma.presencaVisita`; `VISITA_ABERTA_ATE_MS`, `statusDoSinal` de `@/lib/presenca`; `requireApi` de `@/lib/api-auth` (devolve `{ ok: true, user: { id, email, nome, role }, session }` ou `{ ok: false, response }`); `extractRequestMeta(req)` de `@/lib/audit` (devolve `{ ip, userAgent }`).
- Produces:
  - `POST /api/presenca` body `{ tela: string }` → `204`. `401/403` do gate.
  - `GET /api/presenca` → `{ online: VisitaOnline[] }` onde `VisitaOnline = { id, userId, inicio, ultimoSinal, tela, ip, userAgent, user: { name, email, role }, status: "online" | "ausente" }`.
  - `GET /api/presenca?inicio=<ISO>&fim=<ISO>` → `{ visitas: VisitaDia[] }` onde `VisitaDia = { ...mesmos campos, user, aberta: boolean }`, ordenadas por `inicio` desc, máximo 500. `400` se as datas forem inválidas.
  - `DELETE /api/auditoria?dias=N` passa a responder `{ apagados, visitasApagadas, dias }`.

- [ ] **Step 1: Rota nova**

Criar `src/app/api/presenca/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireApi } from "@/lib/api-auth";
import { extractRequestMeta } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { VISITA_ABERTA_ATE_MS, statusDoSinal } from "@/lib/presenca";

export const dynamic = "force-dynamic";

// pathname vem do navegador: limita o tamanho e exige forma de rota.
const MAX_TELA = 200;
const usuario = { select: { name: true, email: true, role: true } };

/** Sinal do navegador: atualiza a visita aberta do usuario ou abre uma nova. */
export async function POST(req: NextRequest) {
  const auth = await requireApi();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const tela =
    typeof body?.tela === "string" && body.tela.startsWith("/") ? body.tela.slice(0, MAX_TELA) : "/";
  const agora = new Date();
  const limite = new Date(agora.getTime() - VISITA_ABERTA_ATE_MS);

  const aberta = await prisma.presencaVisita.findFirst({
    where: { userId: auth.user.id, ultimoSinal: { gte: limite } },
    orderBy: { ultimoSinal: "desc" },
    select: { id: true },
  });

  if (aberta) {
    await prisma.presencaVisita.update({ where: { id: aberta.id }, data: { ultimoSinal: agora, tela } });
  } else {
    const { ip, userAgent } = extractRequestMeta(req);
    await prisma.presencaVisita.create({
      data: { userId: auth.user.id, inicio: agora, ultimoSinal: agora, tela, ip, userAgent },
    });
  }
  return new NextResponse(null, { status: 204 });
}

/**
 * Sem parametro: quem esta online agora (uma visita aberta por usuario).
 * Com inicio/fim em ISO: visitas que tocam o intervalo — o cliente calcula o
 * dia no fuso dele, porque o servidor da Vercel roda em UTC.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const inicioParam = searchParams.get("inicio");
  const fimParam = searchParams.get("fim");
  const limiteAberta = new Date(Date.now() - VISITA_ABERTA_ATE_MS);

  if (inicioParam && fimParam) {
    const inicio = new Date(inicioParam);
    const fim = new Date(fimParam);
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      return NextResponse.json({ error: "inicio/fim inválidos" }, { status: 400 });
    }
    const visitas = await prisma.presencaVisita.findMany({
      where: { inicio: { lte: fim }, ultimoSinal: { gte: inicio } },
      orderBy: { inicio: "desc" },
      take: 500,
      include: { user: usuario },
    });
    return NextResponse.json({
      visitas: visitas.map((v) => ({ ...v, aberta: v.ultimoSinal >= limiteAberta })),
    });
  }

  const online = await prisma.presencaVisita.findMany({
    where: { ultimoSinal: { gte: limiteAberta } },
    orderBy: { ultimoSinal: "desc" },
    include: { user: usuario },
  });
  return NextResponse.json({
    online: online.map((v) => ({ ...v, status: statusDoSinal(v.ultimoSinal) })),
  });
}
```

- [ ] **Step 2: Limpeza junto com os logs**

Em `src/app/api/auditoria/route.ts`, no `DELETE`, trocar

```ts
  const result = await prisma.auditLog.deleteMany({
    where: { timestamp: { lt: limite } },
  });

  return NextResponse.json({ apagados: result.count, dias });
```

por

```ts
  // Visitas de presenca envelhecem junto com os logs — mesma janela, mesmo botao.
  const [logs, visitas] = await Promise.all([
    prisma.auditLog.deleteMany({ where: { timestamp: { lt: limite } } }),
    prisma.presencaVisita.deleteMany({ where: { ultimoSinal: { lt: limite } } }),
  ]);

  return NextResponse.json({ apagados: logs.count, visitasApagadas: visitas.count, dias });
```

Nada mais nesse arquivo muda.

- [ ] **Step 3: Typecheck e lint**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint src/app/api/presenca/route.ts src/app/api/auditoria/route.ts
```

Esperado: a primeira linha não imprime nada (só os 6 erros de base existem); a segunda sem erro.

- [ ] **Step 4: Sondar sem sessão** (o dev já está rodando em `http://localhost:3000`; se não, `npm run dev`)

```bash
curl -s -w " %{http_code}\n" -X POST http://localhost:3000/api/presenca -H "Content-Type: application/json" -d '{"tela":"/entregas"}'
curl -s -w " %{http_code}\n" http://localhost:3000/api/presenca
curl -s -w " %{http_code}\n" "http://localhost:3000/api/presenca?inicio=x&fim=y"
```

Esperado: `{"error":"Não autorizado"} 401` nas três (o middleware barra antes do handler). A validação de datas (400) e o fluxo com sessão ficam para a Task 5, com login no navegador.

- [ ] **Step 5: Reportar** os dois arquivos tocados. Não commitar.

---

### Task 3: Beacon de presença no layout

**Files:**
- Create: `src/components/layout/PresencaBeacon.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

**Depends-on:** Task 1

**Interfaces:**
- Consumes: `INTERVALO_SINAL_MS` de `@/lib/presenca`; `POST /api/presenca` com body `{ tela: string }` (Task 2 — o beacon só precisa da forma, não do código).
- Produces: componente `PresencaBeacon` (client, sem UI) montado uma vez no layout do grupo `(dashboard)`.

- [ ] **Step 1: Componente**

Criar `src/components/layout/PresencaBeacon.tsx`:

```tsx
"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { INTERVALO_SINAL_MS } from "@/lib/presenca";

/**
 * Sinal de presenca: avisa /api/presenca qual tela esta aberta. Sem UI.
 *
 * Pinga ao montar, a cada troca de rota e a cada INTERVALO_SINAL_MS enquanto
 * a aba esta visivel; aba oculta nao pinga, e assim vira "ausente" e depois
 * encerra sozinha no servidor. Erro e silencioso: presenca nao pode
 * atrapalhar a navegacao.
 */
export function PresencaBeacon() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;

  // CLIENTE nao e rastreado — e o middleware nega /api/* fora do portal para ele.
  const ativo = !!role && role !== "CLIENTE";

  useEffect(() => {
    if (!ativo || !pathname) return;

    const sinal = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presenca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tela: pathname }),
        keepalive: true,
      }).catch(() => {});
    };

    sinal();
    const timer = setInterval(sinal, INTERVALO_SINAL_MS);
    document.addEventListener("visibilitychange", sinal);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", sinal);
    };
  }, [ativo, pathname]);

  return null;
}
```

- [ ] **Step 2: Montar no layout**

Em `src/app/(dashboard)/layout.tsx`, adicionar o import ao lado do da `Sidebar`:

```ts
import { PresencaBeacon } from "@/components/layout/PresencaBeacon";
```

e, no JSX, colocar `<PresencaBeacon />` logo antes de `<Sidebar />`:

```tsx
    <div className="flex h-screen w-full overflow-hidden" style={{ background: "var(--bg)" }}>
      <PresencaBeacon />
      <Sidebar />
```

- [ ] **Step 3: Typecheck e lint**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint src/components/layout/PresencaBeacon.tsx "src/app/(dashboard)/layout.tsx"
```

Esperado: nada na primeira; sem erro na segunda.

- [ ] **Step 4: Sondar que o layout ainda serve**

```bash
curl -s -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3000/dashboard
```

Esperado: `307 -> http://localhost:3000/api/auth/signin?callbackUrl=%2Fdashboard` (sem sessão redireciona; o que importa é não dar 500). Conferir no log do dev que não há erro de compilação.

- [ ] **Step 5: Reportar** os dois arquivos tocados. Não commitar.

---

### Task 4: Painel "Presença" na Auditoria

**Files:**
- Create: `src/components/auditoria/PresencaPanel.tsx`
- Modify: `src/app/(dashboard)/auditoria/page.tsx:4-5` (imports) e `:168-178` (acima dos KPIs)

**Depends-on:** Task 1

**Interfaces:**
- Consumes: `StatusPresenca` de `@/lib/presenca`; `navGroups` de `@/components/layout/nav-items` (cada item tem `href`, `label`); `Card`, `Button`, `Input`, `Empty` de `@/components/ui`; e a forma de `GET /api/presenca` da Task 2:
  - sem parâmetro → `{ online: Visita[] }` com `status: "online" | "ausente"`;
  - `?inicio=<ISO>&fim=<ISO>` → `{ visitas: Visita[] }` com `aberta: boolean`.
- Produces: componente `PresencaPanel` (client), sem props.

- [ ] **Step 1: Componente**

Criar `src/components/auditoria/PresencaPanel.tsx`:

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty, Input } from "@/components/ui";
import { navGroups } from "@/components/layout/nav-items";
import type { StatusPresenca } from "@/lib/presenca";
import { RefreshCw, Users } from "lucide-react";

interface Visita {
  id: string;
  inicio: string;
  ultimoSinal: string;
  tela: string;
  user: { name: string | null; email: string | null; role: string };
  status?: StatusPresenca; // so no retrato de agora
  aberta?: boolean;        // so no historico
}

type Aba = "agora" | "historico";

const ITENS_MENU = navGroups.flatMap((g) => g.items);

/** "/entregas/abc" -> "Entregas". Vence o href mais longo que casa; sem item, mostra o pathname. */
function rotuloDaTela(pathname: string): string {
  const casa = ITENS_MENU.filter((i) =>
    i.href === "/dashboard" ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/")
  );
  const melhor = casa.sort((a, b) => b.href.length - a.href.length)[0];
  return melhor?.label || pathname;
}

function haQuanto(iso: string, agora: number): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
}

function duracao(inicioIso: string, fimIso: string): string {
  const m = Math.max(1, Math.round((new Date(fimIso).getTime() - new Date(inicioIso).getTime()) / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** YYYY-MM-DD no fuso do navegador (o input type="date" trabalha assim). */
function diaLocal(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function PresencaPanel() {
  const [aba, setAba] = useState<Aba>("agora");
  const [online, setOnline] = useState<Visita[] | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [dia, setDia] = useState(diaLocal());
  const [visitas, setVisitas] = useState<Visita[] | null>(null);

  const carregarOnline = useCallback(async () => {
    const res = await fetch("/api/presenca");
    if (!res.ok) return;
    setOnline((await res.json()).online);
    setAgora(Date.now());
  }, []);

  const carregarDia = useCallback(async () => {
    // Limites do dia no fuso do navegador — o servidor roda em UTC e nao sabe onde o dia comeca.
    const inicio = new Date(`${dia}T00:00:00`).toISOString();
    const fim = new Date(`${dia}T23:59:59.999`).toISOString();
    const res = await fetch(`/api/presenca?inicio=${inicio}&fim=${fim}`);
    if (res.ok) setVisitas((await res.json()).visitas);
  }, [dia]);

  useEffect(() => {
    carregarOnline();
    const timer = setInterval(carregarOnline, 30_000);
    return () => clearInterval(timer);
  }, [carregarOnline]);

  useEffect(() => {
    if (aba === "historico") carregarDia();
  }, [aba, carregarDia]);

  const nOnline = online?.filter((v) => v.status === "online").length ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: "var(--accent)" }} />
          <h3 className="font-head text-[14px] font-bold">Presença</h3>
          <span
            className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "rgba(16,185,129,.12)", color: "#34d399", border: "1px solid rgba(16,185,129,.25)" }}
          >
            {nOnline} ONLINE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <AbaBtn ativa={aba === "agora"} onClick={() => setAba("agora")}>Agora</AbaBtn>
          <AbaBtn ativa={aba === "historico"} onClick={() => setAba("historico")}>Histórico</AbaBtn>
          <Button variant="ghost" size="sm" onClick={aba === "agora" ? carregarOnline : carregarDia} title="Atualizar">
            <RefreshCw size={14} />
          </Button>
        </div>
      </div>

      {aba === "agora" ? (
        <ListaAgora online={online} agora={agora} />
      ) : (
        <ListaHistorico dia={dia} onDia={setDia} visitas={visitas} />
      )}
    </Card>
  );
}

function AbaBtn({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1 rounded-lg text-xs font-semibold transition-colors"
      style={
        ativa
          ? { background: "rgba(249,115,22,.12)", color: "var(--accent)", border: "1px solid rgba(249,115,22,.32)" }
          : { color: "var(--text2)", border: "1px solid transparent" }
      }
    >
      {children}
    </button>
  );
}

function Avatar({ nome }: { nome: string | null }) {
  return (
    <div
      className="w-8 h-8 min-w-[32px] rounded-full flex items-center justify-center font-head text-[12px] font-black text-white"
      style={{ background: "linear-gradient(140deg,#f97316,#c2410c)" }}
    >
      {nome?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function ListaAgora({ online, agora }: { online: Visita[] | null; agora: number }) {
  if (!online) return <p className="text-xs" style={{ color: "var(--text3)" }}>Carregando…</p>;
  if (online.length === 0) return <Empty icon="🌙" text="Ninguém online agora" />;
  return (
    <div>
      {online.map((v) => {
        const isOnline = v.status === "online";
        return (
          <div key={v.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
            <Avatar nome={v.user.name} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{v.user.name || v.user.email || "—"}</span>
                <span className={`badge badge-${v.user.role}`}>{v.user.role}</span>
              </div>
              <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
                {rotuloDaTela(v.tela)} <span style={{ color: "var(--text3)" }}>· {v.tela}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs whitespace-nowrap" style={{ color: "var(--text3)" }}>
              <span>{haQuanto(v.ultimoSinal, agora)}</span>
              <span
                className="w-2 h-2 rounded-full"
                title={isOnline ? "Online" : "Ausente"}
                style={{ background: isOnline ? "#34d399" : "#fbbf24", boxShadow: `0 0 8px ${isOnline ? "#34d399" : "#fbbf24"}` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListaHistorico({ dia, onDia, visitas }: { dia: string; onDia: (d: string) => void; visitas: Visita[] | null }) {
  return (
    <div className="space-y-3">
      <div className="w-44">
        <Input type="date" label="Dia" value={dia} onChange={(e) => onDia(e.target.value)} />
      </div>
      {!visitas ? (
        <p className="text-xs" style={{ color: "var(--text3)" }}>Carregando…</p>
      ) : visitas.length === 0 ? (
        <Empty icon="📅" text="Nenhuma visita nesse dia" />
      ) : (
        <div>
          {visitas.map((v) => (
            <div key={v.id} className="flex items-center gap-3 py-2.5 border-b last:border-b-0" style={{ borderColor: "var(--border)" }}>
              <Avatar nome={v.user.name} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold truncate">{v.user.name || v.user.email || "—"}</span>
                  <span className={`badge badge-${v.user.role}`}>{v.user.role}</span>
                </div>
                <div className="text-xs truncate" style={{ color: "var(--text2)" }}>
                  Última tela: {rotuloDaTela(v.tela)}
                </div>
              </div>
              <div className="text-right text-xs whitespace-nowrap font-mono" style={{ color: "var(--text3)" }}>
                <div>
                  {hora(v.inicio)} → {v.aberta ? <span style={{ color: "#34d399" }}>em aberto</span> : hora(v.ultimoSinal)}
                </div>
                <div>{duracao(v.inicio, v.ultimoSinal)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Montar na página**

Em `src/app/(dashboard)/auditoria/page.tsx`, junto dos imports (linhas 4-5), adicionar:

```ts
import { PresencaPanel } from "@/components/auditoria/PresencaPanel";
```

E dentro do `<div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4">` (linha 168), **antes** do bloco `{/* KPIs */}`, inserir:

```tsx
        <PresencaPanel />
```

Nada mais nessa página muda.

- [ ] **Step 3: Typecheck, lint e tamanho**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint src/components/auditoria/PresencaPanel.tsx "src/app/(dashboard)/auditoria/page.tsx"
wc -l src/components/auditoria/PresencaPanel.tsx
```

Esperado: nada na primeira; sem erro na segunda (a página de auditoria já está na baseline de `max-lines`, e o painel novo fica bem abaixo de 350).

- [ ] **Step 4: Sondar a página**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/auditoria
```

Esperado: `307` (redireciona sem sessão) e nenhum erro de compilação no log do dev.

- [ ] **Step 5: Reportar** os dois arquivos tocados. Não commitar.

---

### Task 5: Verificação integrada (controlador)

**Files:** nenhum.

**Depends-on:** Task 2, Task 3, Task 4

- [ ] **Step 1: Gates do projeto**

```bash
npm run lint:quality 2>&1 | tail -3        # 0 errors
npx tsc --noEmit 2>&1 | grep -c "error TS" # 6
```

- [ ] **Step 2: Fluxo real no localhost**

1. Logar como ADMIN num navegador e como outro usuário interno noutro (ou aba anônima).
2. No ADMIN, abrir `/auditoria`: o painel "Presença" lista os dois, com tela e "há N s"; badge "2 ONLINE".
3. No segundo usuário, ir para `/entregas`; em até 30 s a linha dele muda para "Entregas".
4. Fechar a aba do segundo usuário: em ~2 min a bolinha fica âmbar ("Ausente"); em ~5 min ele some.
5. Aba **Histórico** com o dia de hoje: as visitas aparecem com início, fim (ou "em aberto") e duração.
6. Logar com um CLIENTE aprovado: nenhuma chamada a `/api/presenca` no Network do navegador.

- [ ] **Step 3: Confirmar no banco** (opcional)

```bash
npx prisma studio   # ou: consulta direta em PresencaVisita
```

Uma linha por usuário/visita, `tela` com o último pathname.
