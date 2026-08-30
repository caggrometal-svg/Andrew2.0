export interface ForecastOutcome { predicted:number; observed:boolean; }
export interface CalibrationReport { samples:number; brierScore:number; meanAbsoluteError:number; calibrated:boolean; }

export function calibrateForecasts(outcomes:ForecastOutcome[]):CalibrationReport {
 if(!outcomes.length)return {samples:0,brierScore:0,meanAbsoluteError:0,calibrated:false};
 const brier=outcomes.reduce((s,o)=>s+(o.predicted-(o.observed?1:0))**2,0)/outcomes.length;
 const mae=outcomes.reduce((s,o)=>s+Math.abs(o.predicted-(o.observed?1:0)),0)/outcomes.length;
 return {samples:outcomes.length,brierScore:brier,meanAbsoluteError:mae,calibrated: brier<=0.25};
}
