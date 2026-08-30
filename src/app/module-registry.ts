import { IAC33_CONFIG } from './iac33-config';

export interface ModuleDefinition { id:string; label:string; enabled:boolean; description:string; }

export const moduleRegistry:ModuleDefinition[]=[
 {id:'seismicChile',label:'Sismos Chile',enabled:IAC33_CONFIG.modules.seismicChile,description:'Análisis de actividad y escenarios probabilísticos.'},
 {id:'rainfallChile',label:'Lluvias Chile',enabled:IAC33_CONFIG.modules.rainfallChile,description:'Análisis de precipitación y escenarios.'},
 {id:'globalConflict',label:'Conflictos mundiales',enabled:IAC33_CONFIG.modules.globalConflict,description:'Indicadores y escenarios geopolíticos.'},
 {id:'criticalResearch',label:'Investigación C33',enabled:IAC33_CONFIG.modules.criticalResearch,description:'Hechos, evidencia, hipótesis y contradicciones.'},
 {id:'memory',label:'Memoria',enabled:IAC33_CONFIG.modules.memory,description:'Memoria local persistente.'},
 {id:'activityAudit',label:'Actividad',enabled:IAC33_CONFIG.modules.activityAudit,description:'Registro de operaciones y trazabilidad.'},
];

export function getEnabledModules(){return moduleRegistry.filter(m=>m.enabled);}
