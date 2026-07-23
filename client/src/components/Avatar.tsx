export function Avatar({ name, src }: { name: string; src?: string | null }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
  return <span className="avatar">{src ? <img src={src} alt={name} /> : initials}</span>;
}
