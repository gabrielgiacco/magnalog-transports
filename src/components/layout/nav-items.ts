import {
  LayoutDashboard, Package, Calendar, Users, DollarSign, Settings,
  BarChart2, Wallet, FileUp, Truck, Globe, Columns, Route, ShieldCheck,
  AlertTriangle, Map, Layers, Warehouse, Shield, HardDrive, Boxes,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

// Os grupos vieram do design "Sistema TMS Magna". Os itens, hrefs e papeis
// sao os mesmos de antes — o agrupamento e so a ordem de leitura do menu.
export const navGroups: NavGroup[] = [
  {
    label: "Operação",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN","FINANCEIRO","OPERACIONAL"] },
      { href: "/entregas", label: "Entregas", icon: Package, roles: ["ADMIN","FINANCEIRO","OPERACIONAL","CONFERENTE"] },
      { href: "/kanban", label: "Kanban", icon: Columns, roles: ["ADMIN","OPERACIONAL","CONFERENTE"] },
      { href: "/agendamentos", label: "Agendamentos", icon: Calendar, roles: ["ADMIN","FINANCEIRO","OPERACIONAL","CONFERENTE"] },
      { href: "/rotas", label: "Rotas", icon: Route, roles: ["ADMIN","OPERACIONAL"] },
      { href: "/planejador-rotas", label: "Planejador", icon: Map, roles: ["ADMIN","OPERACIONAL"] },
      { href: "/frota", label: "Frota", icon: Truck, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
    ],
  },
  {
    label: "Comercial",
    items: [
      { href: "/faturamento", label: "Faturamento", icon: Wallet, roles: ["ADMIN","FINANCEIRO"] },
      { href: "/financeiro", label: "Financeiro", icon: DollarSign, roles: ["ADMIN","FINANCEIRO"] },
      { href: "/relatorios", label: "Relatórios", icon: BarChart2, roles: ["ADMIN","FINANCEIRO"] },
    ],
  },
  {
    label: "Atendimento",
    items: [
      { href: "/avarias", label: "Avarias e Ocorrências", icon: AlertTriangle, roles: ["ADMIN","OPERACIONAL","CONFERENTE"] },
      { href: "/portal", label: "Portal Cliente", icon: Globe, roles: ["ADMIN","CLIENTE"] },
    ],
  },
  {
    label: "Performance",
    items: [
      { href: "/qualidade", label: "Qualidade", icon: ShieldCheck, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Cadastros e sistema",
    items: [
      { href: "/importacao", label: "Documentos Fiscais", icon: FileUp, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
      { href: "/canhotos", label: "Canhotos", icon: HardDrive, roles: ["ADMIN"] },
      { href: "/paletes", label: "Paletes", icon: Layers, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
      { href: "/configuracoes/normas", label: "Normas Paletização", icon: Warehouse, roles: ["ADMIN","OPERACIONAL","FINANCEIRO"] },
      { href: "/produtos", label: "Catálogo Produtos", icon: Boxes, roles: ["ADMIN"] },
      { href: "/usuarios", label: "Usuários", icon: Users, roles: ["ADMIN"] },
      { href: "/auditoria", label: "Auditoria", icon: Shield, roles: ["ADMIN"] },
      { href: "/configuracoes", label: "Configurações", icon: Settings, roles: ["ADMIN","FINANCEIRO","OPERACIONAL"] },
    ],
  },
];
