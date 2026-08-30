export type Permission='internet.search'|'deepweb.connect'|'satellite.read'|'seismic.read'|'weather.read'|'memory.write'|'analysis.run';
export interface PermissionState {permission:Permission; granted:boolean; reason:string;}
export const defaultPermissions:PermissionState[]=[
 {permission:'internet.search',granted:true,reason:'Fuentes públicas'},
 {permission:'deepweb.connect',granted:false,reason:'Requiere conector y autorización explícita'},
 {permission:'satellite.read',granted:false,reason:'Requiere servicio/API autorizado'},
 {permission:'seismic.read',granted:true,reason:'Módulo preparado para datos verificables'},
 {permission:'weather.read',granted:true,reason:'Módulo preparado para datos verificables'},
 {permission:'memory.write',granted:true,reason:'Memoria local del navegador'},
 {permission:'analysis.run',granted:true,reason:'Núcleo de análisis local'},
];
export function isAllowed(permission:Permission,state=defaultPermissions){return state.some(x=>x.permission===permission&&x.granted)}
