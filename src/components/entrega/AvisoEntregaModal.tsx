"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Select, Textarea } from "@/components/ui";
import { MessageCircle, Send, AlertTriangle, Building2 } from "lucide-react";
import { montarAvisoEntrega } from "@/lib/mensagem-entrega";
import { formatarTelefoneBR, linkWhatsApp } from "@/lib/telefone";

interface Embarcador {
  cnpj: string;
  nome: string;
  whatsapp: string | null;
  telefoneValido: string | null;
}

interface Cota {
  usadas: number;
  cotaMensal: number;
  limiteReserva: number;
  restantes: number;
  estado: "ok" | "reserva" | "esgotada";
}

interface Props {
  open: boolean;
  onClose: () => void;
  entregaId: string;
  isAdmin?: boolean;
}

export function AvisoEntregaModal({ open, onClose, entregaId, isAdmin }: Props) {
  const [embarcadores, setEmbarcadores] = useState<Embarcador[]>([]);
  const [cnpj, setCnpj] = useState("");
  const [texto, setTexto] = useState("");
  const [cota, setCota] = useState<Cota | null>(null);
  const [maxChars, setMaxChars] = useState(600);
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [rc, re] = await Promise.all([
        fetch("/api/whatsapp/config"),
        fetch(`/api/entregas/${entregaId}/embarcadores`),
      ]);
      if (!rc.ok) throw new Error((await rc.json()).error || "Erro ao carregar a cota");
      if (!re.ok) throw new Error((await re.json()).error || "Erro ao carregar os embarcadores");

      const cfg = await rc.json();
      const contatos = await re.json();

      setCota(cfg.cota);
      setMaxChars(cfg.config.maxCaracteres);
      setAtivo(cfg.config.ativo && cfg.credenciaisConfiguradas);
      setEmbarcadores(contatos.embarcadores);
      // Começa no primeiro que já tem número — poupa um clique no caso comum.
      setCnpj(
        (contatos.embarcadores.find((e: Embarcador) => e.telefoneValido) || contatos.embarcadores[0])?.cnpj || ""
      );
      setTexto(
        montarAvisoEntrega(
          {
            codigo: contatos.codigo,
            destinatario: contatos.destinatario,
            dataEntrega: contatos.dataEntrega,
            notaNumero: contatos.notaNumero,
          },
          cfg.config.maxCaracteres
        )
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [entregaId]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  const escolhido = embarcadores.find((e) => e.cnpj === cnpj) || null;
  const telefoneOk = Boolean(escolhido?.telefoneValido);
  const excedeu = texto.length > maxChars;
  const esgotada = cota?.estado === "esgotada";
  const naReserva = cota?.estado === "reserva";
  // Na reserva só ADMIN passa. Esgotada, ninguém — sobra o wa.me, que é grátis.
  const podeEnviar = ativo && telefoneOk && !excedeu && texto.trim().length > 0
    && !esgotada && (!naReserva || Boolean(isAdmin));

  async function enviar(reenviar = false) {
    if (naReserva && !window.confirm(
      `Restam apenas ${cota?.restantes} mensagens de reserva neste mês. Confirma gastar uma?`
    )) return;

    setEnviando(true);
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entregaId, embarcadorCnpj: cnpj, texto, forcarReserva: naReserva, reenviar }),
      });
      const d = await res.json();

      if (!res.ok) {
        if (d.error === "JA_ENVIADO" && !reenviar) {
          if (window.confirm(`${d.message}\n\nIsso vai gastar mais uma mensagem da cota.`)) {
            setEnviando(false);
            return enviar(true);
          }
          return;
        }
        throw new Error(d.message || d.error || "Erro ao enviar");
      }

      setCota(d.cota);
      toast.success(`Aviso enviado para ${d.mensagem.destinatario}`);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar");
    } finally {
      setEnviando(false);
    }
  }

  function abrirWhatsApp() {
    window.open(linkWhatsApp(escolhido?.whatsapp, texto), "_blank");
    onClose();
  }

  const corCota = esgotada ? "#ef4444" : naReserva ? "#f59e0b" : "var(--text3)";

  return (
    <Modal open={open} onClose={onClose} title="Avisar embarcador da entrega" size="md">
      {loading ? (
        <div className="text-center py-8 text-sm" style={{ color: "var(--text3)" }}>Carregando...</div>
      ) : embarcadores.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: "var(--text2)" }}>
            Esta entrega não tem nota fiscal, então não dá para saber o embarcador.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Embarcador */}
          {embarcadores.length > 1 ? (
            <Select
              label="Embarcador (emitente da NF)"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
            >
              {embarcadores.map((e) => (
                <option key={e.cnpj} value={e.cnpj}>
                  {e.nome}{e.telefoneValido ? "" : " — sem WhatsApp"}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(37,211,102,.08)", border: "1px solid rgba(37,211,102,.2)" }}>
              <Building2 size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#25d366" }} />
              <div className="text-sm min-w-0">
                <div className="text-[10px] uppercase tracking-widest font-mono mb-0.5" style={{ color: "var(--text3)" }}>
                  Embarcador (emitente da NF)
                </div>
                <div className="font-medium truncate">{escolhido?.nome}</div>
              </div>
            </div>
          )}

          {/* Número */}
          <div className="text-sm px-1">
            <span style={{ color: "var(--text3)" }}>WhatsApp: </span>
            {telefoneOk
              ? <strong>{formatarTelefoneBR(escolhido!.whatsapp)}</strong>
              : <span className="text-red-400">não cadastrado</span>}
          </div>

          {!telefoneOk && (
            <div className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)" }}>
              <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm" style={{ color: "var(--text2)" }}>
                {escolhido?.whatsapp
                  ? `"${escolhido.whatsapp}" não é um número brasileiro válido.`
                  : `${escolhido?.nome} não tem WhatsApp cadastrado.`}{" "}
                Cadastre em <strong>Configurações → Valores de Ticket por Embarcador</strong>.
                O envio pelo sistema está bloqueado, mas dá para abrir o WhatsApp e escolher o contato na mão.
              </p>
            </div>
          )}

          {!ativo && (
            <div className="flex items-start gap-3 p-3 rounded-xl"
              style={{ background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)" }}>
              <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm" style={{ color: "var(--text2)" }}>
                O envio automático está desligado ou sem credenciais. Ligue em Configurações → WhatsApp.
              </p>
            </div>
          )}

          {/* Mensagem */}
          <div>
            <Textarea
              label="Mensagem"
              rows={6}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Escreva a mensagem..."
            />
            <div className="flex items-center justify-between mt-1.5 text-xs">
              <span style={{ color: corCota }}>
                {cota ? `${cota.usadas} de ${cota.cotaMensal} mensagens usadas este mês` : "—"}
                {naReserva && " · na reserva"}
                {esgotada && " · esgotada"}
              </span>
              <span style={{ color: excedeu ? "#ef4444" : "var(--text3)" }}>
                {texto.length}/{maxChars}
              </span>
            </div>
          </div>

          {esgotada && (
            <p className="text-xs" style={{ color: "var(--text2)" }}>
              A cota do mês acabou. Use <strong>Abrir no WhatsApp</strong> — o texto vai junto e não custa nada.
            </p>
          )}
          {naReserva && !isAdmin && (
            <p className="text-xs" style={{ color: "var(--text2)" }}>
              Restam {cota?.restantes} mensagens de reserva. Só um ADMIN pode gastá-las.
            </p>
          )}

          {/* Ações */}
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t"
            style={{ borderColor: "var(--border)" }}>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="ghost" onClick={abrirWhatsApp} disabled={!texto.trim()}>
              <MessageCircle size={14} /> Abrir no WhatsApp
            </Button>
            <Button onClick={() => enviar(false)} loading={enviando} disabled={!podeEnviar}>
              <Send size={14} /> Enviar pelo sistema
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
