import { CanDeactivateFn } from '@angular/router';

export interface LeaveAware {
  canLeave(): boolean | Promise<boolean>;
}

/** Warns before leaving a running assessment (administration must be continuous). */
export const leaveAssessmentGuard: CanDeactivateFn<LeaveAware> = (component) => component.canLeave();
