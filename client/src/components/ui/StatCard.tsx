import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: number; // percent change
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title, value, subtitle, icon: Icon,
  iconColor = 'text-primary-600', iconBg = 'bg-primary-50',
  trend, loading
}) => {
  if (loading) {
    return (
      <div className="stat-card">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-8 w-32 mb-1" />
        <div className="skeleton h-3 w-20" />
      </div>
    );
  }

  const TrendIcon = trend == null ? Minus : trend >= 0 ? TrendingUp : TrendingDown;
  const trendColor = trend == null ? 'text-gray-400' : trend >= 0 ? 'text-green-600' : 'text-red-500';

  return (
    <div className="stat-card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</p>
        <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center flex-shrink-0`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900 tracking-tight mt-2">{value}</p>
      {(subtitle || trend != null) && (
        <div className="flex items-center gap-2 mt-1">
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
          {trend != null && (
            <span className={`flex items-center gap-0.5 text-xs font-medium ${trendColor}`}>
              <TrendIcon className="w-3 h-3" />
              {Math.abs(trend).toFixed(1)}%
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default StatCard;
