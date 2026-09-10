import { Pipe, PipeTransform } from '@angular/core';

const FORMATS: Record<string, Intl.DateTimeFormatOptions> = {
  short: { year: 'numeric', month: '2-digit', day: '2-digit' },
  long: { year: 'numeric', month: 'long', day: 'numeric' },
  datetime: { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  time: { hour: '2-digit', minute: '2-digit' },
};

const cache = new Map<string, Intl.DateTimeFormat>();

/** ISO date → Solar Hijri (شمسی) with Persian digits. */
@Pipe({ name: 'jalaliDate' })
export class JalaliDatePipe implements PipeTransform {
  transform(value: string | Date | null | undefined, format: keyof typeof FORMATS = 'long'): string {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    let fmt = cache.get(format);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('fa-IR-u-ca-persian', FORMATS[format]);
      cache.set(format, fmt);
    }
    return fmt.format(date);
  }
}
