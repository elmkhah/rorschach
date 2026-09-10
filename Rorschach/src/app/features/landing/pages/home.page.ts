import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FaNumberPipe } from '@shared/pipes/fa-number.pipe';
import { IconComponent } from '@shared/ui/icon.component';
import { ImageSlotComponent } from '@shared/ui/image-slot.component';
import { IMAGES } from '@shared/utils/images';

@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ImageSlotComponent, FaNumberPipe],
  template: `
    <!-- Hero -->
    <section class="mx-auto max-w-6xl px-4 pt-5">
      <div class="grid gap-4 lg:grid-cols-2">
        <div class="flex flex-col gap-4">
          <div class="px-2 pt-4 pb-2 lg:pt-8">
            <h1 class="text-4xl leading-[1.3] font-black lg:text-[3.25rem]">
              سنجش روان‌شناختی
              <br />
              آنلاین و امن
              <span class="text-secondary block">آزمون رورشاخ</span>
            </h1>
            <p class="text-base-content/60 mt-4 max-w-md leading-8">
              آزمون را در محیطی آرام و بدون حواس‌پرتی انجام دهید؛ نتیجه فقط در اختیار روان‌شناسی قرار می‌گیرد که خودتان
              انتخاب کرده‌اید.
            </p>
          </div>

          <div class="grid flex-1 grid-cols-2 gap-4">
            @for (t of topics; track t) {
              <a routerLink="/register/patient" class="glass-card group flex min-h-36 flex-col justify-between rounded-box p-5">
                <span class="text-lg leading-7 font-extrabold">{{ t }}</span>
                <span
                  class="bg-base-100/35 border-base-100/60 group-hover:bg-neutral group-hover:text-neutral-content grid size-9 place-items-center self-end rounded-full border backdrop-blur-md transition"
                >
                  <app-icon name="plus" [size]="16" />
                </span>
              </a>
            }
            <a routerLink="/register/patient" class="bg-secondary text-secondary-content flex min-h-36 flex-col justify-between rounded-box p-5">
              <span class="text-xl leading-8 font-extrabold">ثبت‌نام رایگان و شروع آزمون</span>
              <span class="bg-base-100 text-base-content grid size-10 place-items-center self-end rounded-full">
                <app-icon name="arrow-right" [size]="18" />
              </span>
            </a>
          </div>
        </div>

        <div class="bg-base-200 relative min-h-[34rem] overflow-hidden rounded-box">
          <app-image-slot class="absolute inset-0" [src]="img.landingHero.src" [hint]="img.landingHero.hint" alt="روان‌شناس" />
          <span class="glass-card absolute start-5 top-5 inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold">
            ★ {{ '4.9' | faNumber }} از ۵
          </span>
          <div class="absolute inset-x-5 bottom-5 grid grid-cols-2 gap-3">
            <div class="bg-base-100 flex min-h-32 flex-col justify-between rounded-[1.25rem] p-4">
              <span class="leading-7 font-extrabold">حریم خصوصی کامل</span>
              <span class="border-base-300 grid size-8 place-items-center self-end rounded-full border"><app-icon name="lock" [size]="14" /></span>
            </div>
            <div class="glass-card flex min-h-32 flex-col justify-between rounded-[1.25rem] p-4">
              <span class="leading-7 font-extrabold">نتیجه فقط نزد روان‌شناس شما</span>
              <span class="bg-base-100/70 grid size-8 place-items-center self-end rounded-full"><app-icon name="shield" [size]="14" /></span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- About / Method -->
    <section class="mx-auto max-w-6xl scroll-mt-24 px-4 pt-4" id="about">
      <div class="bg-neutral text-neutral-content grid gap-10 rounded-box p-8 lg:grid-cols-2 lg:p-12">
        <div>
          <h2 class="text-3xl font-black">درباره‌ی سامانه</h2>
          <p class="mt-5 text-sm leading-8 opacity-70">
            رورشاخ بستری برای اجرای آنلاین آزمون‌های روان‌شناختی زیر نظر روان‌شناس است. مراجع روان‌شناس خود را انتخاب
            می‌کند، پس از تأیید ارتباط آزمون را انجام می‌دهد و داده‌ها با حفظ محرمانگی کامل در اختیار روان‌شناس قرار
            می‌گیرد.
          </p>
          <a routerLink="/register" class="btn btn-sm bg-base-100 text-base-content mt-6 border-0">
            بیشتر بدانید <app-icon name="chevron-right" [size]="14" />
          </a>
        </div>
        <div id="method" class="scroll-mt-24">
          <h2 class="text-3xl font-black">درباره‌ی روش</h2>
          <p class="mt-5 text-sm leading-8 opacity-70">
            آزمون رورشاخ یک آزمون فرافکن با ده کارت لکه‌ی جوهر است. سامانه پاسخ‌ها و زمان‌بندی را به‌صورت خام و دقیق ثبت
            می‌کند؛ تفسیر بالینی تنها بر عهده‌ی روان‌شناس است و سامانه ادعای تشخیص ندارد.
          </p>
          <a routerLink="/register" class="btn btn-sm bg-base-100 text-base-content mt-6 border-0">
            بیشتر بدانید <app-icon name="chevron-right" [size]="14" />
          </a>
        </div>
      </div>
    </section>

    <!-- What you get + steps -->
    <section class="mx-auto max-w-6xl scroll-mt-24 px-4 pt-4" id="steps">
      <div class="grid gap-4 lg:grid-cols-[1fr_1.3fr_0.8fr]">
        <div class="flex items-center p-4">
          <h2 class="text-3xl leading-[1.4] font-black lg:text-4xl">با رورشاخ<br />چه به دست<br />می‌آورید؟</h2>
        </div>
        <div class="glass-card flex flex-col justify-between gap-6 rounded-box p-6">
          <p class="text-base-content/70 text-sm leading-8">
            پس از ثبت‌نام و برقراری ارتباط با روان‌شناس، آزمون را هر زمان که آماده بودید شروع می‌کنید. آزمون به روش استاندارد
            R-PAS و در یک نوبت انجام می‌شود و روان‌شناس پس از تکمیل، نتایج را بررسی می‌کند.
          </p>
          <a routerLink="/register/patient" class="btn btn-primary btn-sm w-fit">شروع کنید <app-icon name="chevron-right" [size]="14" /></a>
        </div>
        <div class="bg-secondary text-secondary-content flex flex-col items-center justify-center gap-3 rounded-box p-6 text-center">
          <span class="bg-base-100 text-base-content grid size-10 place-items-center rounded-full"><app-icon name="shield" [size]="18" /></span>
          <div class="font-extrabold">امنیت و محرمانگی</div>
          <p class="text-xs leading-6 opacity-90">دسترسی فقط برای روان‌شناسی که ارتباط فعال با شما دارد.</p>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-5">
        @for (s of steps; track s.title; let i = $index) {
          <div class="glass-card flex flex-col items-center gap-3 rounded-box p-5 text-center">
            <span class="bg-secondary text-secondary-content grid size-9 place-items-center rounded-full text-sm font-bold">
              {{ i + 1 | faNumber }}
            </span>
            <div class="font-extrabold">{{ s.title }}</div>
            <p class="text-base-content/60 text-xs leading-6">{{ s.body }}</p>
          </div>
        }
      </div>
    </section>

    <!-- For psychologists -->
    <section class="mx-auto max-w-6xl scroll-mt-24 px-4 pt-4" id="psychologists">
      <div class="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <div class="bg-base-200 relative min-h-80 overflow-hidden rounded-box">
          <app-image-slot class="absolute inset-0" [src]="img.landingPsychologist.src" [hint]="img.landingPsychologist.hint" alt="روان‌شناس" />
        </div>
        <div class="glass-card flex flex-col justify-center gap-5 rounded-box p-8">
          <h2 class="text-3xl font-black">روان‌شناس هستید؟</h2>
          <p class="text-base-content/70 leading-8">
            پس از بررسی و تأیید مدارک حرفه‌ای، مراجعان خود را مدیریت کنید، درخواست‌ها را بپذیرید و پاسخ‌های خام، اندازه‌گیری‌ها
            و گزارش هر آزمون را ببینید.
          </p>
          <div class="bg-base-100/70 text-base-content/70 rounded-[1.25rem] p-5 text-sm leading-8">
            «داده‌ی خام، زمان‌بندی دقیق و نسخه‌ی آزمون برای هر جلسه ثبت می‌شود تا تحلیل همیشه قابل پیگیری باشد.»
          </div>
          <a routerLink="/register/psychologist" class="btn btn-primary w-fit">ثبت‌نام روان‌شناس <app-icon name="chevron-right" [size]="14" /></a>
        </div>
      </div>
    </section>
  `,
})
export class HomePage {
  protected readonly img = IMAGES;

  protected readonly topics = ['انتخاب روان‌شناس تأییدشده', 'اجرای آزمون در محیط متمرکز', 'گفت‌وگوی مستقیم و امن'];

  protected readonly steps = [
    { title: 'ثبت‌نام', body: 'حساب کاربری خود را در چند دقیقه بسازید.' },
    { title: 'انتخاب روان‌شناس', body: 'از میان روان‌شناسان تأییدشده انتخاب کنید.' },
    { title: 'تأیید ارتباط', body: 'روان‌شناس درخواست شما را بررسی و تأیید می‌کند.' },
    { title: 'اجرای آزمون', body: 'آزمون را در محیطی آرام و متمرکز انجام دهید.' },
    { title: 'بررسی نتیجه', body: 'روان‌شناس نتایج را بررسی و با شما گفت‌وگو می‌کند.' },
  ];
}
