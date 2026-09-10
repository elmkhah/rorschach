import { Routes } from '@angular/router';
import { leaveAssessmentGuard } from './guards/leave-assessment.guard';

export const ASSESSMENT_ROUTES: Routes = [
  {
    path: ':sessionId',
    title: 'آزمون رورشاخ',
    canDeactivate: [leaveAssessmentGuard],
    loadComponent: () => import('./pages/assessment-runner.page').then((m) => m.AssessmentRunnerPage),
  },
  { path: '', pathMatch: 'full', redirectTo: '/patient/assessments' },
];
