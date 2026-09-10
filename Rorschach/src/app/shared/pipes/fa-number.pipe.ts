import { Pipe, PipeTransform } from '@angular/core';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toFaDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Numbers → Persian digits with grouping; strings → digits replaced. */
@Pipe({ name: 'faNumber' })
export class FaNumberPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    return typeof value === 'number' ? value.toLocaleString('fa-IR') : toFaDigits(value);
  }
}
