export type NetworkCapability='public-web'|'public-satellite-data'|'restricted-network'|'satellite-control';
export const IAC33_NETWORK_POLICY:Record<NetworkCapability,{enabled:boolean;reason:string}>={
 'public-web':{enabled:true,reason:'Fuentes públicas accesibles mediante conectores autorizados.'},
 'public-satellite-data':{enabled:true,reason:'Datos satelitales públicos de observación.'},
 'restricted-network':{enabled:false,reason:'No se habilita acceso a redes privadas o restringidas.'},
 'satellite-control':{enabled:false,reason:'No se habilita control de satélites o infraestructura.'},
};
