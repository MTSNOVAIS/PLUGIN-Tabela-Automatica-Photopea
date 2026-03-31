import { useState, useCallback } from "react";
import type { TeamStanding } from "@/types/football";

const PROXY_BASE = "/api/sofascore";
const ESPN_BASE = "https://site.api.espn.com/apis/v2/sports/soccer";

function buildEspnUrl(leagueSlug: string): string {
  return `${ESPN_BASE}/${leagueSlug}/standings`;
}

async function proxyFetch(url: string): Promise<Response> {
  const proxied = `${PROXY_BASE}?url=${encodeURIComponent(url)}`;
  return fetch(proxied, { headers: { Accept: "application/json" } });
}

interface EspnEntry {
  team: {
    id: string;
    displayName: string;
    shortDisplayName: string;
    abbreviation: string;
  };
  stats: Array<{ name: string; displayValue?: string; value?: number }>;
  note?: { color: string; description: string };
}

interface EspnGroup {
  name?: string;
  abbreviation?: string;
  standings: { entries: EspnEntry[] };
}

interface EspnResponse {
  children: EspnGroup[];
}

function parseEspnEntry(entry: EspnEntry, position: number): TeamStanding {
  const stats: Record<string, string> = {};
  (entry.stats ?? []).forEach(s => {
    stats[s.name] = String(s.displayValue ?? s.value ?? "0");
  });

  const rank = Number(stats["rank"] ?? position);
  const pointDiff = stats["pointDifferential"] ?? "0";
  const goalDiff = Number(pointDiff.replace("+", "")) || 0;

  return {
    position: rank,
    team: {
      id: Number(entry.team.id),
      name: entry.team.displayName,
      shortName: entry.team.shortDisplayName || entry.team.abbreviation,
      nameCode: entry.team.abbreviation,
    },
    points: Number(stats["points"] ?? 0),
    played: Number(stats["gamesPlayed"] ?? 0),
    wins: Number(stats["wins"] ?? 0),
    draws: Number(stats["ties"] ?? 0),
    losses: Number(stats["losses"] ?? 0),
    goalsFor: Number(stats["pointsFor"] ?? 0),
    goalsAgainst: Number(stats["pointsAgainst"] ?? 0),
    goalDifference: goalDiff,
  };
}

function parseEspnStandings(data: EspnResponse): TeamStanding[] {
  if (!data?.children?.length) return [];

  const firstGroup = data.children[0];
  const entries = firstGroup?.standings?.entries ?? [];
  if (!entries.length) return [];

  return entries
    .map((entry, idx) => parseEspnEntry(entry, idx + 1))
    .sort((a, b) => a.position - b.position);
}

function parseEspnGroupStandings(data: EspnResponse, groupIndex: number): TeamStanding[] {
  const group = data.children?.[groupIndex];
  if (!group?.standings?.entries?.length) return [];
  return group.standings.entries
    .map((entry, idx) => parseEspnEntry(entry, idx + 1))
    .sort((a, b) => a.position - b.position);
}

export function useSofascore() {
  const [standings, setStandings] = useState<TeamStanding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStandings = useCallback(async (leagueId: string, _seasonId: string) => {
    if (!leagueId) return;
    setIsLoading(true);
    setError(null);
    setStandings([]);

    try {
      const url = buildEspnUrl(leagueId);
      const res = await proxyFetch(url);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = (await res.json()) as EspnResponse;
      const parsed = parseEspnStandings(data);

      if (parsed.length > 0) {
        setStandings(parsed);
      } else {
        throw new Error("Sem dados na resposta");
      }
    } catch (err) {
      setError(`Erro ao carregar dados: ${err instanceof Error ? err.message : "falha na conexão"}`);
      setStandings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { standings, isLoading, error, fetchStandings, parseEspnGroupStandings };
}
