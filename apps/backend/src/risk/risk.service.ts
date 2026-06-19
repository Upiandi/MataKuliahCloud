import { Injectable } from '@nestjs/common';
import { assessVitals, deriveAlerts, RiskResult, DerivedAlert, VitalsInput } from './risk.engine';

/** Thin injectable wrapper around the pure risk engine. */
@Injectable()
export class RiskService {
  assess(vitals: VitalsInput): RiskResult {
    return assessVitals(vitals);
  }

  alertsFor(vitals: VitalsInput, result: RiskResult): DerivedAlert[] {
    return deriveAlerts(vitals, result);
  }
}
