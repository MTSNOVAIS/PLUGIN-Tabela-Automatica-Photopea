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
 * Sends a script to Photopea and waits for the response.
 * Scripts must call app.echoToOE("...") to send data back.
 * We process ONE script at a time (sequential), so there is never
 * more than one listener active — no race conditions possible.
 */
function runScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Photopea timeout (15s)"));
    }, 15000);

    function handler(event: MessageEvent) {
      // Only accept messages from Photopea (our parent frame)
      if (event.source !== window.parent) return;
      // Ignore binary messages (e.g. exported files)
      if (event.data instanceof ArrayBuffer) return;

      clearTimeout(timeout);
      window.removeEventListener("message", handler);
      resolve(typeof event.data === "string" ? event.data : String(event.data ?? ""));
    }

    window.addEventListener("message", handler);
    window.parent.postMessage(script, "*");
  });
}

function buildScanScript(groupPrefix: string): string {
  const esc = groupPrefix.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
(function() {
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

  function collectTextNames(group) {
    var names = [];
    for (var i = 0; i < group.layers.length; i++) {
      var l = group.layers[i];
      if (l.kind === LayerKind.TEXT) {
        if (names.indexOf(l.name) === -1) names.push(l.name);
      } else if (l.typename === "LayerSet") {
        var sub = collectTextNames(l);
        for (var j = 0; j < sub.length; j++) {
          if (names.indexOf(sub[j]) === -1) names.push(sub[j]);
        }
      }
    }
    return names;
  }

  var doc = app.activeDocument;
  var groups = findNumberedGroups(doc, '${esc}', 0);
  groups.sort(function(a, b) { return a.num - b.num; });

  var result = { groups: [], layerNames: [] };
  if (groups.length > 0) {
    result.groups = groups.map(function(g) { return g.name; });
    result.layerNames = collectTextNames(groups[0].ref);
  }
  app.echoToOE(JSON.stringify(result));
})();
`;
}

/**
 * One script per team — small, fast, and guaranteed to finish
 * before the next one starts. Finds the team's numbered group
 * and updates each mapped text layer inside it.
 */
function buildUpdateScript(team: TeamStanding, config: LayerConfig): string {
  const groupName = config.groupPrefix
    ? `${config.groupPrefix}${team.position}`
    : String(team.position);

  const updates: Array<{ ln: string; val: string }> = [];

  for (const [field, layerName] of Object.entries(config.fieldMap)) {
    if (!layerName) continue;
    const value = getFieldValue(team, field as keyof typeof config.fieldMap);
    if (value === "") continue;
    updates.push({ ln: layerName, val: value });
  }

  if (updates.length === 0) return "";

  // Escape values for safe embedding inside single-quoted JS strings
  function esc(s: string) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  const groupEsc = esc(groupName);
  const updatesLiteral = updates
    .map(u => `{ln:'${esc(u.ln)}',val:'${esc(u.val)}'}`)
    .join(",");

  return `
(function() {
  var doc = app.activeDocument;
  var groupName = '${groupEsc}';
  var updates = [${updatesLiteral}];

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

  function setTextLayer(container, layerName, value, depth) {
    if (depth > 6) return false;
    for (var i = 0; i < container.layers.length; i++) {
      var layer = container.layers[i];
      if (layer.name === layerName && layer.kind === LayerKind.TEXT) {
        layer.textItem.contents = value;
        return true;
      }
      if (layer.typename === "LayerSet") {
        if (setTextLayer(layer, layerName, value, depth + 1)) return true;
      }
    }
    return false;
  }

  var group = findGroup(doc, groupName, 0);
  if (group) {
    for (var i = 0; i < updates.length; i++) {
      setTextLayer(group, updates[i].ln, updates[i].val, 0);
    }
  }
  app.echoToOE("ok");
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
    const raw = await runScript(buildScanScript(prefix));
    try {
      return JSON.parse(raw) as PsdScanResult;
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
      const script = buildUpdateScript(queue[i], config);
      if (script) {
        await runScript(script);
        // Give Photopea a moment to settle before the next script
        await new Promise(res => setTimeout(res, 150));
      }
      onProgress?.(i + 1, queue.length);
    }
  }, [isPhotopea]);

  return { scanPsd, applyUpdates, isPhotopea };
}
