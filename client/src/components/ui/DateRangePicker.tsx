import React, { useState } from 'react';
import { dateRangePresets } from '../../lib/utils';
import type { DateRange } from '../../types';
import { Calendar } from 'lucide-react';

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const presets = [
  { label: 'Today', key: 'today' as const },
  { label: 'Yesterday', key: 'yesterday' as const },
  { label: 'Last 7D', key: 'last7' as const },
  { label: 'Last 30D', key: 'last30' as const },
  { label: 'This Month', key: 'thisMonth' as const },
  { label: 'Last Month', key: 'lastMonth' as const },
  { label: 'This Year', key: 'thisYear' as const },
];

const DateRangePicker: React.FC<Props> = ({ value, onChange }) => {
  const [showCustom, setShowCustom] = useState(false);
  const p = dateRangePresets();

  const applyPreset = (key: keyof typeof p) => {
    onChange(p[key]);
    setShowCustom(false);
  };

  const isActive = (key: keyof typeof p) =>
    p[key].startDate === value.startDate && p[key].endDate === value.endDate;

  return (
    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
      {presets.map(({ label, key }) => (
        <button
          key={key}
          onClick={() => applyPreset(key)}
          className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-lg border transition-all ${
            isActive(key)
              ? 'bg-primary-600 text-white border-primary-600'
              : 'border-gray-200 text-gray-600 hover:border-primary-300 hover:text-primary-600 bg-white'
          }`}
        >
          {label}
        </button>
      ))}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-lg border transition-all ${
          showCustom ? 'bg-primary-600 text-white border-primary-600' : 'border-gray-200 text-gray-600 hover:border-primary-300 bg-white'
        }`}
      >
        <Calendar className="w-3 h-3" />
        Custom
      </button>
      {showCustom && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={value.endDate}
            min={value.startDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      )}
    </div>
  );
};

export default DateRangePicker;
