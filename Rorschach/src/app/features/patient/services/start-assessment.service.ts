import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AssessmentsApi } from '@core/api/assessments-api.service';

/** Creates (or resumes the open) session with a psychologist, then enters focus mode. */
@Injectable({ providedIn: 'root' })
export class StartAssessmentService {
  private readonly api = inject(AssessmentsApi);
  private readonly router = inject(Router);

  /** psychologist_id currently being started, for button spinners. */
  readonly pending = signal<string | null>(null);

  start(psychologistId: string): void {
    this.pending.set(psychologistId);
    this.api.create(psychologistId).subscribe({
      next: (s) => {
        this.pending.set(null);
        void this.router.navigate(['/assessment', s.id]);
      },
      error: () => this.pending.set(null),
    });
  }
}
