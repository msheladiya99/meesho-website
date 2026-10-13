// Currency helpers — all amounts stored in paise (integer)

export const paiseToRupees = (paise: number): number => paise / 100;

export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

export const formatCurrency = (paise: number): string => {
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
};

export const formatNumber = (n: number): string =>
  new Intl.NumberFormat('en-IN').format(n);

export const formatPercent = (n: number, decimals = 1): string =>
  `${n.toFixed(decimals)}%`;

// Date helpers
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

export const TZ = 'Asia/Kolkata';

export const now = () => dayjs().tz(TZ);

export const today = () => dayjs().tz(TZ).format('YYYY-MM-DD');

export const formatDate = (date: string | Date) =>
  dayjs(date).tz(TZ).format('DD MMM YYYY');

export const formatDateTime = (date: string | Date) =>
  dayjs(date).tz(TZ).format('DD MMM YYYY, hh:mm A');

export const startOfDay = (date: string) =>
  dayjs.tz(date, TZ).startOf('day').toISOString();

export const endOfDay = (date: string) =>
  dayjs.tz(date, TZ).endOf('day').toISOString();

export const dateRangePresets = () => {
  const d = dayjs().tz(TZ);
  return {
    today: { startDate: d.format('YYYY-MM-DD'), endDate: d.format('YYYY-MM-DD') },
    yesterday: {
      startDate: d.subtract(1, 'day').format('YYYY-MM-DD'),
      endDate: d.subtract(1, 'day').format('YYYY-MM-DD'),
    },
    last7: {
      startDate: d.subtract(6, 'day').format('YYYY-MM-DD'),
      endDate: d.format('YYYY-MM-DD'),
    },
    last30: {
      startDate: d.subtract(29, 'day').format('YYYY-MM-DD'),
      endDate: d.format('YYYY-MM-DD'),
    },
    thisMonth: {
      startDate: d.startOf('month').format('YYYY-MM-DD'),
      endDate: d.endOf('month').format('YYYY-MM-DD'),
    },
    lastMonth: {
      startDate: d.subtract(1, 'month').startOf('month').format('YYYY-MM-DD'),
      endDate: d.subtract(1, 'month').endOf('month').format('YYYY-MM-DD'),
    },
    thisYear: {
      startDate: d.startOf('year').format('YYYY-MM-DD'),
      endDate: d.endOf('year').format('YYYY-MM-DD'),
    },
  };
};
