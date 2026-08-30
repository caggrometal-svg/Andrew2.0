export interface SeismicEvent { latitude:number; longitude:number; magnitude:number; depthKm:number; timestamp:string; }
export interface SeismicForecast { region:string; windowDays:number; eventCount:number; magnitudeRate:number; activityIndex:number; scenarios:{label:string; probability:number}[]; limitations:string[]; }

export function regionalSeismicForecast(region:string, events:SeismicEvent[], windowDays=30):SeismicForecast {
 const recent=events.filter(e=>Date.now()-Date.parse(e.timestamp)<=windowDays*86400000);
 const magnitudeRate=recent.length/windowDays;
 const activityIndex=Math.min(1,recent.reduce((s,e)=>s+Math.max(0,e.magnitude-2),0)/Math.max(1,recent.length*4));
 const elevated=Math.min(.9,.15+.55*activityIndex+.15*Math.min(1,magnitudeRate/2));
 const baseline=1-elevated;
 return {region,windowDays,eventCount:recent.length,magnitudeRate,activityIndex,scenarios:[
  {label:'actividad dentro del rango observado',probability:baseline},
  {label:'actividad elevada respecto del historial reciente',probability:elevated}
 ],limitations:['Modelo exploratorio basado en actividad registrada; no predice terremotos individuales.','Para estimaciones regionales robustas se requiere una serie histórica completa y datos de una red sísmica confiable.']};
}
