export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s.()-]/g, '');
  if (/^\+?84\d{9}$/.test(compact)) return `0${compact.replace(/^\+?84/, '')}`;
  return /^0\d{9}$/.test(compact) ? compact : null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 7) return '*'.repeat(phone.length);
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = ip.replace(/^::ffff:/, '');
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v4)) {
    const [a, b] = v4.split('.');
    return `${a}.${b}.*.*`;
  }
  const groups = ip.split(':').filter(Boolean);
  return `${groups.slice(0, 2).join(':')}:****`;
}
