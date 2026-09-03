"use client";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button, Modal, Textarea } from "@/components/ui";
import { MessageCircle, Send, AlertTriangle, Phone } from "lucide-react";
import { montarAvisoEntrega } from "@/lib/mensagem-entrega";
import { formatarTelefoneBR, linkWhatsApp, normalizarTelefoneBR } from "@/lib/telefone";

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
  entregaCodigo: string;
  clienteNome?: string | null;
  clienteTelefone?: string | null;
  dataEntrega?: string | null;
  notaNumero?: string | null;
  isAdmin?: boolean;
}

export function AvisoEntregaModal({
  open, onClose, entregaId, entregaCodigo,
  clienteNome, clienteTelefone, dataEntrega, notaNumero, isAdmin,
}: Props) {
  const [texto, setTexto] = useState("");
  const [cota, setCota] = useState<Cota | null>(null);
  const [maxChars, setMaxChars] = useState(600);
  const [ativo, setAtivo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const telefoneOk = Boolean(normalizarTelefoneBR(clienteTelefone));

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/config");
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao carregar a cota");
      const d = await res.json();
      setCota(d.cota);
      setMaxChars(d.config.maxCaracteres);
      setAtivo(d.config.ativo && d.credenciaisConfiguradas);
      setTexto(
        montarAvisoEntrega(
          {
            codigo: entregaCodigo,
            razaoSocial: clienteNome,
            dataEntrega,
            notas: notaNumero ? [{ numero: notaNumero }] : [],
          },
          d.config.maxCaracteres
        )
      );
    } catch (e: any) {
      toast.error(e.message || "Erro ao carregar a cota");
    } finally {
      setLoading(false);
    }
  }, [entregaCodigo, clienteNome, dataEntrega, notaNumero]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

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
        body: JSON.stringify({ entregaId, texto, forcarReserva: naReserva, reenviar }),
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
    window.open(linkWhatsApp(clienteTelefone, texto), "_blank");
    onClose();
  }

  const corCota = esgotada ? "#ef4444" : naReserva ? "#f59e0b" : "var(--text3)";

  return (
    <Modal open={open} onClose={onClose} title="Avisar cliente da entrega" size="md">
      <div className="space-y-4">
        {/* Destinatário */}
        <div className="flex items-start gap-3 p-3 rounded-xl"
          style={{ background: "rgba(37,211,102,.08)", border: "1px solid rgba(37,211,102,.2)" }}>
          <Phone size={18} className="flex-shrink-0 mt-0.5" style={{ color: "#25d366" }} />
          <div className="text-sm min-w-0">
            <div className="font-medium truncate">{clienteNome || "Cliente"}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--text2)" }}>
              {clienteTelefone ? formatarTelefoneBR(clienteTelefone) : "sem telefone cadastrado"}
            </div>
          </div>
        </div>

        {!telefoneOk && (
          <div className="flex items-start gap-3 p-3 rounded-xl"
            style={{ background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.25)" }}>
            <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm" style={{ color: "var(--text2)" }}>
              O telefone do cliente {clienteTelefone ? "não é um número brasileiro válido" : "não está cadastrado"}.
              O envio pelo sistema está bloqueado — mas dá para abrir o WhatsApp e escolher o contato na mão.
            </p>
          </div>
        )}

        {ativo === false && !loading && (
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
            placeholder={loading ? "Carregando..." : "Escreva a mensagem..."}
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
          <Button onClick={() => enviar(false)} loading={enviando} disabled={!podeEnviar || loading}>
            <Send size={14} /> Enviar pelo sistema
          </Button>
        </div>
      </div>
    </Modal>
  );
}
