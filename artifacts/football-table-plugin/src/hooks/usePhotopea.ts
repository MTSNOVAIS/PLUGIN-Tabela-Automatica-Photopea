import { useCallback } from "react";
import type { TeamStanding, LayerConfig, PsdScanResult } from "@/types/football";
import { getFieldValue } from "@/types/football";

function isInPhotopea(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Runs a Photopea script and waits for a response tagged with a unique token.
 * The script must call: app.echoToOE(__TOKEN__ + "|" + yourData)
 * This prevents capturing stray Photopea messages (progress, HMR, etc.)
 */
function runScript(scriptBody: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const prefix = token + "|";

    // Inject token into the script — script must echo: token + "|" + data
    const fullScript = scriptBody.replace("__TOKEN__", `'${token}'`);

    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Photopea timeout"));
    }, 15000);

    function handler(event: MessageEvent) {
      if (event.source !== window.parent) return;
      if (typeof event.data !== "string") return;
      if (!event.data.startsWith(prefix)) return; // ignore unrelated messages
      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      resolve(event.data.slice(prefix.length));
    }

    window.addEventListener("message", handler);
    window.parent.postMessage(fullScript, "*");
  });
}

function buildScanScript(prefix: string): string {
  const escapedPrefix = prefix.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
(function() {
  var token = __TOKEN__;
  function findNumberedGroups(container, pfx, depth) {
    var groups = [];
    if (depth > 6) return groups;
    for (var i = 0; i < container.layers.length; i++) {
      var layer = container.layers[i];
      if (layer.typename === "LayerSet") {
        var trimmed = layer.name.trim();
        var without = trimmed;
        if (pfx && trimmed.indexOf(pfx) === 0) without = trimmed.slice(pfx.length).trim();
        var num = parseInt(without, 10);
        if (!isNaN(num) && String(num) === without) {
          groups.push({ name: layer.name, num: num, ref: layer });
        } else {
          var sub = findNumberedGroups(layer, pfx, depth + 1);
          for (var j = 0; j < sub.length; j++) groups.push(sub[j]);
        }
      }
    }
    return groups;
  }
  function getTextLayerNames(group) {
    var names = [];
    for (var i = 0; i < group.layers.length; i++) {
      var l = group.layers[i];
      if (l.kind === LayerKind.TEXT) { if (names.indexOf(l.name) === -1) names.push(l.name); }
      else if (l.typename === "LayerSet") {
        var sub = getTextLayerNames(l);
        for (var j = 0; j < sub.length; j++) { if (names.indexOf(sub[j]) === -1) names.push(sub[j]); }
      }
    }
    return names;
  }
  var doc = app.activeDocument;
  var groups = findNumberedGroups(doc, '${escapedPrefix}', 0);
  groups.sort(function(a, b) { return a.num - b.num; });
  var result = { groups: [], layerNames: [] };
  if (groups.length > 0) {
    result.groups = groups.map(function(g) { return g.name; });
    result.layerNames = getTextLayerNames(groups[0].ref);
  }
  app.echoToOE(token + '|' + JSON.stringify(result));
})();
`;
}

/**
 * Builds a script for a SINGLE team update.
 * One team per script call = small scripts, no timeout risk.
 */
function buildSingleUpdateScript(team: TeamStanding, config: LayerConfig): string {
  interface Update { groupName: string; layerName: string; value: string; }
  const updates: Update[] = [];

  const groupName = config.groupPrefix
    ? `${config.groupPrefix}${team.position}`
    : String(team.position);

  for (const [field, layerName] of Object.entries(config.fieldMap)) {
    if (!layerName) continue;
    const value = getFieldValue(team, field as keyof typeof config.fieldMap);
    if (value === "") continue;
    updates.push({ groupName, layerName, value });
  }

  if (updates.length === 0) return "";

  // Safely encode as JSON inline — no template literal escape issues
  const updatesStr = JSON.stringify(updates);

  return `
(function() {
  var token = __TOKEN__;
  var updates = ${updatesStr};
  var doc = app.activeDocument;

  function findGroup(container, name, depth) {
    if (depth > 8) return null;
    for (var i = 0; i < container.layers.length; i++) {
      var layer = container.layers[i];
      if (layer.typename === "LayerSet") {
        if (layer.name === name) return layer;
        var found = findGroup(layer, name, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  function updateTextLayer(container, layerName, value, depth) {
    if (depth > 6) return false;
    for (var i = 0; i < container.layers.length; i++) {
      var layer = container.layers[i];
      if (layer.name === layerName && layer.kind === LayerKind.TEXT) {
        layer.textItem.contents = value;
        return true;
      }
      if (layer.typename === "LayerSet") {
        if (updateTextLayer(layer, layerName, value, depth + 1)) return true;
      }
    }
    return false;
  }

  var group = findGroup(doc, updates[0].groupName, 0);
  if (group) {
    for (var i = 0; i < updates.length; i++) {
      updateTextLayer(group, updates[i].layerName, updates[i].value, 0);
    }
  }

  app.echoToOE(token + '|ok');
})();
`;
}

const MOCK_SCAN: PsdScanResult = {
  groups: ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20"],
  layerNames: ["posicao", "nome", "pontos", "jogos", "vitorias", "empates", "derrotas", "saldo"],
};

export function usePhotopea() {
  const isPhotopea = isInPhotopea();

  const scanPsd = useCallback(async (prefix: string): Promise<PsdScanResult> => {
    if (!isPhotopea) {
      await new Promise(res => setTimeout(res, 400));
      return MOCK_SCAN;
    }
    const result = await runScript(buildScanScript(prefix));
    try {
      return JSON.parse(result) as PsdScanResult;
    } catch {
      return { groups: [], layerNames: [] };
    }
  }, [isPhotopea]);

  const applyUpdates = useCallback(async (
    queue: TeamStanding[],
    config: LayerConfig,
    onProgress?: (done: number, total: number) => void,
  ) => {
    if (!isPhotopea) {
      for (let i = 0; i < queue.length; i++) {
        await new Promise(res => setTimeout(res, 80));
        onProgress?.(i + 1, queue.length);
      }
      return;
    }

    for (let i = 0; i < queue.length; i++) {
      const team = queue[i];
      const script = buildSingleUpdateScript(team, config);
      if (script) {
        await runScript(script);
        // Small breathing room between teams so Photopea doesn't queue-drop
        await new Promise(res => setTimeout(res, 120));
      }
      onProgress?.(i + 1, queue.length);
    }
  }, [isPhotopea]);

  return { scanPsd, applyUpdates, isPhotopea };
}
