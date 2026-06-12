import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import dayjs from 'dayjs'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateCN(d: Date): string {
  if (!d || isNaN(d.getTime())) return ''
  return dayjs(d).format('YYYY年MM月DD日 HH:mm')
}
