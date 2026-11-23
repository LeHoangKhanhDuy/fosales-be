const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/coc_coc|CocCoc/i, 'Cốc Cốc'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
];

function match(table: [RegExp, string][], ua: string) {
  return table.find(([pattern]) => pattern.test(ua))?.[1];
}

export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'Thiết bị không xác định';
  const browser = match(BROWSERS, ua);
  const system = match(SYSTEMS, ua);
  if (!browser && !system) return ua.slice(0, 40);
  return [browser ?? 'Trình duyệt khác', system ?? 'Hệ điều hành khác'].join(' · ');
}
