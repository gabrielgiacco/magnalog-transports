/**
 * Paletes por NF e divisao de uma carga em veiculos. Puro — roda no client
 * (aba Paletizacao da entrega) a partir das notas que a API da entrega ja
 * devolve com `produtos[].norma`.
 *
 * Cada NF e paletizada separada: a ponta de uma NF nao se junta com a de
 * outra, porque NFs podem ir em veiculos diferentes. Por isso a soma por NF
 * pode dar um pouco mais que o total agregado da aba.
 */

export interface NotaParaPaletes {
  id: string;
  numero: string;
  pesoBruto?: number | null;
  volumes?: number | null;
  produtos?: { quantidade?: number | null; norma?: { quantidadeCaixasPalete?: number | null } | null }[];
}

export interface PaletesDaNF {
  notaId: string;
  numero: string;
  inteiros: number;
  pontas: number;
  paletes: number;
  caixas: number;
  pesoKg: number;
  volumes: number;
  itensSemNorma: number;
}

export interface Veiculo {
  nfs: PaletesDaNF[];
  paletes: number;
  pesoKg: number;
  volumes: number;
}

export function paletesPorNF(notas: NotaParaPaletes[]): PaletesDaNF[] {
  return notas.map((nf) => {
    let inteiros = 0;
    let pontas = 0;
    let caixas = 0;
    let itensSemNorma = 0;
    for (const p of nf.produtos || []) {
      const qtd = p.quantidade || 0;
      caixas += qtd;
      const porPalete = p.norma?.quantidadeCaixasPalete;
      if (!porPalete) {
        itensSemNorma++;
        continue;
      }
      inteiros += Math.floor(qtd / porPalete);
      if (qtd % porPalete > 0) pontas++;
    }
    return {
      notaId: nf.id,
      numero: nf.numero,
      inteiros,
      pontas,
      paletes: inteiros + pontas,
      caixas,
      pesoKg: nf.pesoBruto || 0,
      volumes: nf.volumes || 0,
      itensSemNorma,
    };
  });
}

/**
 * Distribui as NFs em `quantidade` veiculos equilibrando paletes: maior NF
 * primeiro, sempre no veiculo mais vazio (empate: o mais leve). NF nunca e
 * partida entre veiculos. Veiculo que ficaria vazio (mais veiculos que NFs)
 * e descartado.
 */
export function dividirEmVeiculos(nfs: PaletesDaNF[], quantidade: number): Veiculo[] {
  const veiculos: Veiculo[] = Array.from({ length: Math.max(1, quantidade) }, () => ({ nfs: [], paletes: 0, pesoKg: 0, volumes: 0 }));
  const ordenadas = nfs.slice().sort((a, b) => b.paletes - a.paletes || b.pesoKg - a.pesoKg);
  for (const nf of ordenadas) {
    const alvo = veiculos.reduce((menor, v) =>
      v.paletes < menor.paletes || (v.paletes === menor.paletes && v.pesoKg < menor.pesoKg) ? v : menor
    );
    alvo.nfs.push(nf);
    alvo.paletes += nf.paletes;
    alvo.pesoKg += nf.pesoKg;
    alvo.volumes += nf.volumes;
  }
  return veiculos
    .filter((v) => v.nfs.length > 0)
    .map((v) => ({ ...v, pesoKg: Math.round(v.pesoKg * 1000) / 1000 }))
    .sort((a, b) => b.paletes - a.paletes);
}
