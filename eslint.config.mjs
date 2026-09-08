// Quality gates do vibe-coding-toolkit (docs/vibe-coding-toolkit/tools/06),
// adaptados a este projeto. Este arquivo NAO participa do build: o
// next.config.js ja tem `eslint.ignoreDuringBuilds: true`, entao rodar ou nao
// rodar o lint nunca derruba o deploy da Vercel. Use `npm run lint:quality`.
//
// O que foi mudado em relacao ao template original, e por que:
//
//   - Sem `eslint-plugin-import-x` / `eslint-import-resolver-typescript`: o
//     resolver conflita com peer deps na arvore atual, e a Vercel roda
//     `npm install` no build — uma arvore que nao resolve quebraria o deploy.
//     As regras que viriam dele (no-unresolved, no-duplicates) sao acessorias.
//   - `tseslint.configs.recommended` no lugar de `strict`: strict acusa
//     centenas de itens em codigo que ja esta em producao. Promova quando a
//     contagem do recommended chegar a zero.
//   - `quality/no-direct-data-access` escopado a src/components: os .tsx de
//     src/app/imprimir sao server components e acessam o Prisma direto de
//     forma legitima no App Router. A fronteira real e o componente cliente.
//   - `quality/max-lines` com baseline: erro para arquivo novo, silencio para
//     os 32 que ja passavam do teto. Medir e consertar sao trabalhos separados
//     (ver docs/vibe-coding-toolkit/prompts/09-file-size-refactor.md).
//   - Regras com divida pre-existente rebaixadas a "warn" (bloco DIVIDA
//     MEDIDA abaixo). Um portao que nasce com 1151 erros nao e portao, e
//     ruido que todo mundo aprende a ignorar. Hoje o lint fecha com ZERO
//     erro: qualquer erro dali pra frente e regressao introduzida agora. A
//     queima dos avisos e trabalho separado, um lote por vez (ver
//     docs/vibe-coding-toolkit/prompts/02-eslint-warning-burndown.md).
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

import quality from "./eslint-rules/index.cjs";

// Divida esta lista, nao a aumente. Um arquivo so entra aqui se ja passava do
// teto antes do gate existir; arquivo novo acima de 350 linhas e erro.
// As regras de hooks do React entram como aviso: o codebase ja tem
// comentarios `eslint-disable react-hooks/exhaustive-deps` que assumiam este
// plugin registrado, e sem ele o ESLint reprova o proprio comentario.
const REACT_HOOKS_AS_WARN = Object.fromEntries(
  Object.keys(reactHooks.configs["recommended-latest"].rules ?? {}).map(
    (rule) => [rule, "warn"]
  )
);

const MAX_LINES_BASELINE = [
  "src/app/(dashboard)/agendamentos/page.tsx",
  "src/app/(dashboard)/auditoria/page.tsx",
  "src/app/(dashboard)/avarias/[id]/page.tsx",
  "src/app/(dashboard)/avarias/page.tsx",
  "src/app/(dashboard)/canhotos/page.tsx",
  "src/app/(dashboard)/configuracoes/normas/page.tsx",
  "src/app/(dashboard)/configuracoes/page.tsx",
  "src/app/(dashboard)/entregas/[id]/page.tsx",
  "src/app/(dashboard)/entregas/page.tsx",
  "src/app/(dashboard)/faturamento/page.tsx",
  "src/app/(dashboard)/financeiro/AcertoMotoristasTab.tsx",
  "src/app/(dashboard)/financeiro/ConciliacaoTab.tsx",
  "src/app/(dashboard)/financeiro/LancamentosTab.tsx",
  "src/app/(dashboard)/importacao/CteTab.tsx",
  "src/app/(dashboard)/importacao/NfseTab.tsx",
  "src/app/(dashboard)/importacao/page.tsx",
  "src/app/(dashboard)/kanban/page.tsx",
  "src/app/(dashboard)/paletes/page.tsx",
  "src/app/(dashboard)/planejador-rotas/page.tsx",
  "src/app/(dashboard)/produtos/page.tsx",
  "src/app/(dashboard)/relatorios/page.tsx",
  "src/app/(dashboard)/rotas/[id]/page.tsx",
  "src/app/(dashboard)/rotas/page.tsx",
  "src/app/api/entregas/[id]/route.ts",
  "src/app/api/entregas/route.ts",
  "src/app/api/financeiro/route.ts",
  "src/app/imprimir/acerto-motorista/page.tsx",
  "src/app/imprimir/carta-frete/[tipo]/[id]/page.tsx",
  "src/app/portal/page.tsx",
  "src/components/danfe/DanfeViewer.tsx",
  "src/components/entrega/TicketModal.tsx",
  "src/lib/danfe-parser.ts",
];

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { quality, "react-hooks": reactHooks },
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // O TypeScript ja reprova identificador nao declarado, com o alvo certo
      // (sabe o que e global no server e no browser). Manter no-undef aqui so
      // produziria falso positivo em cada `window`, `process` e `fetch`.
      "no-undef": "off",

      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-var": "error",

      // --- DIVIDA MEDIDA -------------------------------------------------
      // Contagem no dia da instalacao, sobre codigo que ja esta em producao.
      // Promova cada uma a "error" quando a contagem dela chegar a zero, na
      // ordem abaixo (da mais barata pra mais cara):
      //   prefer-const ................ 2
      //   no-unused-expressions ....... 2
      //   no-useless-assignment ...... 11
      //   no-unused-vars ............. 117
      //   no-explicit-any ........... 1017
      "prefer-const": "warn",
      "no-useless-assignment": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      ...REACT_HOOKS_AS_WARN,
      // --- fim da divida medida ------------------------------------------

      // Orcamento de tamanho e complexidade. Tudo "warn" de proposito: e
      // material pra conversa sobre fatoracao, nao portao. Promova um deles a
      // "error" quando a contagem dele chegar a zero.
      complexity: ["warn", 12],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "max-params": ["warn", 4],
      "max-lines-per-function": [
        "warn",
        { max: 150, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["warn", 3],

      "quality/max-lines": ["error", { max: 350, ignore: MAX_LINES_BASELINE }],
    },
  },

  {
    // console em rota de API e em src/lib e log de servidor legitimo, e este
    // projeto ainda nao tem um helper de log pra apontar como alternativa.
    // No codigo que roda no browser, console esquecido vaza pro usuario — e la
    // que a regra vale hoje. Quando existir um logger, amplie o escopo.
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}"],
    plugins: { quality },
    rules: {
      "quality/no-direct-console": [
        "warn",
        { logger: "um helper de log do projeto", allow: ["error"] },
      ],
      "quality/no-direct-data-access": [
        "error",
        {
          modules: ["@/lib/prisma"],
          bindings: ["prisma"],
          layers: ["/src/components/", "/src/hooks/"],
        },
      ],
    },
  },

  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { module: "readonly", require: "readonly" },
    },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },

  globalIgnores([
    ".next/**",
    ".vercel/**",
    "node_modules/**",
    "public/**",
    "prisma/**",
    "**/*.tsbuildinfo",
    "next-env.d.ts",
  ]),
]);
