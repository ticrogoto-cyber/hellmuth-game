// Karten-Liste fuer das Skirmish-Setup. Quelle: data/maps/index.json,
// erweiterbar ohne Code-Aenderung (Vite buendelt das JSON zur Buildzeit).
import mapsIndex from "../../data/maps/index.json";

export interface MapDef {
  id: string;
  name: string;
  thumbnail: string;
  description: string;
  size: string;
  max_players: number;
}

interface MapsIndex {
  maps: MapDef[];
}

export function loadMaps(): MapDef[] {
  return (mapsIndex as MapsIndex).maps ?? [];
}

/** Thumbnail-URL: Pfad relativ zu public/sprites/ (Konvention wie Florilegium). */
export function mapThumbUrl(map: MapDef): string {
  return `${import.meta.env.BASE_URL || "/"}sprites/${map.thumbnail}`.replace(/\/+/g, "/");
}
