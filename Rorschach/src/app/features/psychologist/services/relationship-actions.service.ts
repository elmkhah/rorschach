import { inject, Injectable } from '@angular/core';
import { RelationshipsApi } from '@core/api/relationships-api.service';
import { Relationship } from '@core/models';
import { ToastService } from '@core/services/toast.service';
import { ConfirmService } from '@shared/ui/confirm-dialog';
import { fullName } from '@shared/utils/names';
import { firstValueFrom } from 'rxjs';

/** Approve / reject / revoke with confirmation + toast. Resolves true when the change was made. */
@Injectable({ providedIn: 'root' })
export class RelationshipActions {
  private readonly api = inject(RelationshipsApi);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  async approve(r: Relationship): Promise<boolean> {
    await firstValueFrom(this.api.approve(r.id));
    this.toast.success(`ارتباط با ${fullName(r.patient)} فعال شد.`);
    return true;
  }

  async reject(r: Relationship): Promise<boolean> {
    const ok = await this.confirm.confirm({
      title: 'رد درخواست',
      message: `درخواست ${fullName(r.patient)} رد شود؟`,
      confirmText: 'رد درخواست',
      danger: true,
    });
    if (!ok) return false;
    await firstValueFrom(this.api.reject(r.id));
    this.toast.success('درخواست رد شد.');
    return true;
  }

  async revoke(r: Relationship): Promise<boolean> {
    const ok = await this.confirm.confirm({
      title: 'قطع ارتباط',
      message: `با قطع ارتباط، دسترسی شما به داده‌های ${fullName(r.patient)} متوقف می‌شود. ادامه می‌دهید؟`,
      confirmText: 'قطع ارتباط',
      danger: true,
    });
    if (!ok) return false;
    await firstValueFrom(this.api.revoke(r.id));
    this.toast.success('ارتباط قطع شد.');
    return true;
  }
}
