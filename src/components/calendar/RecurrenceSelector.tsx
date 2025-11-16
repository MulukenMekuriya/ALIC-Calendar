import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Repeat, Calendar, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface RecurrenceConfig {
  frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc.
  dayOfMonth?: number;
  monthOfYear?: number;
  endType: 'never' | 'on' | 'after';
  endDate?: string;
  occurrences?: number;
}

interface RecurrenceSelectorProps {
  value: RecurrenceConfig;
  onChange: (config: RecurrenceConfig) => void;
  startDate?: string;
}

const DAYS_OF_WEEK = [
  { label: 'S', fullLabel: 'Sunday', value: 0 },
  { label: 'M', fullLabel: 'Monday', value: 1 },
  { label: 'T', fullLabel: 'Tuesday', value: 2 },
  { label: 'W', fullLabel: 'Wednesday', value: 3 },
  { label: 'T', fullLabel: 'Thursday', value: 4 },
  { label: 'F', fullLabel: 'Friday', value: 5 },
  { label: 'S', fullLabel: 'Saturday', value: 6 },
];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const RecurrenceSelector: React.FC<RecurrenceSelectorProps> = ({
  value,
  onChange,
  startDate,
}) => {
  const [isExpanded, setIsExpanded] = useState(value.frequency !== 'none');

  const updateConfig = (updates: Partial<RecurrenceConfig>) => {
    onChange({ ...value, ...updates });
  };

  const toggleDayOfWeek = (day: number) => {
    const currentDays = value.daysOfWeek || [];
    const newDays = currentDays.includes(day)
      ? currentDays.filter(d => d !== day)
      : [...currentDays, day].sort((a, b) => a - b);
    updateConfig({ daysOfWeek: newDays });
  };

  // Set default days of week based on start date when switching to weekly
  useEffect(() => {
    if (value.frequency === 'weekly' && (!value.daysOfWeek || value.daysOfWeek.length === 0) && startDate) {
      const startDay = new Date(startDate).getDay();
      updateConfig({ daysOfWeek: [startDay] });
    }
  }, [value.frequency, startDate]);

  // Update expanded state when frequency changes
  useEffect(() => {
    setIsExpanded(value.frequency !== 'none');
  }, [value.frequency]);

  const handleFrequencyChange = (freq: string) => {
    const newFreq = freq as RecurrenceConfig['frequency'];

    if (newFreq === 'none') {
      updateConfig({
        frequency: 'none',
        interval: 1,
        endType: 'never',
        daysOfWeek: undefined,
        dayOfMonth: undefined,
        monthOfYear: undefined,
        endDate: undefined,
        occurrences: undefined,
      });
    } else {
      updateConfig({
        frequency: newFreq,
        interval: 1,
        endType: 'never',
        daysOfWeek: newFreq === 'weekly' && startDate ? [new Date(startDate).getDay()] : undefined,
        dayOfMonth: (newFreq === 'monthly' || newFreq === 'yearly') && startDate ? new Date(startDate).getDate() : undefined,
        monthOfYear: newFreq === 'yearly' && startDate ? new Date(startDate).getMonth() + 1 : undefined,
      });
    }
  };

  // Simple view when not recurring
  if (value.frequency === 'none') {
    return (
      <div className="space-y-2">
        <Label htmlFor="recurrence" className="text-sm font-medium">
          Recurrence
        </Label>
        <Select value={value.frequency} onValueChange={handleFrequencyChange}>
          <SelectTrigger id="recurrence" className="h-10">
            <SelectValue placeholder="Does not repeat" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Does not repeat</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  // Enhanced view for recurring events
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Repeat className="h-4 w-4 text-primary" />
          <Label className="text-sm font-semibold">Recurring Event</Label>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => handleFrequencyChange('none')}
          className="h-8 px-2 text-xs hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3 w-3 mr-1" />
          Remove
        </Button>
      </div>

      <div className="space-y-4 p-4 border rounded-lg bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm">
        {/* Frequency & Interval */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="freq-select" className="text-xs font-medium text-muted-foreground">
              Repeats
            </Label>
            <Select value={value.frequency} onValueChange={handleFrequencyChange}>
              <SelectTrigger id="freq-select" className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="interval" className="text-xs font-medium text-muted-foreground">
              Every
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="interval"
                type="number"
                min="1"
                max="99"
                value={value.interval}
                onChange={(e) => updateConfig({ interval: Math.max(1, parseInt(e.target.value) || 1) })}
                className="h-9 bg-background"
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {value.frequency === 'daily' && (value.interval === 1 ? 'day' : 'days')}
                {value.frequency === 'weekly' && (value.interval === 1 ? 'week' : 'weeks')}
                {value.frequency === 'monthly' && (value.interval === 1 ? 'month' : 'months')}
                {value.frequency === 'yearly' && (value.interval === 1 ? 'year' : 'years')}
              </span>
            </div>
          </div>
        </div>

        {/* Weekly: Days of Week Selector */}
        {value.frequency === 'weekly' && (
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              Repeat on
            </Label>
            <div className="grid grid-cols-7 gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = (value.daysOfWeek || []).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDayOfWeek(day.value)}
                    title={day.fullLabel}
                    className={cn(
                      "h-9 rounded-md flex items-center justify-center text-xs font-semibold transition-all duration-200",
                      "border-2 hover:scale-105 active:scale-95",
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-md"
                        : "bg-background border-border hover:border-primary/50 hover:bg-primary/5"
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            {(!value.daysOfWeek || value.daysOfWeek.length === 0) && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-1">
                <span className="w-1 h-1 rounded-full bg-destructive"></span>
                Please select at least one day
              </p>
            )}
          </div>
        )}

        {/* Monthly: Day of Month */}
        {value.frequency === 'monthly' && (
          <div className="space-y-2">
            <Label htmlFor="dayOfMonth" className="text-xs font-medium text-muted-foreground">
              Day of month
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="dayOfMonth"
                type="number"
                min="1"
                max="31"
                value={value.dayOfMonth || 1}
                onChange={(e) => updateConfig({ dayOfMonth: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
                className="w-20 h-9 bg-background"
              />
              <span className="text-xs text-muted-foreground">
                (1-31)
              </span>
            </div>
          </div>
        )}

        {/* Yearly: Month & Day Selection */}
        {value.frequency === 'yearly' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="monthOfYear" className="text-xs font-medium text-muted-foreground">
                Month
              </Label>
              <Select
                value={String(value.monthOfYear || 1)}
                onValueChange={(month) => updateConfig({ monthOfYear: parseInt(month) })}
              >
                <SelectTrigger id="monthOfYear" className="h-9 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[200px]">
                  {MONTHS.map((month, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearDayOfMonth" className="text-xs font-medium text-muted-foreground">
                Day
              </Label>
              <Input
                id="yearDayOfMonth"
                type="number"
                min="1"
                max="31"
                value={value.dayOfMonth || 1}
                onChange={(e) => updateConfig({ dayOfMonth: Math.min(31, Math.max(1, parseInt(e.target.value) || 1)) })}
                className="h-9 bg-background"
              />
            </div>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-border/50"></div>

        {/* End Conditions */}
        <div className="space-y-3">
          <Label className="text-xs font-medium text-muted-foreground">
            Ends
          </Label>
          <RadioGroup
            value={value.endType}
            onValueChange={(endType) => updateConfig({ endType: endType as RecurrenceConfig['endType'] })}
            className="space-y-2"
          >
            {/* Never */}
            <div className={cn(
              "flex items-center space-x-3 p-2.5 rounded-md transition-all",
              value.endType === 'never' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
            )}>
              <RadioGroupItem value="never" id="never" className="mt-0" />
              <Label htmlFor="never" className="flex-1 font-normal cursor-pointer text-sm">
                Never
              </Label>
            </div>

            {/* On specific date */}
            <div className={cn(
              "flex items-center space-x-3 p-2.5 rounded-md transition-all",
              value.endType === 'on' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
            )}>
              <RadioGroupItem value="on" id="on" className="mt-0" />
              <div className="flex-1 flex items-center gap-2">
                <Label htmlFor="on" className="font-normal cursor-pointer text-sm">
                  On
                </Label>
                <div className="relative flex-1">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="date"
                    value={value.endDate || ''}
                    onChange={(e) => updateConfig({ endDate: e.target.value, endType: 'on' })}
                    onClick={() => updateConfig({ endType: 'on' })}
                    min={startDate}
                    className={cn(
                      "h-8 pl-8 text-xs bg-background",
                      value.endType !== 'on' && "opacity-50"
                    )}
                    disabled={value.endType !== 'on'}
                  />
                </div>
              </div>
            </div>

            {/* After N occurrences */}
            <div className={cn(
              "flex items-center space-x-3 p-2.5 rounded-md transition-all",
              value.endType === 'after' ? 'bg-background shadow-sm' : 'hover:bg-background/50'
            )}>
              <RadioGroupItem value="after" id="after" className="mt-0" />
              <div className="flex-1 flex items-center gap-2">
                <Label htmlFor="after" className="font-normal cursor-pointer text-sm">
                  After
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="999"
                  value={value.occurrences || 1}
                  onChange={(e) => updateConfig({ occurrences: Math.max(1, parseInt(e.target.value) || 1), endType: 'after' })}
                  onClick={() => updateConfig({ endType: 'after' })}
                  className={cn(
                    "h-8 w-16 text-xs bg-background",
                    value.endType !== 'after' && "opacity-50"
                  )}
                  disabled={value.endType !== 'after'}
                />
                <span className="text-xs text-muted-foreground">times</span>
              </div>
            </div>
          </RadioGroup>
        </div>

        {/* Summary */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <div className="flex items-start gap-2 p-3 rounded-md bg-background/80 backdrop-blur-sm">
            <Repeat className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-muted-foreground mb-1">Summary</p>
              <p className="text-sm text-foreground leading-relaxed">
                {getRecurrenceSummary(value)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to generate human-readable summary
function getRecurrenceSummary(config: RecurrenceConfig): string {
  if (config.frequency === 'none') return 'Does not repeat';

  let summary = `Repeats every ${config.interval > 1 ? config.interval + ' ' : ''}`;

  switch (config.frequency) {
    case 'daily':
      summary += config.interval === 1 ? 'day' : 'days';
      break;
    case 'weekly':
      summary += config.interval === 1 ? 'week' : 'weeks';
      if (config.daysOfWeek && config.daysOfWeek.length > 0) {
        const dayNames = config.daysOfWeek.map(d => DAYS_OF_WEEK[d].fullLabel).join(', ');
        summary += ` on ${dayNames}`;
      }
      break;
    case 'monthly':
      summary += config.interval === 1 ? 'month' : 'months';
      if (config.dayOfMonth) {
        const suffix = getDaySuffix(config.dayOfMonth);
        summary += ` on the ${config.dayOfMonth}${suffix}`;
      }
      break;
    case 'yearly':
      summary += config.interval === 1 ? 'year' : 'years';
      if (config.monthOfYear && config.dayOfMonth) {
        const suffix = getDaySuffix(config.dayOfMonth);
        summary += ` on ${MONTHS[config.monthOfYear - 1]} ${config.dayOfMonth}${suffix}`;
      }
      break;
  }

  if (config.endType === 'on' && config.endDate) {
    const date = new Date(config.endDate);
    summary += `, until ${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  } else if (config.endType === 'after' && config.occurrences) {
    summary += `, for ${config.occurrences} occurrence${config.occurrences > 1 ? 's' : ''}`;
  }

  return summary;
}

// Helper to get day suffix (st, nd, rd, th)
function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

// Helper function to convert RecurrenceConfig to RRULE string
export function recurrenceConfigToRRule(config: RecurrenceConfig, startDate: Date): string | null {
  if (config.frequency === 'none') return null;

  const parts: string[] = [];

  // Frequency
  parts.push(`FREQ=${config.frequency.toUpperCase()}`);

  // Interval
  if (config.interval > 1) {
    parts.push(`INTERVAL=${config.interval}`);
  }

  // Days of week (for weekly)
  if (config.frequency === 'weekly' && config.daysOfWeek && config.daysOfWeek.length > 0) {
    const dayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const days = config.daysOfWeek.map(d => dayMap[d]).join(',');
    parts.push(`BYDAY=${days}`);
  }

  // Day of month (for monthly/yearly)
  if ((config.frequency === 'monthly' || config.frequency === 'yearly') && config.dayOfMonth) {
    parts.push(`BYMONTHDAY=${config.dayOfMonth}`);
  }

  // Month of year (for yearly)
  if (config.frequency === 'yearly' && config.monthOfYear) {
    parts.push(`BYMONTH=${config.monthOfYear}`);
  }

  // End condition
  if (config.endType === 'on' && config.endDate) {
    const endDate = new Date(config.endDate);
    endDate.setHours(23, 59, 59, 999);
    const until = endDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    parts.push(`UNTIL=${until}`);
  } else if (config.endType === 'after' && config.occurrences) {
    parts.push(`COUNT=${config.occurrences}`);
  }

  return parts.join(';');
}

// Helper function to parse RRULE string to RecurrenceConfig
export function rruleToRecurrenceConfig(rrule: string | null): RecurrenceConfig {
  if (!rrule) {
    return {
      frequency: 'none',
      interval: 1,
      endType: 'never',
    };
  }

  const config: RecurrenceConfig = {
    frequency: 'none',
    interval: 1,
    endType: 'never',
  };

  const parts = rrule.split(';');

  for (const part of parts) {
    const [key, value] = part.split('=');

    switch (key) {
      case 'FREQ':
        config.frequency = value.toLowerCase() as RecurrenceConfig['frequency'];
        break;
      case 'INTERVAL':
        config.interval = parseInt(value);
        break;
      case 'BYDAY':
        const dayMap: { [key: string]: number } = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
        config.daysOfWeek = value.split(',').map(d => dayMap[d]).filter(d => d !== undefined);
        break;
      case 'BYMONTHDAY':
        config.dayOfMonth = parseInt(value);
        break;
      case 'BYMONTH':
        config.monthOfYear = parseInt(value);
        break;
      case 'UNTIL':
        config.endType = 'on';
        config.endDate = value.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        break;
      case 'COUNT':
        config.endType = 'after';
        config.occurrences = parseInt(value);
        break;
    }
  }

  return config;
}
