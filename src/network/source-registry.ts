export type SourceKind='earthquake'|'weather'|'conflict'|'satellite'|'science'|'news';
export interface SourceDefinition { id:string; name:string; kind:SourceKind; url:string; public:boolean; enabled:boolean; }

export const sourceRegistry:SourceDefinition[]=[
 {id:'usgs-earthquakes',name:'USGS Earthquakes',kind:'earthquake',url:'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',public:true,enabled:true},
 {id:'nasa-earthdata',name:'NASA Earthdata',kind:'satellite',url:'https://earthdata.nasa.gov/',public:true,enabled:true},
 {id:'nasa-api',name:'NASA APIs',kind:'science',url:'https://api.nasa.gov/',public:true,enabled:true},
];

export function sourcesFor(kind:SourceKind){return sourceRegistry.filter(s=>s.enabled&&s.kind===kind);}
export function publicSources(){return sourceRegistry.filter(s=>s.enabled&&s.public);}
