import { getDashboardModel } from './dashboard-model';
import { analyzeCritically } from '../analysis/critical-engine';
import { logActivity } from '../core/activity-log';

export interface IAC33AppState { activeModule:string; query:string; status:'ready'|'analyzing'; lastAnalysis?:ReturnType<typeof analyzeCritically>; }

export function createIAC33App():IAC33AppState { return {activeModule:'overview',query:'',status:'ready'}; }

export function runAnalysis(state:IAC33AppState, question:string):IAC33AppState {
  const result=analyzeCritically({question,evidence:[],candidateConclusion:'Datos insuficientes: se requiere evidencia verificable.',alternatives:['Hipótesis alternativa pendiente de evidencia.']});
  logActivity({type:'analysis',action:'critical-analysis',details:{question}});
  return {...state,query:question,status:'ready',lastAnalysis:result};
}

export function getAppConfig(){return getDashboardModel();}
