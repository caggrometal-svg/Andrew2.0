export type Domain='sismos-chile'|'lluvias-chile'|'conflictos-mundiales';
export type Evidence={source:string;signal:string;reliability:number;observedAt:string};
export type DomainAssessment={domain:Domain;scenarios:Array<{name:string;score:number;confidence:number;uncertainty:number}>;methodology:string};

export function assessDomain(domain:Domain,evidence:Evidence[]):DomainAssessment{
 const valid=evidence.filter(e=>e.reliability>=0&&e.reliability<=1);
 const avg=valid.length?valid.reduce((a,e)=>a+e.reliability,0)/valid.length:0;
 const score=Math.max(0,Math.min(1,avg));
 return {domain,scenarios:[{name:'Escenario base',score,confidence:avg,uncertainty:1-avg}],methodology:'Evaluación probabilística orientativa; no constituye predicción determinista.'};
}
