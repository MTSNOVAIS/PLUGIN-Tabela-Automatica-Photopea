export interface Team {
  id: number;
  name: string;
  shortName?: string;
  nameCode?: string;
  colors?: {
    primary?: string;
    secondary?: string;
  };
}

export interface TeamStanding {
  position: number;
  team: Team;
  points: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form?: string;
}

export interface League {
  id: string;
  name: string;
  country: string;
  slug: string;
  seasons: Season[];
}

export interface Season {
  id: string;
  name: string;
  year: string;
}

export type LayerType =
  | "position"
  | "team_name"
  | "team_short"
  | "points"
  | "played"
  | "wins"
  | "draws"
  | "losses"
  | "goals_for"
  | "goals_against"
  | "goal_diff";

export const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  position: "Posição",
  team_name: "Nome do Time",
  team_short: "Nome Curto",
  points: "Pontos",
  played: "Jogos",
  wins: "Vitórias",
  draws: "Empates",
  losses: "Derrotas",
  goals_for: "Gols Pró",
  goals_against: "Gols Contra",
  goal_diff: "Saldo",
};

export const REQUIRED_FIELDS: LayerType[] = ["position", "team_name", "points"];
export const OPTIONAL_FIELDS: LayerType[] = ["played", "wins", "draws", "losses", "goals_for", "goals_against", "goal_diff", "team_short"];

export interface LayerConfig {
  groupPrefix: string;
  fieldMap: Partial<Record<LayerType, string>>;
}

export interface PsdScanResult {
  groups: string[];
  layerNames: string[];
}

export function getFieldValue(standing: TeamStanding, field: LayerType): string {
  switch (field) {
    case "position": return String(standing.position);
    case "team_name": return standing.team.name;
    case "team_short": return standing.team.shortName || standing.team.nameCode || standing.team.name.substring(0, 3).toUpperCase();
    case "points": return String(standing.points);
    case "played": return String(standing.played);
    case "wins": return String(standing.wins);
    case "draws": return String(standing.draws);
    case "losses": return String(standing.losses);
    case "goals_for": return String(standing.goalsFor);
    case "goals_against": return String(standing.goalsAgainst);
    case "goal_diff": return standing.goalDifference >= 0 ? `+${standing.goalDifference}` : String(standing.goalDifference);
    default: return "";
  }
}

export const POPULAR_LEAGUES: League[] = [
  {
    id: "bra.1",
    name: "Brasileirão Série A",
    country: "Brasil",
    slug: "bra.1",
    seasons: [{ id: "current", name: "2026", year: "2026" }],
  },
  {
    id: "bra.2",
    name: "Brasileirão Série B",
    country: "Brasil",
    slug: "bra.2",
    seasons: [{ id: "current", name: "2026", year: "2026" }],
  },
  {
    id: "eng.1",
    name: "Premier League",
    country: "Inglaterra",
    slug: "eng.1",
    seasons: [{ id: "current", name: "2024/25", year: "2025" }],
  },
  {
    id: "esp.1",
    name: "La Liga",
    country: "Espanha",
    slug: "esp.1",
    seasons: [{ id: "current", name: "2024/25", year: "2025" }],
  },
  {
    id: "ita.1",
    name: "Serie A",
    country: "Itália",
    slug: "ita.1",
    seasons: [{ id: "current", name: "2024/25", year: "2025" }],
  },
  {
    id: "ger.1",
    name: "Bundesliga",
    country: "Alemanha",
    slug: "ger.1",
    seasons: [{ id: "current", name: "2024/25", year: "2025" }],
  },
  {
    id: "fra.1",
    name: "Ligue 1",
    country: "França",
    slug: "fra.1",
    seasons: [{ id: "current", name: "2024/25", year: "2025" }],
  },
  {
    id: "conmebol.libertadores",
    name: "Libertadores",
    country: "América do Sul",
    slug: "conmebol.libertadores",
    seasons: [{ id: "current", name: "2025", year: "2025" }],
  },
];
