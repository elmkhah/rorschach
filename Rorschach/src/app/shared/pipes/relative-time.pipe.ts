import { Pipe, PipeTransform } from '@angular/core';

const rtf = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 30],
  ['month', 12],
  ['year', Infinity],
];

/** "۳ روز پیش". Pure: recalculated when the input changes, not on a timer. */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    let diff = (new Date(value).getTime() - Date.now()) / 1000;
    for (const [unit, size] of STEPS) {
      if (Math.abs(diff) < size) return rtf.format(Math.round(diff), unit);
      diff /= size;
    }
    return '';
  }
}
