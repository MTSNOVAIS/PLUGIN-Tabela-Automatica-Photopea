import { useState, useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { LeagueSelector } from "@/components/LeagueSelector";
import { StandingsTable } from "@/components/StandingsTable";
import { UpdateQueue } from "@/components/UpdateQueue";
import { LayerMapper } from "@/components/LayerMapper";
import { useSofascore } from "@/hooks/useSofascore";
import { usePhotopea } from "@/hooks/usePhotopea";
import type { TeamStanding, LayerMapping } from "@/types/football";

const PLUGIN_LOGO = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRnzhDYO9zajTF_4o-5bqTLMWCjKVHiRcdJA&s";

export default function PluginPage() {
  const { toast } = useToast();
  const [selectedLeague, setSelectedLeague] = useState<string>("");
  const [selectedSeason, setSelectedSeason] = useState<string>("");
  const [batchSize, setBatchSize] = useState<number>(3);
  const [layerMappings, setLayerMappings] = useState<LayerMapping[]>([]);
  const [updateQueue, setUpdateQueue] = useState<TeamStanding[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [activeTab, setActiveTab] = useState<"standings" | "mapper" | "queue">("standings");

  const { standings, isLoading, error, fetchStandings } = useSofascore();
  const { applyUpdates, readLayers, isPhotopea } = usePhotopea();

  const handleLeagueChange = useCallback(async (leagueId: string, seasonId: string) => {
    setSelectedLeague(leagueId);
    setSelectedSeason(seasonId);
    setUpdateQueue([]);
    setUpdatedCount(0);
    await fetchStandings(leagueId, seasonId);
  }, [fetchStandings]);

  const handleAddToQueue = useCallback((team: TeamStanding) => {
    setUpdateQueue(prev => {
      const exists = prev.find(t => t.position === team.position);
      if (exists) return prev;
      return [...prev, team].sort((a, b) => a.position - b.position);
    });
    toast({
      title: "Adicionado à fila",
      description: `${team.team.name} (${team.position}º) adicionado`,
    });
  }, [toast]);

  const handleAddBatch = useCallback((startPos: number) => {
    if (!standings.length) return;
    const batch = standings.slice(startPos - 1, startPos - 1 + batchSize);
    setUpdateQueue(prev => {
      const newItems = batch.filter(t => !prev.find(p => p.position === t.position));
      return [...prev, ...newItems].sort((a, b) => a.position - b.position);
    });
    toast({
      title: `${batch.length} posições adicionadas`,
      description: `Posições ${startPos} a ${startPos + batch.length - 1}`,
    });
  }, [standings, batchSize, toast]);

  const handleAddAll = useCallback(() => {
    setUpdateQueue([...standings].sort((a, b) => a.position - b.position));
    toast({ title: "Todos adicionados", description: `${standings.length} equipes na fila` });
  }, [standings, toast]);

  const handleRemoveFromQueue = useCallback((position: number) => {
    setUpdateQueue(prev => prev.filter(t => t.position !== position));
  }, []);

  const handleClearQueue = useCallback(() => {
    setUpdateQueue([]);
    setUpdatedCount(0);
  }, []);

  const handleReadLayers = useCallback(async () => {
    try {
      const layers = await readLayers();
      setLayerMappings(layers);
      toast({ title: "Layers lidos", description: `${layers.length} layers encontrados` });
    } catch {
      toast({ title: "Erro ao ler layers", description: "Abra um PSD no Photopea primeiro", variant: "destructive" });
    }
  }, [readLayers, toast]);

  const handleApplyUpdates = useCallback(async () => {
    if (!updateQueue.length) {
      toast({ title: "Fila vazia", description: "Adicione posições à fila primeiro", variant: "destructive" });
      return;
    }
    if (!layerMappings.length && isPhotopea) {
      toast({ title: "Nenhum mapping configurado", description: "Configure o mapeamento de layers primeiro", variant: "destructive" });
      return;
    }
    setIsUpdating(true);
    try {
      await applyUpdates(updateQueue, layerMappings);
      setUpdatedCount(prev => prev + updateQueue.length);
      toast({ title: "Atualização concluída!", description: `${updateQueue.length} posições atualizadas no Photopea` });
      setUpdateQueue([]);
    } catch (err) {
      toast({ title: "Erro na atualização", description: String(err), variant: "destructive" });
    } finally {
      setIsUpdating(false);
    }
  }, [updateQueue, layerMappings, applyUpdates, isPhotopea, toast]);

  void selectedLeague;
  void selectedSeason;

  const progress = standings.length > 0 ? (updatedCount / standings.length) * 100 : 0;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src={PLUGIN_LOGO}
            alt="Logo"
            className="w-6 h-6 rounded object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <span className="text-sm font-semibold leading-tight">Tabela de Futebol</span>
          {isPhotopea ? (
            <Badge variant="outline" className="text-xs text-green-600 border-green-500">Photopea</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-yellow-600 border-yellow-500">Prévia</Badge>
          )}
        </div>
        {updatedCount > 0 && (
          <Badge variant="secondary" className="text-xs">{updatedCount}/{standings.length} atualizados</Badge>
        )}
      </header>

      <div className="px-3 py-2 border-b border-border">
        <LeagueSelector onLeagueChange={handleLeagueChange} isLoading={isLoading} />
      </div>

      {standings.length > 0 && updatedCount > 0 && (
        <div className="px-3 py-1 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Progresso</span>
            <Progress value={progress} className="flex-1 h-1.5" />
            <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      <div className="flex border-b border-border">
        {(["standings", "mapper", "queue"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "standings" ? "Tabela" : tab === "mapper" ? "Layers" : `Fila (${updateQueue.length})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === "standings" && (
          <div className="flex flex-col h-full">
            {standings.length > 0 && (
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Lote de</span>
                  <Select value={String(batchSize)} onValueChange={v => setBatchSize(Number(v))}>
                    <SelectTrigger className="h-6 w-14 text-xs px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 10].map(n => (
                        <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <button
                  className="h-6 text-xs px-2 border border-border rounded-md hover:bg-muted transition-colors"
                  onClick={() => handleAddBatch(1)}
                >
                  Próximos {batchSize}
                </button>
                <button
                  className="h-6 text-xs px-2 border border-border rounded-md hover:bg-muted transition-colors"
                  onClick={handleAddAll}
                >
                  Todos
                </button>
              </div>
            )}
            <StandingsTable
              standings={standings}
              isLoading={isLoading}
              error={error}
              batchSize={batchSize}
              onAddTeam={handleAddToQueue}
              onAddBatch={handleAddBatch}
              queuedPositions={updateQueue.map(t => t.position)}
            />
          </div>
        )}

        {activeTab === "mapper" && (
          <LayerMapper
            layerMappings={layerMappings}
            onReadLayers={handleReadLayers}
            onUpdateMappings={setLayerMappings}
            standingsCount={standings.length}
            isPhotopea={isPhotopea}
          />
        )}

        {activeTab === "queue" && (
          <UpdateQueue
            queue={updateQueue}
            onRemove={handleRemoveFromQueue}
            onClear={handleClearQueue}
            onApply={handleApplyUpdates}
            isUpdating={isUpdating}
          />
        )}
      </div>
    </div>
  );
}
