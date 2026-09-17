#!/usr/bin/env node
/**
 * `npm audit` com triagem por alcancabilidade.
 *
 * Um audit cru reprova por advisory que este app nao alcanca — xlsx que so
 * escreve, Image Optimizer que nao existe aqui. CI vermelho de nascenca
 * ensina todo mundo a ignorar o CI, entao o gate le scripts/audit-excecoes.json
 * e so reprova critica ou alta que NAO esteja triada ali.
 *
 * Tambem avisa quando uma excecao para de valer: pacote que saiu do audit fica
 * na lista atoa e vira ponto cego.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const BLOQUEIA = new Set(["critical", "high"]);

function auditar() {
  try {
    // `npm audit` sai com codigo != 0 quando acha algo; a saida em JSON vem
    // pelo stdout do mesmo jeito, entao o erro traz o que interessa.
    const out = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch (e) {
    if (e.stdout) return JSON.parse(e.stdout);
    throw e;
  }
}

const relatorio = auditar();
const { excecoes } = JSON.parse(
  readFileSync(join(AQUI, "audit-excecoes.json"), "utf8")
);
const triados = new Map(excecoes.map((x) => [x.pacote, x]));

const vulns = Object.entries(relatorio.vulnerabilities || {});
const naoTriados = [];
const aceitos = [];

for (const [pacote, v] of vulns) {
  if (!BLOQUEIA.has(v.severity)) continue;
  if (triados.has(pacote)) aceitos.push([pacote, v.severity]);
  else naoTriados.push([pacote, v.severity, v.range]);
}

const vistos = new Set(vulns.map(([p]) => p));
const orfas = excecoes.filter((x) => !vistos.has(x.pacote));

for (const [pacote, sev] of aceitos) {
  console.log(`  triado    ${sev.padEnd(8)} ${pacote} — ${triados.get(pacote).motivo.slice(0, 90)}...`);
}
for (const x of orfas) {
  console.log(`  OBSOLETA  excecao de ${x.pacote} nao aparece mais no audit — remover de audit-excecoes.json`);
}

if (naoTriados.length === 0) {
  console.log(`\nOK: nenhuma critica ou alta fora da triagem (${aceitos.length} triada(s)).`);
  process.exit(0);
}

console.error(`\nREPROVADO: ${naoTriados.length} advisory(s) de critica/alta sem triagem:\n`);
for (const [pacote, sev, range] of naoTriados) {
  console.error(`  ${sev.padEnd(8)} ${pacote}  (faixa vulneravel: ${range})`);
}
console.error(
  "\nCorrija a dependencia, ou — se o vetor nao existir neste app — registre o" +
    "\nmotivo em scripts/audit-excecoes.json com o comando que comprova."
);
process.exit(1);
