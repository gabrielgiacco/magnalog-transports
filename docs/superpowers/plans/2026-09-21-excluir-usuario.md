# Excluir usuário — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADMIN exclui um usuário pela tela de Usuários; ele some, o e-mail fica livre, não entra mais; quem tem histórico obrigatório é recusado com orientação para desativar.

**Architecture:** `DELETE /api/usuarios?id=` com pré-checagem por `_count` das quatro relações obrigatórias e `prisma.user.delete` (cascades já declarados); guarda por `id` no callback `jwt` para o e-mail reaproveitado não herdar o token antigo; botão + modal na página existente.

**Tech Stack:** Next.js 14 App Router · Prisma 5 · NextAuth (JWT) · React 18.

Spec: `docs/superpowers/specs/2026-09-21-excluir-usuario-design.md`.

## Global Constraints

- Comentários em português; commits em português **sem acento**.
- Imports por alias `@/*`. Prisma só via `@/lib/prisma`; nunca em `src/components/`.
- `npm run lint:quality` com **0 erros**; `npx tsc --noEmit` com os **6 erros pré-existentes** (`ContasPagarTab.tsx`, `faturamento/transportadora/[id]/export/route.ts`).
- Sem suíte de testes: verificação por `tsc`, `eslint` no arquivo e `curl`.
- **Implementador não commita.** Deixa no working tree e reporta os arquivos tocados.
- Sem mudança de schema.
- Mudança cirúrgica: não reformatar código vizinho.

## Ondas

| Onda | Tarefas | Por quê |
|---|---|---|
| 1 | Task 1, Task 2, Task 3 em paralelo | Arquivos disjuntos. A Task 3 consome só a **forma** da API da Task 1 (bloco Interfaces). |
| 2 | Task 4 | Verificação integrada (controlador + dono). |

---

### Task 1: API — `DELETE` e e-mail duplicado no `POST`

**Files:**
- Modify: `src/app/api/usuarios/route.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: `requireApi(papeis?)` de `@/lib/api-auth` → `{ ok: true, user: { id, email, nome, role }, session }` ou `{ ok: false, response }`; `logAudit(input)` e `extractRequestMeta(req)` de `@/lib/audit`; relações `avariasRegistradas`, `orcamentos`, `declaracoesSaida`, `qualidadeRegistrada` no model `User`; enum `TipoEventoAuditoria.USUARIO_APAGADO`.
- Produces:
  - `DELETE /api/usuarios?id=<id>` → `200 { ok: true }`; `400 { error }` (sem id / a si mesmo); `404 { error }`; `409 { error, travas: string[] }` (histórico); `401/403` do gate.
  - `POST /api/usuarios` → `409 { error: "E-mail já cadastrado" | "E-mail já cadastrado em um usuário inativo — exclua-o ou reative-o" }` quando o e-mail existe; `400 { error: "E-mail obrigatório" }` quando vazio. Resto igual.

- [ ] **Step 1: Import**

Na linha 3 (após `import { prisma } from "@/lib/prisma";`) adicionar:

```ts
import { logAudit, extractRequestMeta } from "@/lib/audit";
```

- [ ] **Step 2: E-mail duplicado no `POST`**

Trocar

```ts
  const body = await req.json();
  const hash = await bcrypt.hash(body.password || "Magnalog@2025", BCRYPT_ROUNDS);

  const novo = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
```

por

```ts
  const body = await req.json();
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "E-mail obrigatório" }, { status: 400 });

  // Inativo ainda segura o e-mail (unique): avisar em vez de estourar com 500.
  const existente = await prisma.user.findUnique({ where: { email }, select: { ativo: true } });
  if (existente) {
    return NextResponse.json(
      { error: existente.ativo ? "E-mail já cadastrado" : "E-mail já cadastrado em um usuário inativo — exclua-o ou reative-o" },
      { status: 409 },
    );
  }

  const hash = await bcrypt.hash(body.password || "Magnalog@2025", BCRYPT_ROUNDS);

  const novo = await prisma.user.create({
    data: {
      name: body.name,
      email,
```

- [ ] **Step 3: `DELETE`**

No fim do arquivo, adicionar:

```ts
// Relacoes obrigatorias: apagar o usuario levaria o historico junto (ou
// falharia no banco). Quem tem qualquer uma delas so pode ser desativado.
const TRAVAS = {
  avariasRegistradas: "avaria(s) registrada(s)",
  orcamentos: "orçamento(s) criado(s)",
  declaracoesSaida: "declaração(ões) de saída emitida(s)",
  qualidadeRegistrada: "avaliação(ões) de qualidade",
} as const;

const HISTORICO_MSG = "Desative em vez de excluir.";

export async function DELETE(req: NextRequest) {
  const auth = await requireApi(["ADMIN"]);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  // O solicitante e um ADMIN ativo e nao pode ser o alvo — por isso nunca
  // sobra zero ADMIN, sem precisar de checagem extra.
  if (id === auth.user.id) return NextResponse.json({ error: "Você não pode excluir a si mesmo" }, { status: 400 });

  const alvo = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, role: true,
      _count: { select: { avariasRegistradas: true, orcamentos: true, declaracoesSaida: true, qualidadeRegistrada: true } },
    },
  });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const travas = (Object.keys(TRAVAS) as (keyof typeof TRAVAS)[])
    .filter((k) => alvo._count[k] > 0)
    .map((k) => `${alvo._count[k]} ${TRAVAS[k]}`);
  if (travas.length) {
    return NextResponse.json(
      { error: `Usuário tem histórico (${travas.join(", ")}). ${HISTORICO_MSG}`, travas },
      { status: 409 },
    );
  }

  try {
    await prisma.user.delete({ where: { id } });
  } catch (e: any) {
    // P2003 = chave estrangeira segurando: alguma relacao obrigatoria fora da lista acima.
    if (e?.code === "P2003") {
      return NextResponse.json({ error: `Usuário tem histórico vinculado. ${HISTORICO_MSG}`, travas: [] }, { status: 409 });
    }
    throw e;
  }

  const { ip, userAgent } = extractRequestMeta(req);
  await logAudit({
    tipo: "USUARIO_APAGADO",
    user: { id: auth.user.id, email: auth.user.email, name: auth.user.nome, role: auth.user.role },
    recursoTipo: "usuario",
    recursoId: alvo.id,
    recursoDesc: `${alvo.name || "—"} <${alvo.email || "—"}>`,
    metodo: "DELETE",
    rota: "/api/usuarios",
    ip,
    userAgent,
    detalhes: { role: alvo.role },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint src/app/api/usuarios/route.ts
curl -s -w " %{http_code}\n" -X DELETE "http://localhost:3000/api/usuarios?id=x"
curl -s -w " %{http_code}\n" -X POST http://localhost:3000/api/usuarios -H "Content-Type: application/json" -d '{"name":"x","email":"x@x"}'
```

Esperado: nada na primeira; sem erro na segunda; `401` nas duas sondas (o middleware barra antes do handler).

- [ ] **Step 5: Reportar** o arquivo tocado. Não commitar.

---

### Task 2: Sessão — token do excluído não vale para a conta nova

**Files:**
- Modify: `src/lib/authOptions.ts` (callback `jwt`, ~linhas 89-104)

**Depends-on:** none

**Interfaces:**
- Consumes: `token.userId` (já gravado pelo próprio callback), `token.email`.
- Produces: nada novo; comportamento: token cujo `userId` difere do usuário achado por e-mail vira `ativo = false`.

- [ ] **Step 1: Guarda por id**

Trocar

```ts
      const dbUser = await prisma.user.findUnique({ where: { email: token.email! } });
      if (dbUser) {
```

por

```ts
      const dbUser = await prisma.user.findUnique({ where: { email: token.email! } });
      // O e-mail pode ser reaproveitado depois de uma exclusao: o token do
      // usuario antigo nao pode virar sessao da conta nova. Sem userId ainda
      // (primeira passagem apos o login) aceita; depois, so o mesmo id.
      if (dbUser && (!token.userId || token.userId === dbUser.id)) {
```

O bloco `else` existente (`token.ativo = false`) passa a cobrir também esse caso — não mexer nele.

- [ ] **Step 2: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint src/lib/authOptions.ts
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
```

Esperado: nada; sem erro; `200`.

- [ ] **Step 3: Reportar** o arquivo tocado. Não commitar.

---

### Task 3: Tela — botão Excluir, modal e mensagens da API

**Files:**
- Modify: `src/app/(dashboard)/usuarios/page.tsx`

**Depends-on:** none (consome só a forma da API da Task 1)

**Interfaces:**
- Consumes: `DELETE /api/usuarios?id=<id>` → `200 { ok }` | `409 { error, travas }` | `400/404 { error }`; `POST /api/usuarios` → `409 { error }`.
- Produces: UI.

- [ ] **Step 1: Import do ícone**

Trocar `import { Plus, Edit2, Shield, UserCheck, UserX } from "lucide-react";` por

```ts
import { Plus, Edit2, Shield, UserCheck, UserX, Trash2 } from "lucide-react";
```

- [ ] **Step 2: Estado**

Após `const [saving, setSaving] = useState(false);` adicionar:

```ts
  const [excluindo, setExcluindo] = useState<any>(null);   // usuario aguardando confirmacao
  const [bloqueio, setBloqueio] = useState<string | null>(null); // 409: historico segura a exclusao
```

- [ ] **Step 3: Mensagem do POST no toast**

Em `handleSave`, no ramo `else` (POST), trocar `if (!res.ok) throw new Error();` por

```ts
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
```

e o `catch { toast.error("Erro ao salvar"); }` por

```ts
    } catch (e: any) { toast.error(e?.message || "Erro ao salvar"); }
```

- [ ] **Step 4: Handlers**

Após `toggleAtivo`, adicionar:

```ts
  function openExcluir(u: any) {
    setBloqueio(null);
    setExcluindo(u);
  }

  async function handleExcluir() {
    if (!excluindo) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/usuarios?id=${encodeURIComponent(excluindo.id)}`, { method: "DELETE" });
      const r = await res.json().catch(() => ({}));
      if (res.status === 409) { setBloqueio(r.error || "Usuário tem histórico. Desative em vez de excluir."); return; }
      if (!res.ok) throw new Error(r.error);
      toast.success("Usuário excluído");
      setExcluindo(null);
      fetch_();
    } catch (e: any) { toast.error(e?.message || "Erro ao excluir"); }
    finally { setSaving(false); }
  }

  async function desativarEmVez() {
    if (excluindo?.ativo) await toggleAtivo(excluindo);
    toast.success("Usuário desativado");
    setExcluindo(null);
  }
```

- [ ] **Step 5: Botão na linha**

Trocar a célula de ações

```tsx
                    <Td>
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg transition-all hover:opacity-70"
                        style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                        <Edit2 size={13} />
                      </button>
                    </Td>
```

por

```tsx
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(u)} title="Editar" className="p-1.5 rounded-lg transition-all hover:opacity-70"
                          style={{ background: "var(--surface2)", color: "var(--text2)" }}>
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => openExcluir(u)} title="Excluir" className="p-1.5 rounded-lg transition-all hover:opacity-70"
                          style={{ background: "rgba(255,77,79,.1)", color: "#f87171" }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </Td>
```

- [ ] **Step 6: Modal de confirmação**

Logo antes do `</>` final (após o `</Modal>` de edição), adicionar:

```tsx
      <Modal open={!!excluindo} onClose={() => setExcluindo(null)} title="Excluir usuário" size="sm">
        {bloqueio ? (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text2)" }}>{bloqueio}</p>
            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setExcluindo(null)}>Fechar</Button>
              {excluindo?.ativo && <Button onClick={desativarEmVez}>Desativar em vez disso</Button>}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text2)" }}>
              Excluir <b>{excluindo?.name || excluindo?.email}</b>? Ele some da lista, o e-mail fica livre e ele não entra mais.
              Isso não pode ser desfeito.
            </p>
            <div className="flex justify-end gap-3 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
              <Button variant="ghost" onClick={() => setExcluindo(null)}>Cancelar</Button>
              <Button variant="danger" onClick={handleExcluir} loading={saving}>Excluir</Button>
            </div>
          </div>
        )}
      </Modal>
```

- [ ] **Step 7: Verificar**

```bash
npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "ContasPagarTab\|transportadora/\[id\]/export"
npx eslint "src/app/(dashboard)/usuarios/page.tsx"
wc -l "src/app/(dashboard)/usuarios/page.tsx"
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/usuarios
```

Esperado: nada; sem erro; < 350; `307`.

- [ ] **Step 8: Reportar** o arquivo tocado. Não commitar.

---

### Task 4: Verificação integrada (controlador + dono)

**Depends-on:** Task 1, Task 2, Task 3

- [ ] `npm run lint:quality` (0 erros) e `npx tsc --noEmit` (6).
- [ ] No localhost como ADMIN: criar usuário de teste → excluir → some → criar de novo com o mesmo e-mail → ok. Excluir usuário com avaria/orçamento → modal com contagem e "Desativar em vez disso". Excluir a si mesmo → toast de recusa. Cadastrar e-mail de inativo → toast "já cadastrado em um usuário inativo".
- [ ] Auditoria lista `USUARIO_APAGADO` com o nome do excluído.
