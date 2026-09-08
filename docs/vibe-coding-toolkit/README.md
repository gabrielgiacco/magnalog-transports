# vibe-coding-toolkit — cópia de referência

Cópia da pasta `docs/` do
[vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit)
de Matheus Gomes, tirada do commit `13add21` em 8 de setembro de 2026.
Licença MIT, preservada em `LICENSE` nesta mesma pasta.

É material de **leitura**: nada aqui é executado pelo projeto. O que foi de
fato instalado a partir daqui:

- `CLAUDE.md` na raiz — a partir de `templates/CLAUDE.md.template`, preenchido
  com a stack, os comandos e o vocabulário reais deste projeto.
- `.claude/rules/parallel-subagent-driven-development.md` — cópia literal da
  regra de despacho de subagentes em ondas paralelas.
- `eslint.config.mjs` + `eslint-rules/` — os quality gates, adaptados. As
  adaptações e o motivo de cada uma estão comentados no topo do
  `eslint.config.mjs`.

Não foi instalado: os plugins de terceiros (Ponytail, Caveman, aia-harness,
Graphify, agent-browser) descritos em `01-installation.md` e em `tools/`. Os
comandos `/plugin` correspondentes precisam ser digitados na sessão.

Os prompts em `prompts/` são feitos para colar num agente. Os dois mais
imediatamente úteis aqui:

- `prompts/02-eslint-warning-burndown.md` — queimar os ~1625 avisos em lotes.
- `prompts/09-file-size-refactor.md` — quebrar os 32 arquivos que já passavam
  do teto de 350 linhas (a baseline no `eslint.config.mjs`).
