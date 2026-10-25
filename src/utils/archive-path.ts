export function safeSegment(value: string): string {
  const clean = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().replace(/[. ]+$/, '');
  const name = !clean || clean === '.' || clean === '..' ? '未命名' : clean;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? `_${name}` : name;
}

export function reserveArchivePath(folder: string, name: string, extension: string, used: Set<string>): string {
  const prefix = folder ? folder.split('/').map(safeSegment).join('/') + '/' : '';
  const base = safeSegment(name);
  const ext = extension.replace(/[^a-z0-9]/gi, '') || 'bin';
  let result = `${prefix}${base}.${ext}`;
  for (let count = 2; used.has(result.toLocaleLowerCase()); count++) result = `${prefix}${base} (${count}).${ext}`;
  used.add(result.toLocaleLowerCase());
  return result;
}
