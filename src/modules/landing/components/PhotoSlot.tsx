import React from 'react';

interface PhotoSlotProps {
  caption?: string;
  label?: string; // backward-compat alias for caption
  tag?: string;
  className?: string;
  paper?: boolean;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export default function PhotoSlot({ caption, label, tag, className = '', paper, style, children }: PhotoSlotProps) {
  const c = caption ?? label ?? '';
  return (
    <div
      className={`photo-slot${paper ? ' photo-slot--paper' : ''} ${className}`.trim()}
      data-caption={c}
      style={style}
    >
      {tag && <div className="photo-slot__tag">{tag}</div>}
      <div className="photo-slot__frame" />
      {children}
    </div>
  );
}
