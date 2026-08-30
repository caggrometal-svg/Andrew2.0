export type ScenarioInput={signal:string; evidence:number; baseRate:number; recency:number; reliability:number};
export type ScenarioResult={score:number; confidence:number; uncertainty:number; label:'bajo'|'moderado'|'alto'};

const clamp=(n:number)=>Math.max(0,Math.min(1,n));

export function scoreScenario(input:ScenarioInput):ScenarioResult{
  const score=clamp(input.baseRate*0.35+input.evidence*0.35+input.recency*0.15+input.reliability*0.15);
  const confidence=clamp((input.evidence+input.reliability)/2);
  const uncertainty=1-confidence;
  const label=score>=0.67?'alto':score>=0.34?'moderado':'bajo';
  return {score,confidence,uncertainty,label};
}

export function compareScenarios(inputs:ScenarioInput[]){
  return inputs.map(input=>({input,result:scoreScenario(input)})).sort((a,b)=>b.result.score-a.result.score);
}
