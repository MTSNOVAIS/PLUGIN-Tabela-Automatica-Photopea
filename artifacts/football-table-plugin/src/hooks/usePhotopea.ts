import { useCallback } from "react";
import type { TeamStanding, LayerMapping, PhotopeaLayer } from "@/types/football";
import { getFieldValue } from "@/types/football";

function isInPhotopea(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Send a script string to Photopea via postMessage (official API).
 * Photopea accepts a raw script string and responds via message events.
 * Scripts must call app.echoToOE("value") to return data back to the plugin.
 */
function runScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Photopea script timeout"));
    }, 8000);

    function handler(event: MessageEvent) {
      if (event.source !== window.parent) return;
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      if (typeof event.data === "string") {
        resolve(event.data);
      } else if (event.data instanceof ArrayBuffer) {
        resolve("arraybuffer");
      } else {
        resolve(String(event.data ?? ""));
      }
    }

    window.addEventListener("message", handler);
    window.parent.postMessage(script, "*");
  });
}

function buildLayerReadScript(): string {
  return `
(function() {
  function collectLayers(container, prefix) {
    var result = [];
    for (var i = 0; i < container.layers.length; i++) {
      var layer = container.layers[i];
      var path = prefix ? prefix + "/" + layer.name : layer.name;
      var type = "other";
      if (layer.kind === LayerKind.TEXT) type = "text";
      else if (layer.typename === "LayerSet") type = "group";
      result.push({ name: layer.name, type: type, path: path });
      if (layer.typename === "LayerSet") {
        var children = collectLayers(layer, path);
        for (var j = 0; j < children.length; j++) {
          result.push(children[j]);
        }
      }
    }
    return result;
  }
  var doc = app.activeDocument;
  var layers = collectLayers(doc, "");
  app.echoToOE(JSON.stringify(layers));
})();
`;
}

function buildUpdateScript(team: TeamStanding, mappings: LayerMapping[]): string {
  const teamMappings = mappings.filter(m => m.position === team.position);
  if (teamMappings.length === 0) return "";

  const updates = teamMappings.map(m => {
    const value = getFieldValue(team, m.field).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    const layerPath = (m.layerPath || m.layerName).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
    return `
  (function() {
    var parts = '${layerPath}'.split('/');
    var current = doc;
    for (var i = 0; i < parts.length - 1; i++) {
      var found = false;
      for (var j = 0; j < current.layers.length; j++) {
        if (current.layers[j].name === parts[i]) {
          current = current.layers[j];
          found = true;
          break;
        }
      }
      if (!found) return;
    }
    var layerName = parts[parts.length - 1];
    for (var k = 0; k < current.layers.length; k++) {
      if (current.layers[k].name === layerName && current.layers[k].kind === LayerKind.TEXT) {
        current.layers[k].textItem.contents = '${value}';
        break;
      }
    }
  })();`;
  }).join("\n");

  return `
(function() {
  var doc = app.activeDocument;
  ${updates}
  app.echoToOE("ok");
})();
`;
}

const MOCK_LAYERS: PhotopeaLayer[] = [
  { name: "Tabela", type: "group", path: "Tabela" },
  { name: "Linha_1", type: "group", path: "Tabela/Linha_1" },
  { name: "Pos_1", type: "text", path: "Tabela/Linha_1/Pos_1" },
  { name: "Time_1", type: "text", path: "Tabela/Linha_1/Time_1" },
  { name: "Pts_1", type: "text", path: "Tabela/Linha_1/Pts_1" },
  { name: "Linha_2", type: "group", path: "Tabela/Linha_2" },
  { name: "Pos_2", type: "text", path: "Tabela/Linha_2/Pos_2" },
  { name: "Time_2", type: "text", path: "Tabela/Linha_2/Time_2" },
  { name: "Pts_2", type: "text", path: "Tabela/Linha_2/Pts_2" },
];

export function usePhotopea() {
  const isPhotopea = isInPhotopea();

  const readLayers = useCallback(async (): Promise<PhotopeaLayer[]> => {
    if (!isPhotopea) {
      return MOCK_LAYERS;
    }
    const script = buildLayerReadScript();
    const result = await runScript(script);
    try {
      return JSON.parse(result) as PhotopeaLayer[];
    } catch {
      return [];
    }
  }, [isPhotopea]);

  const applyUpdates = useCallback(async (queue: TeamStanding[], mappings: LayerMapping[]) => {
    if (!isPhotopea) {
      await new Promise(res => setTimeout(res, 600));
      return;
    }

    for (const team of queue) {
      const script = buildUpdateScript(team, mappings);
      if (script) {
        await runScript(script);
        await new Promise(res => setTimeout(res, 80));
      }
    }

    const saveScript = `app.activeDocument.save(); app.echoToOE("saved");`;
    await runScript(saveScript);
  }, [isPhotopea]);

  return { readLayers, applyUpdates, isPhotopea };
}
