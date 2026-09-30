import type { components, paths } from '@tidal-music/api';
export type TidalOpenApiPaths = paths;
export type TidalOpenApiComponents = components;
export type EntityKind = 'tracks' | 'albums' | 'artists' | 'playlists' | 'videos';
export interface Principal { grantId?: string; subject: string; clientId: string; scopes: ('tidal:read'|'tidal:write')[]; local?: boolean }
export interface ResourceIdentifier { type: string; id: string; meta?: Record<string,unknown> }
export interface JsonApiResource extends ResourceIdentifier { attributes?: Record<string,unknown>; relationships?: Record<string,{data?:ResourceIdentifier|ResourceIdentifier[]|null;links?:Record<string,unknown>}> }
export interface JsonApiDocument { data: JsonApiResource|JsonApiResource[]|null; included?: JsonApiResource[]; links?: Record<string,unknown>; meta?: Record<string,unknown> }
export interface NormalizedItem { type: string; id: string; title: string; artists: string[]; duration?: string; explicit: boolean; url?: string; imageUrl?: string; occurrence?: Record<string,unknown>; attributes: Record<string,unknown> }
export interface ChangePreview { planId: string; digest: string; expiresAt: string; action: string; method: string; path: string; body?: unknown; warning: string }
export type ToolEnvelope = {ok:true; requestId:string; data:Record<string,unknown>} | {ok:false;requestId:string;error:{code:string;message:string;details?:Record<string,unknown>}};
