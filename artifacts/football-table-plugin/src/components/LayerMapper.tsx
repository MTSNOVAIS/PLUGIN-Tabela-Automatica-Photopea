import { useState } from "react";
import { Info, ChevronDown, ChevronUp } from "lucide-react";
import type { LayerConfig, LayerType } from "@/types/football";
import { LAYER_TYPE_LABELS, REQUIRED_FIELDS, OPTIONAL_FIELDS } from "@/types/football";

interface LayerMapperProps {
  config: LayerConfig;
  isPhotopea: boolean;
  onConfigChange: (config: LayerConfig) => void;
}

const NONE = "__none__";

export function LayerMapper({ config, isPhotopea, onConfigChange }: LayerMapperProps) {
  const [showOptional, setShowOptional] = useState(false);

  const handlePrefixChange = (value: string) => {
    onConfigChange({ ...config, groupPrefix: value });
  };

  const handleFieldMap = (field: LayerType, layerName: string) => {
    const newMap = { ...config.fieldMap };
    if (layerName === NONE || layerName === "") {
      delete newMap[field];
    } else {
      newMap[field] = layerName;
    }
    onConfigChange({ ...config, fieldMap: newMap });
  };

  const configuredCount = Object.values(config.fieldMap).filter(Boolean).length;

  function FieldRow({ field }: { field: LayerType }) {
    const current = config.fieldMap[field] ?? "";
    return (
      <div className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
        <span className="text-xs text-foreground w-24 flex-shrink-0">{LAYER_TYPE_LABELS[field]}</span>
        <input
          type="text"
          placeholder="Nome do layer..."
          value={current}
          onChange={e => handleFieldMap(field, e.target.value)}
          className="flex-1 h-7 text-xs px-2 border border-border rounded-md bg-background font-mono"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {!isPhotopea && (
        <div className="mx-3 mt-2 flex items-start gap-1.5 p-2 bg-yellow-50 rounded-md border border-yellow-200">
          <Info className="w-3.5 h-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">Em prévia: a atualização funciona quando aberto dentro do Photopea.</p>
        </div>
      )}

      <div className="px-3 py-2 border-b border-border space-y-2 mt-2">
        <p className="text-xs font-semibold text-foreground">1. Prefixo dos grupos</p>
        <p className="text-xs text-muted-foreground">
          Se os grupos são chamados só de "1", "2", "3"... deixe em branco. Se são "Time 1", "Time 2"... escreva "Time ".
        </p>
        <input
          type="text"
          placeholder='Ex: "Time " ou deixe vazio'
          value={config.groupPrefix}
          onChange={e => handlePrefixChange(e.target.value)}
          className="w-full h-7 text-xs px-2 border border-border rounded-md bg-background font-mono"
        />
      </div>

      <div className="px-3 py-2 border-b border-border space-y-1">
        <p className="text-xs font-semibold text-foreground mb-1">2. Mapear campos obrigatórios</p>
        <p className="text-xs text-muted-foreground mb-2">
          Escreva o nome exato do layer de texto no Photopea para cada campo.
        </p>
        {REQUIRED_FIELDS.map(field => <FieldRow key={field} field={field} />)}
      </div>

      <div className="px-3 py-2">
        <button
          onClick={() => setShowOptional(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          {showOptional ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          Campos opcionais (Jogos, Vitórias, Saldo...)
        </button>
        {showOptional && (
          <div className="space-y-0">
            {OPTIONAL_FIELDS.map(field => <FieldRow key={field} field={field} />)}
          </div>
        )}
      </div>

      {configuredCount > 0 && (
        <div className="mx-3 mb-3 p-2 bg-green-50 border border-green-200 rounded-md">
          <p className="text-xs text-green-700 font-medium">{configuredCount} campo{configuredCount !== 1 ? "s" : ""} configurado{configuredCount !== 1 ? "s" : ""}</p>
          <p className="text-xs text-green-600 mt-0.5">
            {Object.entries(config.fieldMap).filter(([, v]) => v).map(([k, v]) => `${LAYER_TYPE_LABELS[k as LayerType]} → "${v}"`).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
