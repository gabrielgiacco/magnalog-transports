"use client";

import { DanfeData } from "@/lib/danfe-parser";
import Barcode from "react-barcode";

function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
}

function formatCep(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 8) return d.replace(/(\d{5})(\d{3})/, "$1-$2");
  return v;
}

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3");
  return v;
}

function formatChave(chave: string): string {
  return chave.replace(/(\d{4})/g, "$1 ").trim();
}

function fmtNum(val: number, decimals = 2): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─── Cell component ──────────────────────────────────────────────────────────

function Cell({
  label,
  value,
  className = "",
  mono = false,
  bold = false,
  colSpan,
  style,
}: {
  label: string;
  value: string | number;
  className?: string;
  mono?: boolean;
  bold?: boolean;
  colSpan?: number;
  style?: React.CSSProperties;
}) {
  return (
    <td colSpan={colSpan} className={`danfe-cell ${className}`} style={style}>
      <div className="danfe-cell-label">{label}</div>
      <div className={`danfe-cell-value ${mono ? "danfe-mono" : ""} ${bold ? "danfe-bold" : ""}`}>
        {value || "\u00A0"}
      </div>
    </td>
  );
}

// ─── Main DANFE Component ────────────────────────────────────────────────────

export function DanfeViewer({ data }: { data: DanfeData }) {
  const { emitente, destinatario, produtos, totais, transporte, fatura, duplicatas, pagamentos } = data;

  return (
    <div className="danfe-container" id="danfe-print">
      {/* ═══ HEADER ═══ */}
      <table className="danfe-table">
        <tbody>
          <tr>
            {/* Emitente info */}
            <td className="danfe-cell danfe-emitente-header" rowSpan={3} style={{ width: "45%" }}>
              <div className="danfe-emitente-nome">{emitente.razaoSocial}</div>
              {emitente.nomeFantasia && (
                <div className="danfe-emitente-fantasia">{emitente.nomeFantasia}</div>
              )}
              <div className="danfe-emitente-endereco">
                {emitente.endereco}
                {emitente.bairro && ` - ${emitente.bairro}`}
              </div>
              <div className="danfe-emitente-endereco">
                {emitente.municipio} - {emitente.uf}
                {emitente.cep && ` - CEP: ${formatCep(emitente.cep)}`}
              </div>
              {emitente.telefone && (
                <div className="danfe-emitente-endereco">Fone: {formatPhone(emitente.telefone)}</div>
              )}
            </td>

            {/* DANFE Title */}
            <td className="danfe-cell danfe-title-cell" rowSpan={3} style={{ width: "20%", textAlign: "center", verticalAlign: "top" }}>
              <div className="danfe-title">DANFE</div>
              <div className="danfe-title-sub">Documento Auxiliar da Nota Fiscal Eletrônica</div>
              <div className="danfe-title-op" style={{ marginTop: 6 }}>
                <span className="danfe-bold">{data.tipoOperacao === "0" ? "0 - ENTRADA" : "1 - SAÍDA"}</span>
              </div>
              <div className="danfe-title-nf" style={{ marginTop: 4 }}>
                <span className="danfe-bold">N° {data.numero.padStart(9, "0")}</span>
              </div>
              <div className="danfe-title-serie">
                SÉRIE {data.serie}
              </div>
              <div className="danfe-title-folha" style={{ marginTop: 2, fontSize: "7px" }}>
                FOLHA 1/1
              </div>
            </td>

            {/* Barcode + Key */}
            <td className="danfe-cell" rowSpan={2} style={{ width: "35%", textAlign: "center", verticalAlign: "top", padding: "4px 2px" }}>
              {data.chaveAcesso && (
                <div className="danfe-barcode-wrapper">
                  <Barcode
                    value={data.chaveAcesso}
                    format="CODE128"
                    width={1}
                    height={40}
                    displayValue={false}
                    margin={0}
                  />
                </div>
              )}
              <div className="danfe-cell-label" style={{ marginTop: 4 }}>CHAVE DE ACESSO</div>
              <div className="danfe-chave">{formatChave(data.chaveAcesso)}</div>
            </td>
          </tr>
          <tr />
          <tr>
            <td className="danfe-cell" style={{ textAlign: "center", verticalAlign: "top", padding: "3px 4px" }}>
              <div className="danfe-cell-label">PROTOCOLO DE AUTORIZAÇÃO DE USO</div>
              <div className="danfe-cell-value danfe-mono danfe-bold" style={{ fontSize: "8px" }}>
                {data.protocolo ? `${data.protocolo} - ${data.dataProtocolo}` : "SEM PROTOCOLO"}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ NATUREZA DA OPERAÇÃO ═══ */}
      <table className="danfe-table">
        <tbody>
          <tr>
            <Cell label="NATUREZA DA OPERAÇÃO" value={data.naturezaOperacao} style={{ width: "60%" }} />
            <Cell label="INSCRIÇÃO ESTADUAL" value={emitente.ie} mono style={{ width: "20%" }} />
            <Cell label="I.E. SUBST. TRIBUTÁRIO" value={emitente.iest} mono style={{ width: "20%" }} />
          </tr>
          <tr>
            <Cell label="CNPJ" value={formatCnpj(emitente.cnpj)} mono style={{ width: "60%" }} />
            <Cell label="INSCRIÇÃO MUNICIPAL" value={emitente.im} mono style={{ width: "20%" }} />
            <Cell label="CNAE" value={emitente.cnae} mono style={{ width: "20%" }} />
          </tr>
        </tbody>
      </table>

      {/* ═══ DESTINATÁRIO / REMETENTE ═══ */}
      <div className="danfe-section-title">DESTINATÁRIO / REMETENTE</div>
      <table className="danfe-table">
        <tbody>
          <tr>
            <Cell label="NOME / RAZÃO SOCIAL" value={destinatario.razaoSocial} style={{ width: "50%" }} />
            <Cell label="CNPJ / CPF" value={formatCnpj(destinatario.cnpj)} mono style={{ width: "25%" }} />
            <Cell label="DATA DA EMISSÃO" value={data.dataEmissao} mono style={{ width: "25%" }} />
          </tr>
          <tr>
            <Cell label="ENDEREÇO" value={`${destinatario.endereco}${destinatario.bairro ? ` - ${destinatario.bairro}` : ""}`} style={{ width: "50%" }} />
            <Cell label="CEP" value={formatCep(destinatario.cep)} mono style={{ width: "12%" }} />
            <Cell label="DATA DE SAÍDA/ENTRADA" value={data.dataSaidaEntrada} mono style={{ width: "18%" }} />
            <Cell label="HORA" value={data.horaSaidaEntrada} mono style={{ width: "20%" }} />
          </tr>
          <tr>
            <Cell label="MUNICÍPIO" value={destinatario.municipio} style={{ width: "40%" }} />
            <Cell label="UF" value={destinatario.uf} mono style={{ width: "5%" }} />
            <Cell label="FONE / FAX" value={destinatario.telefone ? formatPhone(destinatario.telefone) : ""} mono style={{ width: "20%" }} />
            <Cell label="INSCRIÇÃO ESTADUAL" value={destinatario.ie} mono style={{ width: "20%" }} />
            <Cell label="INDICADOR IE" value="" mono style={{ width: "15%" }} />
          </tr>
        </tbody>
      </table>

      {/* ═══ FATURA / DUPLICATAS ═══ */}
      {(fatura || duplicatas.length > 0) && (
        <>
          <div className="danfe-section-title">FATURA / DUPLICATAS</div>
          <table className="danfe-table">
            <tbody>
              {fatura && (
                <tr>
                  <Cell label="NÚMERO" value={fatura.numero} mono />
                  <Cell label="VALOR ORIGINAL" value={`R$ ${fmtNum(fatura.valorOriginal)}`} mono />
                  <Cell label="VALOR DESCONTO" value={`R$ ${fmtNum(fatura.valorDesconto)}`} mono />
                  <Cell label="VALOR LÍQUIDO" value={`R$ ${fmtNum(fatura.valorLiquido)}`} mono bold />
                </tr>
              )}
              {duplicatas.length > 0 && (
                <tr>
                  <td colSpan={4} className="danfe-cell" style={{ padding: "2px 4px" }}>
                    <div className="danfe-cell-label">DUPLICATAS</div>
                    <div className="danfe-duplicatas-grid">
                      {duplicatas.map((d, i) => (
                        <div key={i} className="danfe-duplicata-item">
                          <span className="danfe-bold">{d.numero}</span>
                          <span>{d.vencimento}</span>
                          <span className="danfe-mono">R$ {fmtNum(d.valor)}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}

      {/* ═══ IMPOSTOS ═══ */}
      <div className="danfe-section-title">CÁLCULO DO IMPOSTO</div>
      <table className="danfe-table">
        <tbody>
          <tr>
            <Cell label="BASE DE CÁLCULO DO ICMS" value={`R$ ${fmtNum(totais.bcIcms)}`} mono />
            <Cell label="VALOR DO ICMS" value={`R$ ${fmtNum(totais.vIcms)}`} mono />
            <Cell label="BASE DE CÁLC. ICMS S.T." value={`R$ ${fmtNum(totais.bcIcmsSt)}`} mono />
            <Cell label="VALOR DO ICMS SUBST." value={`R$ ${fmtNum(totais.vIcmsSt)}`} mono />
            <Cell label="V. IMP. IMPORTAÇÃO" value={`R$ 0,00`} mono />
            <Cell label="VALOR DO FCP" value={`R$ ${fmtNum(totais.vFcp)}`} mono />
          </tr>
          <tr>
            <Cell label="VALOR TOTAL DOS PRODUTOS" value={`R$ ${fmtNum(totais.vProd)}`} mono bold />
            <Cell label="VALOR DO FRETE" value={`R$ ${fmtNum(totais.vFrete)}`} mono />
            <Cell label="VALOR DO SEGURO" value={`R$ ${fmtNum(totais.vSeg)}`} mono />
            <Cell label="DESCONTO" value={`R$ ${fmtNum(totais.vDesc)}`} mono />
            <Cell label="OUTRAS DESPESAS" value={`R$ ${fmtNum(totais.vOutro)}`} mono />
            <Cell label="VALOR DO IPI" value={`R$ ${fmtNum(totais.vIpi)}`} mono />
            <Cell label="VALOR APROX. TRIBUTOS" value={`R$ ${fmtNum(totais.vTotTrib)}`} mono />
            <Cell label="VALOR TOTAL DA NF" value={`R$ ${fmtNum(totais.vNf)}`} mono bold />
          </tr>
        </tbody>
      </table>

      {/* ═══ TRANSPORTE ═══ */}
      <div className="danfe-section-title">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>
      <table className="danfe-table">
        <tbody>
          <tr>
            <Cell label="MODALIDADE DO FRETE" value={transporte.modalidade} style={{ width: "25%" }} />
            <Cell label="NOME / RAZÃO SOCIAL" value={transporte.transportadorNome} style={{ width: "30%" }} />
            <Cell label="CÓDIGO ANTT / RNTC" value={transporte.veiculoRntc} mono style={{ width: "12%" }} />
            <Cell label="PLACA DO VEÍCULO" value={transporte.veiculoPlaca} mono style={{ width: "12%" }} />
            <Cell label="UF" value={transporte.veiculoUf} mono style={{ width: "5%" }} />
            <Cell label="CNPJ / CPF" value={transporte.transportadorCnpj ? formatCnpj(transporte.transportadorCnpj) : ""} mono style={{ width: "16%" }} />
          </tr>
          <tr>
            <Cell label="ENDEREÇO" value={transporte.transportadorEndereco} colSpan={2} style={{ width: "55%" }} />
            <Cell label="MUNICÍPIO" value={transporte.transportadorMunicipio} style={{ width: "20%" }} />
            <Cell label="UF" value={transporte.transportadorUf} mono style={{ width: "5%" }} />
            <Cell label="INSCRIÇÃO ESTADUAL" value={transporte.transportadorIe} mono colSpan={2} style={{ width: "20%" }} />
          </tr>
          {transporte.volumes.length > 0 && transporte.volumes.map((vol, i) => (
            <tr key={i}>
              <Cell label="QUANTIDADE" value={vol.quantidade || ""} mono />
              <Cell label="ESPÉCIE" value={vol.especie} />
              <Cell label="MARCA" value={vol.marca} />
              <Cell label="NUMERAÇÃO" value={vol.numeracao} mono />
              <Cell label="PESO BRUTO" value={vol.pesoBruto ? fmtNum(vol.pesoBruto, 3) : ""} mono />
              <Cell label="PESO LÍQUIDO" value={vol.pesoLiquido ? fmtNum(vol.pesoLiquido, 3) : ""} mono />
            </tr>
          ))}
          {transporte.volumes.length === 0 && (
            <tr>
              <Cell label="QUANTIDADE" value="" mono />
              <Cell label="ESPÉCIE" value="" />
              <Cell label="MARCA" value="" />
              <Cell label="NUMERAÇÃO" value="" mono />
              <Cell label="PESO BRUTO" value="" mono />
              <Cell label="PESO LÍQUIDO" value="" mono />
            </tr>
          )}
        </tbody>
      </table>

      {/* ═══ PRODUTOS ═══ */}
      <div className="danfe-section-title">DADOS DOS PRODUTOS / SERVIÇOS</div>
      <table className="danfe-table danfe-produtos-table">
        <colgroup>
          <col style={{ width: "7%" }} />   {/* CÓDIGO */}
          <col style={{ width: "30%" }} />  {/* DESCRIÇÃO */}
          <col style={{ width: "6%" }} />   {/* NCM */}
          <col style={{ width: "3%" }} />   {/* CST */}
          <col style={{ width: "4%" }} />   {/* CFOP */}
          <col style={{ width: "3%" }} />   {/* UN */}
          <col style={{ width: "6%" }} />   {/* QUANT */}
          <col style={{ width: "6%" }} />   {/* VL. UNIT */}
          <col style={{ width: "7%" }} />   {/* VL. TOTAL */}
          <col style={{ width: "6%" }} />   {/* BC ICMS */}
          <col style={{ width: "6%" }} />   {/* VL. ICMS */}
          <col style={{ width: "5%" }} />   {/* VL. IPI */}
          <col style={{ width: "5%" }} />   {/* % ICMS */}
          <col style={{ width: "6%" }} />   {/* % IPI */}
        </colgroup>
        <thead>
          <tr className="danfe-produtos-header">
            <th>CÓDIGO</th>
            <th>DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
            <th>NCM/SH</th>
            <th>CST</th>
            <th>CFOP</th>
            <th>UN</th>
            <th>QUANT.</th>
            <th>VL. UNIT.</th>
            <th>VL. TOTAL</th>
            <th>BC ICMS</th>
            <th>VL. ICMS</th>
            <th>VL. IPI</th>
            <th>% ICMS</th>
            <th>% IPI</th>
          </tr>
        </thead>
        <tbody>
          {produtos.map((prod, i) => (
            <tr key={i} className="danfe-produto-row">
              <td className="danfe-mono">{prod.codigo}</td>
              <td>{prod.descricao}</td>
              <td className="danfe-mono danfe-right">{prod.ncm}</td>
              <td className="danfe-mono danfe-right">{`${prod.origem}${prod.cst}`}</td>
              <td className="danfe-mono danfe-right">{prod.cfop}</td>
              <td className="danfe-mono" style={{ textAlign: "center" }}>{prod.unidade}</td>
              <td className="danfe-mono danfe-right">{fmtNum(prod.quantidade, 4)}</td>
              <td className="danfe-mono danfe-right">{fmtNum(prod.valorUnitario, 4)}</td>
              <td className="danfe-mono danfe-right">{fmtNum(prod.valorTotal)}</td>
              <td className="danfe-mono danfe-right">{prod.bcIcms ? fmtNum(prod.bcIcms) : ""}</td>
              <td className="danfe-mono danfe-right">{prod.vIcms ? fmtNum(prod.vIcms) : ""}</td>
              <td className="danfe-mono danfe-right">{prod.vIpi ? fmtNum(prod.vIpi) : ""}</td>
              <td className="danfe-mono danfe-right">{prod.pIcms ? fmtNum(prod.pIcms) : ""}</td>
              <td className="danfe-mono danfe-right">{prod.pIpi ? fmtNum(prod.pIpi) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ═══ INFORMAÇÕES ADICIONAIS ═══ */}
      <div className="danfe-section-title">DADOS ADICIONAIS</div>
      <table className="danfe-table">
        <tbody>
          <tr>
            <td className="danfe-cell" style={{ width: "65%", verticalAlign: "top", minHeight: 60 }}>
              <div className="danfe-cell-label">INFORMAÇÕES COMPLEMENTARES</div>
              <div className="danfe-info-text">{data.infAdicionais || "\u00A0"}</div>
            </td>
            <td className="danfe-cell" style={{ width: "35%", verticalAlign: "top", minHeight: 60 }}>
              <div className="danfe-cell-label">INFORMAÇÕES DE INTERESSE DO FISCO</div>
              <div className="danfe-info-text">{data.infFisco || "\u00A0"}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ═══ PAGAMENTO ═══ */}
      {pagamentos.length > 0 && (
        <>
          <div className="danfe-section-title">FORMAS DE PAGAMENTO</div>
          <table className="danfe-table">
            <thead>
              <tr className="danfe-produtos-header">
                <th style={{ width: "70%" }}>FORMA DE PAGAMENTO</th>
                <th style={{ width: "30%" }}>VALOR</th>
              </tr>
            </thead>
            <tbody>
              {pagamentos.map((p, i) => (
                <tr key={i} className="danfe-produto-row">
                  <td>{p.forma}</td>
                  <td className="danfe-mono danfe-right">R$ {fmtNum(p.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
