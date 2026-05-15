// Rules page — renders the rulebook markdown as styled HTML.
// Uses a plain fetch from the public/ directory during dev and preview.
// For production, rulebook.md is included in /public/docs/.

import { useEffect, useState } from 'react';

export function RulesPage() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/docs/rulebook.md')
      .then((r) => {
        if (!r.ok) throw new Error('not found');
        return r.text();
      })
      .then(setContent)
      .catch(() => setError(true));
  }, []);

  const sections = content ? parseMarkdown(content) : [];
  const filtered = search.trim()
    ? sections.filter((s) =>
        s.text.toLowerCase().includes(search.toLowerCase()) ||
        s.heading.toLowerCase().includes(search.toLowerCase()),
      )
    : sections;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Iron &amp; Ash — Rulebook</h1>
          <p className="mt-1 text-sm text-neutral-400">Full rules, FAQ, and quick reference. Ctrl+F in your browser or use the search below.</p>
        </div>
        <a
          href="https://github.com"
          className="hidden shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 sm:block"
          onClick={(e) => e.preventDefault()}
        >
          v.playtesting
        </a>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search rules… (e.g. 'garrison', 'threat track', 'Arcane Precision')"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-neutral-700 bg-neutral-800/80 px-4 py-2.5 text-sm text-neutral-100 placeholder-neutral-500 focus:border-purple-500 focus:outline-none"
        />
        {search && (
          <p className="mt-2 text-xs text-neutral-500">
            {filtered.length} section{filtered.length !== 1 ? 's' : ''} matching "{search}"
          </p>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
          ⚠ Rulebook file not found in /public/docs/rulebook.md.
          Run the app from the project root; the file is at <code>docs/rulebook.md</code>.
        </div>
      )}

      {!content && !error && (
        <div className="text-sm text-neutral-500">Loading…</div>
      )}

      {filtered.length === 0 && search && (
        <div className="text-sm text-neutral-500">No sections match "{search}".</div>
      )}

      {/* Rendered sections */}
      <div className="space-y-1">
        {filtered.map((s, i) => (
          <RulesSection key={i} section={s} highlight={search} />
        ))}
      </div>
    </main>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  level: number;
  heading: string;
  id: string;
  text: string;
  blocks: Block[];
}

interface Block {
  type: 'p' | 'table' | 'code' | 'ul' | 'ol' | 'blockquote' | 'h4';
  content: string;
  rows?: string[][];
  headers?: string[];
}

// ─── Markdown parser (simple, handles our rulebook format) ───────────────────

function parseMarkdown(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  let current: Section | null = null;
  let inCode = false;
  let codeLines: string[] = [];

  function pushBlock(block: Block) {
    if (current) current.blocks.push(block);
  }

  function flushCode() {
    if (codeLines.length > 0) {
      pushBlock({ type: 'code', content: codeLines.join('\n') });
      codeLines = [];
    }
  }

  for (const line of lines) {
    // Code fences
    if (line.startsWith('```')) {
      if (inCode) { flushCode(); inCode = false; }
      else { inCode = true; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    // Headings
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const h4 = line.match(/^#### (.+)/);
    if (h2 || h3) {
      const level = h2 ? 2 : 3;
      const heading = (h2 ?? h3)![1]!;
      const id = heading.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      current = { level, heading, id, text: heading, blocks: [] };
      sections.push(current);
      continue;
    }
    if (h4 && current) {
      pushBlock({ type: 'h4', content: h4[1]! });
      continue;
    }

    // Table rows
    if (line.startsWith('|') && current) {
      // accumulate table lines
      const lastBlock = current.blocks[current.blocks.length - 1];
      const row = line.split('|').slice(1, -1).map((c) => c.trim());
      if (line.includes('---|')) {
        // separator — skip
      } else if (lastBlock?.type === 'table') {
        lastBlock.rows?.push(row);
        lastBlock.content += '\n' + line;
      } else {
        pushBlock({ type: 'table', content: line, headers: row, rows: [] });
      }
      current.text += ' ' + row.join(' ');
      continue;
    }

    // Blockquote
    if (line.startsWith('>') && current) {
      pushBlock({ type: 'blockquote', content: line.slice(1).trim() });
      current.text += ' ' + line.slice(1).trim();
      continue;
    }

    // List items
    if ((line.startsWith('- ') || line.startsWith('* ')) && current) {
      const lastBlock = current.blocks[current.blocks.length - 1];
      const item = line.slice(2).trim();
      if (lastBlock?.type === 'ul') {
        lastBlock.content += '\n' + item;
      } else {
        pushBlock({ type: 'ul', content: item });
      }
      current.text += ' ' + item;
      continue;
    }

    if (line.match(/^\d+\./) && current) {
      const lastBlock = current.blocks[current.blocks.length - 1];
      const item = line.replace(/^\d+\.\s*/, '').trim();
      if (lastBlock?.type === 'ol') {
        lastBlock.content += '\n' + item;
      } else {
        pushBlock({ type: 'ol', content: item });
      }
      current.text += ' ' + item;
      continue;
    }

    // Paragraph
    if (line.trim() && current) {
      const lastBlock = current.blocks[current.blocks.length - 1];
      if (lastBlock?.type === 'p' && current.blocks.length > 0) {
        lastBlock.content += ' ' + line.trim();
      } else {
        pushBlock({ type: 'p', content: line.trim() });
      }
      current.text += ' ' + line.trim();
    }
  }

  return sections;
}

// ─── Rendered section ─────────────────────────────────────────────────────────

function highlight(text: string, term: string): React.ReactNode {
  if (!term) return text;
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === term.toLowerCase()
      ? <mark key={i} className="bg-amber-400/30 text-amber-200 rounded px-0.5">{p}</mark>
      : p,
  );
}

function inlineMarkdown(text: string, term = ''): React.ReactNode {
  // Bold, code, italic
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(highlight(text.slice(last, m.index), term));
    const s = m[0];
    if (s.startsWith('**')) parts.push(<strong key={m.index} className="text-neutral-100">{highlight(s.slice(2,-2), term)}</strong>);
    else if (s.startsWith('`')) parts.push(<code key={m.index} className="rounded bg-neutral-800 px-1 py-0.5 text-[11px] font-mono text-teal-300">{s.slice(1,-1)}</code>);
    else parts.push(<em key={m.index} className="text-neutral-300 italic">{highlight(s.slice(1,-1), term)}</em>);
    last = m.index + s.length;
  }
  if (last < text.length) parts.push(highlight(text.slice(last), term));
  return parts;
}

function RulesSection({ section, highlight: hl }: { section: Section; highlight: string }) {
  const [open, setOpen] = useState(true);
  const isTopLevel = section.level === 2;

  return (
    <div className={`rounded-xl border ${isTopLevel ? 'border-neutral-700/60 bg-neutral-900/30' : 'border-neutral-800/40 bg-transparent'} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className={`w-full text-left px-5 py-3 flex items-center justify-between gap-3 hover:bg-neutral-800/30 transition ${isTopLevel ? 'border-b border-neutral-700/40' : ''}`}
      >
        <span className={`font-bold ${isTopLevel ? 'text-base text-white' : 'text-sm text-neutral-200'}`}>
          {inlineMarkdown(section.heading, hl)}
        </span>
        <span className="text-neutral-500 text-xs shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-4 pt-2 space-y-2.5 text-sm text-neutral-300">
          {section.blocks.map((block, i) => (
            <BlockView key={i} block={block} hl={hl} />
          ))}
        </div>
      )}
    </div>
  );
}

function BlockView({ block, hl }: { block: Block; hl: string }) {
  switch (block.type) {
    case 'h4':
      return <h4 className="text-sm font-bold text-neutral-100 mt-3 mb-1">{inlineMarkdown(block.content, hl)}</h4>;

    case 'p':
      return <p className="leading-relaxed">{inlineMarkdown(block.content, hl)}</p>;

    case 'blockquote':
      return (
        <div className="border-l-4 border-teal-600/60 bg-teal-950/20 pl-4 py-1.5 rounded-r-lg text-teal-200/90 text-xs italic">
          {inlineMarkdown(block.content, hl)}
        </div>
      );

    case 'code':
      return (
        <pre className="overflow-x-auto rounded-lg bg-neutral-950/60 border border-neutral-800 p-3 font-mono text-[11px] text-neutral-300 leading-relaxed whitespace-pre-wrap">
          {block.content}
        </pre>
      );

    case 'ul':
      return (
        <ul className="space-y-1 pl-1">
          {block.content.split('\n').map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-purple-400">•</span>
              <span>{inlineMarkdown(item, hl)}</span>
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol className="space-y-1 pl-1">
          {block.content.split('\n').map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-purple-400 font-bold">{i + 1}.</span>
              <span>{inlineMarkdown(item, hl)}</span>
            </li>
          ))}
        </ol>
      );

    case 'table':
      if (!block.headers || !block.rows) return null;
      return (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-900/60">
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-neutral-400">
                    {inlineMarkdown(h, hl)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-neutral-800/60 hover:bg-neutral-800/20">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-neutral-300">
                      {inlineMarkdown(cell, hl)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    default:
      return null;
  }
}
