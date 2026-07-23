import { useState } from 'react';

export function Avatar({
  name,
  src,
  size,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  // If the image 404s or is briefly unavailable (e.g. mid-deploy), fall back
  // to initials instead of leaving broken alt text over the dark circle.
  const [broken, setBroken] = useState(false);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  const style = size ? { width: size, height: size, fontSize: size * 0.36 } : undefined;
  return (
    <span className="avatar" style={style}>
      {src && !broken ? (
        <img src={src} alt="" onError={() => setBroken(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
