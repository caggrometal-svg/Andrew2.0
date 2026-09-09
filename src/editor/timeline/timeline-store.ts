import { useSyncExternalStore } from "react";
import type { ManagedAsset, SerializableTimelineState, TimelineClip, TimelineState, TimelineStoreContract, TimelineTrack, UUID } from "../types/andrew-core";

type Listener = () => void;
const makeId=():UUID=>crypto.randomUUID();
const firstTrack=():TimelineTrack=>({id:makeId(),name:"Video 1",order:0,muted:false,locked:false,visible:true});
let state:TimelineState={tracks:[firstTrack()],clips:[],currentTime:0,duration:0,fps:30,playing:false,loop:false,zoom:1};
let assetsMap:Record<UUID,ManagedAsset>={};
const listeners=new Set<Listener>();
const emit=():void=>{for(const listener of listeners)listener();};
const clamp=(n:number,min:number,max:number):number=>Math.min(max,Math.max(min,n));
const recalc=():number=>state.clips.reduce((m,c)=>Math.max(m,c.start+c.duration),0);
const api:TimelineStoreContract={
  get tracks(){return state.tracks},get clips(){return state.clips},get selectedClipId(){return state.selectedClipId},get selectedTrackId(){return state.selectedTrackId},get currentTime(){return state.currentTime},get duration(){return state.duration},get fps(){return state.fps},get playing(){return state.playing},get loop(){return state.loop},get zoom(){return state.zoom},get assetsMap(){return assetsMap},
  addTrack(partial={}){const id=partial.id??makeId();const track:TimelineTrack={id,name:partial.name??`Pista ${state.tracks.length+1}`,order:partial.order??state.tracks.length,muted:partial.muted??false,locked:partial.locked??false,visible:partial.visible??true};state={...state,tracks:[...state.tracks,track]};emit();return id;},
  removeTrack(id){if(state.tracks.length<=1)return;const fallback=state.tracks.find(t=>t.id!==id);state={...state,tracks:state.tracks.filter(t=>t.id!==id),clips:state.clips.map(c=>c.trackId===id&&fallback?{...c,trackId:fallback.id}:c)};emit();},
  updateTrack(id,patch){state={...state,tracks:state.tracks.map(t=>t.id===id?{...t,...patch}:t)};emit();},
  reorderTrack(id,order){const target=state.tracks.find(t=>t.id===id);if(!target)return;const next=state.tracks.map(t=>t.id===id?{...t,order:Math.max(0,Math.floor(order))}:t).sort((a,b)=>a.order-b.order).map((t,i)=>({...t,order:i}));state={...state,tracks:next};emit();},
  addClip(clip){const id=clip.id??makeId();const next:TimelineClip={...clip,id,start:Math.max(0,clip.start),duration:Math.max(.001,clip.duration),speed:Math.max(.01,clip.speed),volume:clamp(clip.volume,0,1)};state={...state,clips:[...state.clips,next],duration:Math.max(state.duration,next.start+next.duration),selectedClipId:id};emit();return id;},
  removeClip(id){state={...state,clips:state.clips.filter(c=>c.id!==id),selectedClipId:state.selectedClipId===id?undefined:state.selectedClipId};state={...state,duration:recalc()};emit();},
  updateClip(id,patch){const clips=state.clips.map(c=>c.id===id?{...c,...patch,start:Math.max(0,patch.start??c.start),duration:Math.max(.001,patch.duration??c.duration),speed:Math.max(.01,patch.speed??c.speed),volume:clamp(patch.volume??c.volume,0,1)}:c);state={...state,clips,duration:recalc()};emit();},
  moveClip(id,start,trackId){const patch:Partial<TimelineClip>={start:Math.max(0,start)};if(trackId)patch.trackId=trackId;api.updateClip(id,patch);},
  seek(time){api.setCurrentTime(time);},setCurrentTime(time){state={...state,currentTime:clamp(time,0,state.duration)};emit();},setDuration(duration){const d=Math.max(0,duration);state={...state,duration:d,currentTime:clamp(state.currentTime,0,d)};emit();},setFPS(fps){state={...state,fps:clamp(Math.round(fps),1,240)};emit();},togglePlay(){state={...state,playing:!state.playing};emit();},setPlaying(playing){state={...state,playing};emit();},setLoop(loop){state={...state,loop};emit();},setZoom(zoom){state={...state,zoom:clamp(zoom,.1,20)};emit();},selectClip(id){state={...state,selectedClipId:id};emit();},selectTrack(id){state={...state,selectedTrackId:id};emit();},clear(){state={tracks:[firstTrack()],clips:[],currentTime:0,duration:0,fps:30,playing:false,loop:false,zoom:1};emit();},load(next){state={...next,playing:false};emit();},
  setAsset(asset){assetsMap={...assetsMap,[asset.id]:asset};emit();},removeAsset(id){const next={...assetsMap};delete next[id];assetsMap=next;state={...state,clips:state.clips.filter(c=>c.assetId!==id),duration:recalc()};emit();},
  getSerializableTimelineState(){return JSON.parse(JSON.stringify({...state,playing:false})) as SerializableTimelineState;}
};

const subscribe=(listener:Listener):()=>void=>{listeners.add(listener);return()=>listeners.delete(listener);};
export const useTimelineStore=Object.assign(()=>useSyncExternalStore(subscribe,()=>api,()=>api),{getState:():TimelineStoreContract=>api,subscribe});
export default useTimelineStore;
