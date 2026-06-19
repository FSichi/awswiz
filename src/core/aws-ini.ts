/**
 * A small comment-preserving INI editor for the AWS shared files. The AWS SDK's
 * loader is great for reading, but it discards comments and formatting — so for
 * writing we keep the raw lines and only touch the keys we change.
 */

export interface IniSection {
  /** Literal bracket content, e.g. "default", "profile dev", "sso-session corp". */
  name: string;
  /** Raw body lines after the header, up to the next header (comments, blanks, keys). */
  lines: string[];
}

export interface IniDoc {
  /** Lines before the first section header (kept verbatim). */
  preamble: string[];
  sections: IniSection[];
  eol: '\n' | '\r\n';
  trailingNewline: boolean;
}

const HEADER = /^\s*\[(.+?)\]\s*$/;

export function parseIni(text: string): IniDoc {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = text === '' ? true : /\r?\n$/.test(text);
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

  const doc: IniDoc = { preamble: [], sections: [], eol, trailingNewline };
  let current: IniSection | null = null;

  for (const line of lines) {
    const match = line.match(HEADER);
    if (match) {
      current = { name: match[1]!.trim(), lines: [] };
      doc.sections.push(current);
    } else if (current) {
      current.lines.push(line);
    } else if (line !== '' || doc.preamble.length > 0) {
      doc.preamble.push(line);
    }
  }
  return doc;
}

export function serializeIni(doc: IniDoc): string {
  const out: string[] = [...doc.preamble];
  for (const section of doc.sections) {
    if (out.length > 0 && out[out.length - 1] !== '') out.push('');
    out.push(`[${section.name}]`);
    out.push(...section.lines);
  }
  // Collapse any accidental trailing blank lines to one clean ending.
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  let text = out.join(doc.eol);
  if (doc.trailingNewline && text !== '') text += doc.eol;
  return text;
}

function findSection(doc: IniDoc, name: string): IniSection | undefined {
  return doc.sections.find((s) => s.name === name);
}

export function getSection(doc: IniDoc, name: string): Record<string, string> | null {
  const section = findSection(doc, name);
  if (!section) return null;
  const result: Record<string, string> = {};
  for (const line of section.lines) {
    const eq = line.indexOf('=');
    if (eq === -1 || line.trim().startsWith('#') || line.trim().startsWith(';')) continue;
    result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return result;
}

/** Set/replace keys in a section, creating the section if needed. Preserves other lines. */
export function upsertSection(doc: IniDoc, name: string, kv: Record<string, string>): void {
  let section = findSection(doc, name);
  if (!section) {
    section = { name, lines: [] };
    doc.sections.push(section);
  }
  for (const [key, value] of Object.entries(kv)) {
    const keyRe = new RegExp(`^\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`);
    const idx = section.lines.findIndex((l) => keyRe.test(l));
    const rendered = `${key} = ${value}`;
    if (idx !== -1) {
      section.lines[idx] = rendered;
    } else {
      // Insert after the last non-blank line so trailing blanks stay at the end.
      let insertAt = section.lines.length;
      while (insertAt > 0 && section.lines[insertAt - 1] === '') insertAt--;
      section.lines.splice(insertAt, 0, rendered);
    }
  }
}

export function removeSection(doc: IniDoc, name: string): boolean {
  const idx = doc.sections.findIndex((s) => s.name === name);
  if (idx === -1) return false;
  doc.sections.splice(idx, 1);
  return true;
}
