"use client";
import { useEffect, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { formatWeight } from "@/lib/utils";

// Correção para os ícones padrão do Leaflet no Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

const defaultIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const selectedIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Componente para ajustar o zoom do mapa automaticamente baseado nos marcadores
function ChangeView({ bounds }: { bounds: L.LatLngBounds | null }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

// Componente para centralizar o mapa em uma coordenada específica
function CenteringView({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, 16, { animate: true });
    }
  }, [center, map]);
  return null;
}

export interface MapEntrega {
  id: string;
  codigo: string;
  razaoSocial: string;
  cidade: string;
  endereco?: string;
  bairro?: string;
  latitude: number;
  longitude: number;
  pesoTotal: number;
  volumeTotal: number;
  notas?: { numero: string }[];
}

interface RouteMapProps {
  entregas: MapEntrega[];
  selectedIds: string[];
  onToggleEntrega: (id: string) => void;
  centerTo?: [number, number];
}

export default function RouteMap({ entregas, selectedIds, onToggleEntrega, centerTo }: RouteMapProps) {
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (entregas.length > 0) {
      const b = L.latLngBounds(entregas.map(e => [e.latitude, e.longitude] as [number, number]));
      setBounds(b);
    }
  }, [entregas]);

  // Agrupar entregas por mesma coordenada para espalhar marcadores sobrepostos
  const agrupadas = useMemo(() => {
    const map: Record<string, MapEntrega[]> = {};
    entregas.forEach(e => {
      const key = \`\${e.latitude.toFixed(5)}_\${e.longitude.toFixed(5)}\`;
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }, [entregas]);

  // Centro inicial caso não haja entregas (São Paulo)
  const defaultCenter: [number, number] = [-23.5505, -46.6333];

  return (
    <MapContainer 
      center={defaultCenter} 
      zoom={10} 
      style={{ height: "100%", width: "100%", borderRadius: "0.5rem", zIndex: 0 }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      
      <ChangeView bounds={bounds} />
      <CenteringView center={centerTo || null} />

      {entregas.map((entrega) => {
        const isSelected = selectedIds.includes(entrega.id);
        
        // Espalhar marcadores sobrepostos em um pequeno círculo
        const key = \`\${entrega.latitude.toFixed(5)}_\${entrega.longitude.toFixed(5)}\`;
        const group = agrupadas[key] || [];
        const indexInGroup = group.findIndex(g => g.id === entrega.id);
        
        let lat = entrega.latitude;
        let lng = entrega.longitude;

        if (group.length > 1) {
          const angle = (indexInGroup / group.length) * Math.PI * 2;
          const radius = 0.00015; // ~15 metros
          lat += Math.sin(angle) * radius;
          lng += Math.cos(angle) * radius;
        }

        const position: [number, number] = [lat, lng];
        
        return (
          <Marker 
            key={entrega.id} 
            position={position}
            icon={isSelected ? selectedIcon : defaultIcon}
            eventHandlers={{
              click: () => onToggleEntrega(entrega.id),
            }}
          >
            <Popup>
              <div className="p-1 min-w-[200px]">
                <div className="font-bold text-sm text-slate-800 mb-1">{entrega.razaoSocial}</div>
                
                <div className="text-[10px] uppercase font-bold text-orange-500 tracking-wider mb-2">
                  {entrega.notas && entrega.notas.length > 0 
                    ? entrega.notas.map((n: any) => n.numero).join(", ") 
                    : entrega.codigo}
                </div>
                
                <div className="text-xs text-slate-600 mb-2">
                  {entrega.endereco && <div>{entrega.endereco}</div>}
                  {entrega.bairro && <div>{entrega.bairro} - {entrega.cidade}</div>}
                  {!entrega.endereco && !entrega.bairro && <div>{entrega.cidade}</div>}
                </div>

                <div className="flex justify-between items-center bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="font-mono text-xs text-slate-500">{formatWeight(entrega.pesoTotal)}</span>
                  <span className="font-mono text-xs text-slate-500">{entrega.volumeTotal} vol</span>
                </div>
                
                <button 
                  className={\`mt-3 w-full py-1.5 rounded text-xs font-bold text-white transition-colors \${
                    isSelected ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
                  }\`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleEntrega(entrega.id);
                  }}
                >
                  {isSelected ? "Remover da Rota" : "Adicionar à Rota"}
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
