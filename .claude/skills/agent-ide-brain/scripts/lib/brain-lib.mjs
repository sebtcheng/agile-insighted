import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Normalizes all newlines in a string to standard LF (\n).
 */
export function normalizeLf(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Calculates SHA-256 hash of LF-normalized content.
 */
export function sha256(content) {
  const norm = normalizeLf(content);
  return crypto.createHash('sha256').update(norm, 'utf8').digest('hex');
}

/**
 * Cross-platform path normalizer to POSIX style (forward slashes).
 */
export function toPosixPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/');
}

/**
 * Hidden-Unicode detection for supply-chain security:
 * U+200B–U+200F (zero-width spaces/marks)
 * U+202A–U+202E (bidirectional overrides/embeddings)
 * U+2060–U+2064 (invisible operators/word joiners)
 * U+2066–U+2069 (directional isolates)
 * U+FEFF (BOM / zero-width no-break space)
 * U+E0000–U+E007F (Unicode tags)
 */
export const HIDDEN_UNICODE_REGEX = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;

export function hasHiddenUnicode(str) {
  return HIDDEN_UNICODE_REGEX.test(str);
}

export function findHiddenUnicode(str) {
  const matches = [];
  const lines = normalizeLf(str).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (HIDDEN_UNICODE_REGEX.test(line)) {
      // Find all code points in this line
      for (const char of line) {
        if (HIDDEN_UNICODE_REGEX.test(char)) {
          matches.push({
            line: i + 1,
            codePoint: 'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'),
          });
        }
      }
    }
  }
  return matches;
}

/**
 * Managed block marker helpers.
 * For Markdown / general:
 *   <!-- agent-brain:begin ID -->
 *   ...
 *   <!-- agent-brain:end ID -->
 * For TOML:
 *   # agent-brain:begin ID
 *   ...
 *   # agent-brain:end ID
 */
export function parseManagedBlocks(content, isToml = false) {
  const blocks = new Map();
  const norm = normalizeLf(content);
  const regex = isToml
    ? /#\s*agent-brain:begin\s+([\w.-]+)\n([\s\S]*?)#\s*agent-brain:end\s+\1(?:\n|$)/g
    : /<!--\s*agent-brain:begin\s+([\w.-]+)\s*-->\n([\s\S]*?)<!--\s*agent-brain:end\s+\1\s*-->(?:\n|$)/g;

  let match;
  while ((match = regex.exec(norm)) !== null) {
    blocks.set(match[1], match[2]);
  }
  return blocks;
}

export function stripManagedBlockMarkers(content, blockId, isToml = false) {
  let norm = normalizeLf(content).trim();
  if (isToml) {
    norm = norm.replace(new RegExp(`^#\\s*agent-brain:begin\\s+${blockId}\\s*\\n?`, 'im'), '');
    norm = norm.replace(new RegExp(`\\n?\\s*#\\s*agent-brain:end\\s+${blockId}\\s*$`, 'im'), '');
  } else {
    norm = norm.replace(new RegExp(`^<!--\\s*agent-brain:begin\\s+${blockId}\\s*-->\\s*\\n?`, 'im'), '');
    norm = norm.replace(new RegExp(`\\n?\\s*<!--\\s*agent-brain:end\\s+${blockId}\\s*-->\\s*$`, 'im'), '');
  }
  return norm.trim();
}

export function replaceManagedBlock(originalContent, blockId, newInnerContent, isToml = false) {
  const norm = normalizeLf(originalContent);
  const beginMarker = isToml ? `# agent-brain:begin ${blockId}` : `<!-- agent-brain:begin ${blockId} -->`;
  const endMarker = isToml ? `# agent-brain:end ${blockId}` : `<!-- agent-brain:end ${blockId} -->`;

  const strippedInner = stripManagedBlockMarkers(newInnerContent, blockId, isToml);
  const blockFormatted = `${beginMarker}\n${strippedInner}\n${endMarker}\n`;

  const regex = isToml
    ? new RegExp(`#\\s*agent-brain:begin\\s+${blockId}\\n[\\s\\S]*?#\\s*agent-brain:end\\s+${blockId}(?:\\n|$)`)
    : new RegExp(`<!--\\s*agent-brain:begin\\s+${blockId}\\s*-->\\n[\\s\\S]*?<!--\\s*agent-brain:end\\s+${blockId}\\s*-->(?:\\n|$)`);

  if (regex.test(norm)) {
    return norm.replace(regex, blockFormatted);
  } else {
    // Append to end if not found
    return norm.length === 0 || norm.endsWith('\n')
      ? `${norm}${blockFormatted}`
      : `${norm}\n\n${blockFormatted}`;
  }
}

/**
 * Deep merge for JSON configurations (e.g. .claude/settings.json).
 * Preserves user-defined entries.
 * For hooks: identifies managed entries by command path containing '.claude/hooks/'.
 * For permissions arrays: unions strings while deduplicating.
 */
export function jsonDeepMerge(target, source) {
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    target = {};
  }
  const result = { ...target };

  for (const [key, sourceVal] of Object.entries(source)) {
    if (sourceVal === undefined) continue;

    if (key === 'permissions' && typeof sourceVal === 'object' && sourceVal !== null) {
      result.permissions = result.permissions || {};
      for (const pKey of ['deny', 'ask', 'allow']) {
        const targetArr = Array.isArray(result.permissions[pKey]) ? result.permissions[pKey] : [];
        const sourceArr = Array.isArray(sourceVal[pKey]) ? sourceVal[pKey] : [];
        // Union and preserve order
        const set = new Set([...targetArr, ...sourceArr]);
        result.permissions[pKey] = Array.from(set);
      }
    } else if (key === 'hooks' && typeof sourceVal === 'object' && sourceVal !== null) {
      result.hooks = result.hooks || {};
      // For each event in hooks
      for (const [event, sourceGroups] of Object.entries(sourceVal)) {
        const targetGroups = Array.isArray(result.hooks[event]) ? result.hooks[event] : [];
        if (!Array.isArray(sourceGroups)) {
          result.hooks[event] = targetGroups;
          continue;
        }

        // Filter out existing managed hook commands that contain '.claude/hooks/'
        // from target groups so we can cleanly replace with current managed hooks,
        // while preserving user custom hooks.
        const preservedUserGroups = [];
        for (const grp of targetGroups) {
          const userHooks = (grp.hooks || []).filter(h => {
            const cmd = typeof h === 'string' ? h : h.command || '';
            return !cmd.includes('.claude/hooks/');
          });
          if (userHooks.length > 0) {
            preservedUserGroups.push({ ...grp, hooks: userHooks });
          }
        }

        // Combine preserved user groups with incoming source groups
        result.hooks[event] = [...preservedUserGroups, ...sourceGroups];
      }
    } else if (
      typeof sourceVal === 'object' &&
      sourceVal !== null &&
      !Array.isArray(sourceVal)
    ) {
      result[key] = jsonDeepMerge(result[key] || {}, sourceVal);
    } else {
      // Overwrite/set primitive or other array
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Template renderer.
 * Replaces {{varName}} with vars[varName].
 * Throws on any unresolved token {{...}} or angle bracket placeholders <...>.
 */
export function renderTemplate(templateStr, vars) {
  let content = normalizeLf(templateStr);

  for (const [key, val] of Object.entries(vars)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    content = content.replace(placeholder, String(val));
  }

  // Check for unresolved {{token}}
  const unresolvedTokenMatch = content.match(/\{\{([^{}]+)\}\}/);
  if (unresolvedTokenMatch) {
    throw new Error(`Unresolved template token: ${unresolvedTokenMatch[0]}`);
  }

  // Check for unresolved angle-bracket placeholders like <repo-path>, <scope>, <mode>
  const stripped = content.replace(/<!--[\s\S]*?-->/g, '');
  const angleMatch = stripped.match(/<[a-z0-9_-]{3,}>/i);
  if (angleMatch) {
    const tag = angleMatch[0].toLowerCase();
    if (!['<summary>', '<details>', '<script>', '<style>', '<div>'].includes(tag)) {
      throw new Error(`Unresolved angle-bracket placeholder: ${angleMatch[0]}`);
    }
  }

  return content;
}

/**
 * Reads a file as UTF-8, normalizes LF. Returns null if file does not exist.
 */
export function readFileSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return normalizeLf(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Writes a file with LF normalization, creating parent directories if needed.
 */
export function writeFileSafe(filePath, content) {
  const norm = normalizeLf(content);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, norm, 'utf8');
}
