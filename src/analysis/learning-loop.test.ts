import { calibrateForecasts } from './forecast-calibration';

describe('IAC33 learning calibration', () => {
  it('calculates a perfect score for a correct confident forecast', () => {
    const report = calibrateForecasts([{ predicted: 1, observed: true }]);
    expect(report.brierScore).toBe(0);
    expect(report.meanAbsoluteError).toBe(0);
    expect(report.calibrated).toBe(true);
  });

  it('marks an empty calibration set as not calibrated', () => {
    expect(calibrateForecasts([]).calibrated).toBe(false);
  });
});
