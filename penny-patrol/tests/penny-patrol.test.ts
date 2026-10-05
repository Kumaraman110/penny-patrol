// Runs under `claude plugin test <this folder>`: the mod is loaded by the engine's own host, and the hooks
// this file registers stand for the engine beneath it, answering what the mod calls on $ from memory
// (the session, its usage, the clock, the home folder's files, the network).

import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ContextCategory, ContextCategoryKind, ContextMcpTool, ContextMemoryFile, ModelUsage, On, SessionRateLimit, SessionUsage, TurnUsage } from 'claude-code'

// Sunday 4 October 2026, noon, local time: the first day of a week.
const NOW = new Date(2026, 9, 4, 12).getTime()
const HOME = '/home/kumar'
const FOLDER = `${HOME}/.penny-patrol`
const BUFFER = 33_000
const FIXED = 20_000 // system prompt + system tools
const NOTHING = 'nothing drawn'
// What a bar's free or spent stretch is drawn on, and the colour of words cut out of a part.
const TRACK = 'userMessageBackground'
const WORD = 'inverseText'
// The mascot as text: its face between its arms, and its legs apart, then together.
const faced = (face: string): string => `▄${face}▄`
const FACE = { asleep: faced('-__-'), strained: faced('>__<') }
const SMILES = ['^__^', '^uu^', 'n__n', '^ww^', '^oo^', '*__*', '^__~', '~__^', '$__$']
const LEGS = [' ▗▗▖▖ ', ' ▗▖▗▖ ']
const TOPICS: Record<string, string> = { AI: 'permission', Joke: 'claude', 'Good news': 'success', 'For you': 'warning' }

// A test may take a minute: on a busy machine the engine's start alone can outlast the kit's five seconds.
const SLOW = { timeoutMs: 60_000 }

// An element as drawn; one given no props has none.
type El = { type: string; props?: Record<string, unknown>; children?: Array<El | string> }
type World = ReturnType<typeof engine>
type Lines = 'live' | 'offline' | 'off'

const row = (name: string, tokens: number, color: string, kind: ContextCategoryKind): ContextCategory => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

// What `$.session.usage()` answers. The categories come in the engine's own order: the buffer before the
// free space, and a deferred row among them.
function usage(world: { messages: number; window: number; usd: number | null; windows: SessionRateLimit[]; startedAt: number; last: ModelUsage | null; isOffBy: number; memory: ContextMemoryFile[]; mcp: ContextMcpTool[] }): SessionUsage {
  const used = FIXED + world.messages

  return {
    startedAt: world.startedAt,
    rateLimits: world.windows,
    ...(world.usd === null ? {} : { cost: { usd: world.usd } }),
    context: {
      tokens: used,
      window: world.window,
      percent: Math.round((used / world.window) * 100),
      breakdown: {
        categories: [
          row('System prompt', 4_000, 'promptBorder', 'used'),
          row('System tools', 16_000, 'inactive', 'used'),
          row('MCP tools (deferred)', 30_000, 'inactive', 'deferred'),
          row('Messages', world.messages, 'purple', 'used'),
          row('Autocompact buffer', BUFFER, 'inactive', 'buffer'),
          row('Free space', world.window - BUFFER - used, 'promptBorder', 'free'),
        ],
        totalTokens: used + world.isOffBy,
        maxTokens: world.window,
        rawMaxTokens: world.window,
        autocompactSource: 'auto',
        percentage: Math.round((used / world.window) * 100),
        gridRows: [],
        model: 'test-model',
        memoryFiles: world.memory,
        mcpTools: world.mcp,
        agents: [],
        isAutoCompactEnabled: true,
        apiUsage: world.last,
      },
    },
  }
}

// The engine beneath the mod. `lines` is what the machine's settings say of the line under the bars: off
// unless a test is about it, and null for a machine with no settings yet.
function engine(on: On, start: { messages?: number; usd?: number | null; windows?: SessionRateLimit[]; lines?: Lines | null } = {}) {
  const world = {
    messages: start.messages ?? 40_000,
    window: 200_000,
    usd: start.usd ?? null,
    windows: start.windows ?? [],
    sessionId: 'session-one',
    startedAt: 1,
    last: null as ModelUsage | null,
    isOffBy: 0,
    memory: [] as ContextMemoryFile[],
    mcp: [] as ContextMcpTool[],
    agents: [] as Array<{ id: string; type: string; description: string; status: 'running' | 'completed' }>,
    readings: 0,
    toolRuns: 0,
    isUsageDown: false,
    files: new Map<string, { text: string; mtimeMs: number }>(),
    // What the network answers, by the start of the URL asked; and what was asked of it.
    feeds: new Map<string, string>(),
    fetched: [] as Array<{ url: string; headers: Record<string, string> }>,
    clock: mock.clock(on, { now: NOW }),
  }
  mock.env(on, { HOME })

  if (start.lines !== null) {
    world.files.set(`${FOLDER}/settings.json`, { text: JSON.stringify({ budget: null, lines: start.lines ?? 'off', isIntroduced: true }), mtimeMs: NOW })
  }

  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => {
    world.toolRuns += 1

    return { result: 'ran' }
  })
  on('classic.PostToolUse', () => ({}))
  on('classic.Stop', () => ({}))
  on('classic.SubagentStop', () => ({}))
  // A call on $ is answered `{ value }`.
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('session.id', () => ({ value: world.sessionId }))
  on('agent.list', () => ({ value: world.agents }))
  on('fs.read', (_$, e) => {
    const file = world.files.get(e.path)

    return file ? { value: file.text } : { deny: `ENOENT: no such file, ${e.path}` }
  })
  on('fs.write', (_$, e) => {
    world.files.set(e.path, { text: e.text, mtimeMs: world.clock.now() })

    return { value: undefined }
  })
  on('fs.list', (_$, e) => ({
    value: [...world.files]
      .filter(([path]) => path.startsWith(`${e.path}/`))
      .map(([path, file]) => ({ name: path.slice(`${e.path}/`.length), kind: 'file' as const, size: file.text.length, mtimeMs: file.mtimeMs, isLink: false })),
  }))
  on('http.fetch', (_$, e) => {
    world.fetched.push({ url: e.url, headers: e.init?.headers ?? {} })
    const text = [...world.feeds].find(([start]) => e.url.startsWith(start))?.[1]

    return text === undefined ? { deny: 'no network' } : { value: { status: 200, ok: true, headers: {}, text } }
  })
  on('session.usage', (_$, e) => {
    if (world.isUsageDown) {
      throw new Error('usage is down')
    }

    // The plain call is the cost ledger's and is free; a reading asks for the breakdown.
    if (e.breakdown !== undefined) world.readings += 1

    return { value: usage(world) }
  })
  // AbovePrompt has nothing of the engine's own; a marker shows when the mod passed.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: NOTHING })
  })

  return world
}

const begin = ($: Engine) => $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

const mount = ($: Engine, bodyColumns: number, maxRows = 40, hasSurvey = false) =>
  $.ui.mount({
    plugin: 'penny-patrol',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  })

type Band = Awaited<ReturnType<typeof mount>>

const command = ($: Engine, args = '') =>
  $.command.run({ command: 'penny-patrol', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

// A tool call of the main loop's.
const call = ($: Engine) => $.tool.call({ tool: 'Bash', command: 'true' })
const measure = ($: Engine, changed: 'context' | 'cost') => $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: [changed] })
const turnStart = ($: Engine, text: string) => $.turn.start({ text, turnId: 't' })
const turnEnd = ($: Engine, agentId?: string, used?: TurnUsage, reason: 'answer' | 'aborted' = 'answer') =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: reason === 'aborted', turnId: 't', reason, ...(agentId === undefined ? {} : { agentId }), ...(used === undefined ? {} : { usage: used }) })
const stop = ($: Engine, tasks: string[]) =>
  $.classic.Stop({ stop_hook_active: false, background_tasks: tasks.map((type, i) => ({ id: `task-${i}`, type, status: 'running', description: type })) })
const subagentStop = ($: Engine, tasks: string[]) =>
  $.classic.SubagentStop({ stop_hook_active: false, agent_id: 'agent-7', agent_type: 'general-purpose', agent_transcript_path: '', background_tasks: tasks.map((type, i) => ({ id: `task-${i}`, type, status: 'running', description: type })) })
const tokens = (input: number, output: number, cacheRead: number, cacheWrite: number): TurnUsage => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
  model: 'test-model',
})

// The drawing as rows, and what each row holds. A link is its label.
const isEl = (node: El | string): node is El => typeof node !== 'string'
const textOf = (node: El | string): string =>
  isEl(node) ? (node.type === 'Link' ? String(node.props?.label ?? '') : (node.children ?? []).map(textOf).join('')) : node
const rowsOf = async (ui: Band): Promise<El[]> => (((await ui.drawn()) as unknown as El).children ?? []).filter(isEl)
const linesOf = async (ui: Band): Promise<string[]> => (await rowsOf(ui)).map(textOf)
// A row's pieces, each with how it is drawn.
const piecesOf = (el: El): Array<{ text: string; color: unknown; ground: unknown; isDim: boolean; isCut: boolean; isBold: boolean; href: unknown }> =>
  (el.children ?? []).filter(isEl).map(run => ({
    text: textOf(run),
    color: run.props?.color,
    ground: run.props?.backgroundColor,
    isDim: run.props?.dimColor === true,
    isCut: run.props?.inverse === true,
    isBold: run.props?.bold === true,
    href: run.props?.href,
  }))
// A bar as drawn: each stretch's text, the ground it is drawn on, and the colour of its glyphs.
const barOf = (el: El): Array<[string, unknown, unknown]> => piecesOf(el).filter(piece => piece.ground !== undefined).map(piece => [piece.text, piece.ground, piece.color])
// The scene's width in a band of `columns`, as the mod lays it out: two fifths of what the padding
// leaves, the rest (to 136 cells) being the readout's, two cells between them.
const trackOf = (columns: number): number => columns - 4 - Math.min(136, columns - 4 - Math.floor((columns - 2) * 0.4))
// A row's cells within the scene, and what it says at the scene's right: a label of nine cells, then words.
const sceneOf = (line: string, columns: number): string => line.slice(0, trackOf(columns))
const saidOf = (line: string, columns: number): string => line.slice(trackOf(columns) + 2).trimEnd()
// Where the mascot stands: the row of its face and its first cell, with the face and the legs it shows.
const mascotOf = (lines: string[]): { row: number; at: number; face: string; legs: string } | null => {
  const row = lines.findIndex(line => /▄.{4}▄/.test(line))
  const face = /▄.{4}▄/.exec(lines[row] ?? '')?.[0] ?? ''
  const at = lines[row]?.indexOf(face) ?? -1

  return row < 0 ? null : { row, at, face, legs: (lines[row + 1] ?? '').slice(at, at + face.length) }
}
// The colours the mascot is drawn in (one, unless something is wrong), from its two rows as drawn.
const mascotColours = async (ui: Band): Promise<unknown[]> => {
  const rows = await rowsOf(ui)
  const found = mascotOf(rows.map(textOf))
  const pieces = found ? [...piecesOf(rows[found.row]!), ...piecesOf(rows[found.row + 1]!)] : []

  return [...new Set(pieces.filter(piece => piece.text === '▄' || piece.isCut).map(piece => piece.color))]
}
// The line under the bars as drawn: its label, the label's colour, and what it says.
const lineOf = async (ui: Band): Promise<{ label: string; color: unknown; text: string; pieces: ReturnType<typeof piecesOf> } | null> => {
  const last = (await rowsOf(ui)).at(-1)
  const pieces = last ? piecesOf(last) : []
  const label = pieces[0]?.text.trimEnd() ?? ''

  return pieces[0]?.isBold === true && label in TOPICS ? { label, color: pieces[0].color, text: pieces.slice(1).map(piece => piece.text).join(''), pieces } : null
}
const fileOf = (world: World, name: string): unknown => JSON.parse(world.files.get(`${FOLDER}/${name}`)?.text ?? 'null')
const put = (world: World, name: string, value: unknown): void => {
  world.files.set(`${FOLDER}/${name}`, { text: JSON.stringify(value), mtimeMs: world.clock.now() })
}
const soon = new Date(NOW + 80 * 60_000).toISOString()
const later = new Date(NOW + (3 * 24 + 5) * 3_600_000).toISOString()
const twoWindows: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 85, resetsAt: later }]
// What the two limit bars say in a scene of forty-seven cells (a band of 120), cell by cell.
const FIVE = ' 5h limit · 60% left · Resets in 1h 20m '
const WEEK = ' Week limit · 15% left · Resets in 3d 5h '

test('the scene and the readout: the bars one under another with two free rows over each, and what the first two say beside them', SLOW, async ($, on) => {
  const world = engine(on, { usd: 2, windows: twoWindows })
  world.last = { input_tokens: 1_200, output_tokens: 900, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 800 }
  await begin($)
  const ui = await mount($, 120)
  const lines = await linesOf(ui)

  expect(trackOf(120)).toBe(47)
  // A limit bar says what it has to say itself: nothing stands beside it, or in the rows over it.
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'Model    test-model',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '         Last request: 60k in (58k cached) · 900 out',
    'Cost     $2.00',
    '         Before tracking $2.00',
    '',
    '',
    '',
    '',
    '',
  ])
  const scene = lines.map(line => sceneOf(line, 120))
  // The mascot stands over the first bar, at its left, and nothing else is in the free rows.
  expect(scene[0]).toBe(FACE.asleep.padEnd(47))
  expect(scene[1]).toBe(LEGS[0]!.padEnd(47))
  expect([3, 4, 6, 7, 9, 10].map(i => scene[i])).toEqual(Array.from({ length: 6 }, () => ' '.repeat(47)))
  // The context bar; an empty cost bar, nothing having been seen spent; then the limits, a bar each, with
  // what is left written in it from its second cell.
  expect(scene[2]).toHaveLength(47)
  expect(scene[2]).toMatch(/^█+░+▒+$/)
  expect(scene[5]).toBe('░'.repeat(47))
  expect(scene[8]).toBe(`${FIVE}${'░'.repeat(7)}`)
  expect(scene[11]).toBe(`${WEEK}${'░'.repeat(6)}`)
  // No row is wider than the band.
  expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(118)
})

test('every cell of a bar is drawn as background: a part in its colour, what is free in the track\'s, the buffer shaded over it', SLOW, async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)

  // The engine lists the buffer before the free space, and a deferred row among them; the bar does not.
  // A part's glyph is in its own colour, so the cell is one block whatever the terminal's line spacing.
  expect(barOf(rows[2]!).map(([text, ground, color]) => [text[0], ground, color])).toEqual([
    ['█', 'promptBorder', 'promptBorder'],
    ['█', 'inactive', 'inactive'],
    ['█', 'purple', 'purple'],
    ['░', TRACK, TRACK],
    ['▒', TRACK, 'inactive'],
  ])
  expect(barOf(rows[2]!).map(([text]) => text).join('')).toHaveLength(47)
  // The legend's swatches are the bar's; with no request made yet the buffer's entry has the second line.
  const legend = piecesOf(rows[3]!).filter(piece => piece.text === '█')
  expect(legend.map(piece => piece.color)).toEqual(['promptBorder', 'inactive', 'purple'])
  expect(saidOf(textOf(rows[4]!), 120)).toBe('         ▒ Autocompact buffer 33k')
  expect((await linesOf(ui)).join('\n')).not.toContain('deferred')
  // A label is dim, what a bar's own line says is not, a legend is.
  expect(piecesOf(rows[2]!).slice(-2).map(piece => [piece.text, piece.isDim])).toEqual([['Context  ', true], ['30% · 60k / 200k · 107k free', false]])
  expect(piecesOf(rows[3]!).at(-1)).toMatchObject({ text: 'Messages 40k', isDim: true })
})

test('a legend that does not fit gives up its lightest entries and says how many', SLOW, async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 62)
  const said = (await linesOf(ui)).map(line => saidOf(line, 62))

  // Twenty-five cells for words: the free figure goes from the bar's line, the smallest category and
  // the buffer's entry from the legend.
  expect(trackOf(62)).toBe(24)
  expect(said).toEqual(['Model    test-model', 'Steps    Today 0 · Week 0', 'Context  30% · 60k / 200k', '         █ System tools 16k', '         █ Messages 40k  +1'])
})

test('what came before tracking is said only where there is room for it beside who spent', SLOW, async ($, on) => {
  const world = engine(on, { usd: 2 })
  await begin($)
  await turnStart($, 'spend')
  world.usd = 2.31
  await call($)
  world.usd = 2.76
  await turnEnd($, 'agent-7')
  const ui = await mount($, 62)
  const said = (await linesOf(ui)).map(line => saidOf(line, 62))

  // Two rows under the cost bar, twenty-five cells each: the two who spent fill them.
  expect(said.slice(5, 8)).toEqual(['Cost     $2.76 · This prompt $0.76', '         █ Main $0.31', '         █ Subagents $0.45'])
  await ui.unmount()
  const wide = await mount($, 120)
  expect(saidOf((await linesOf(wide))[6]!, 120)).toBe('         █ Main $0.31  █ Subagents $0.45  Before tracking $2.00')
})

test('a legend with room for none of its entries says nothing, not a bare count of them', SLOW, async ($, on) => {
  const world = engine(on, { usd: 0, windows: twoWindows })
  await begin($)
  await turnStart($, 'spend')
  world.usd = 0.31
  await call($)
  world.usd = 1_234_567.98
  await turnEnd($, 'agent-7')
  const ui = await mount($, 60)
  const said = (await linesOf(ui)).map(line => saidOf(line, 60))

  // Two rows under the cost bar, twenty-four cells each: the larger entry alone would need twenty-five.
  expect(said.slice(5, 8)).toEqual(['Cost     $1,234,567.98', '', ''])
})

test('hiding is this session\'s own choice, kept in its file and restored when it loads', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  expect(await ui.find({ text: NOTHING })).toBeUndefined()

  expect((await command($)).text).toBe('Penny Patrol hidden.')
  expect(await ui.find({ text: NOTHING })).toBeDefined()
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ isHidden: true })

  expect((await command($)).text).toBe('Penny Patrol shown.')
  expect(await ui.find({ text: NOTHING })).toBeUndefined()
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ isHidden: false })
})

test('a session saved hidden starts hidden, reads nothing, and shows on request', SLOW, async ($, on) => {
  const world = engine(on)
  put(world, 'sessions/session-one.json', { ledger: null, effort: null, isHidden: true })
  await begin($)
  const ui = await mount($, 100)
  await measure($, 'context')
  await call($)
  expect(await ui.find({ text: NOTHING })).toBeDefined()
  expect(world.readings).toBe(0)

  expect((await command($)).text).toBe('Penny Patrol shown.')
  expect(world.readings).toBe(1)
  expect(await ui.find({ type: 'Text', text: '30% · 60k / 200k' })).toBeDefined()
})

test('the window is read again when the engine measures a moved context, and during a turn at most once in ten seconds', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  const before = world.readings

  world.messages = 100_000
  await measure($, 'cost')
  expect(world.readings).toBe(before)
  await measure($, 'context')
  expect(world.readings).toBe(before + 1)
  expect(await ui.find({ type: 'Text', text: '60% · 120k / 200k' })).toBeDefined()

  world.messages = 60_000
  expect(await call($)).toMatchObject({ result: 'ran' })
  expect(world.readings).toBe(before + 2)
  world.messages = 80_000
  await world.clock.advance(9_000)
  await call($)
  expect(world.readings).toBe(before + 2)
  await world.clock.advance(1_000)
  await call($)
  expect(world.readings).toBe(before + 3)
  expect(await ui.find({ type: 'Text', text: '50% · 100k / 200k' })).toBeDefined()
})

test('/clear drops the reading until the new conversation is measured, and a survey is given the band', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  await $.session.end({ reason: 'clear', sessionId: 'session-one', resume: { id: 'session-one' } })
  expect(await ui.find({ text: NOTHING })).toBeDefined()

  world.messages = 0
  await call($)
  expect(await ui.find({ type: 'Text', text: '10% · 20k / 200k' })).toBeDefined()
  await ui.unmount()

  const survey = await mount($, 100, 12, true)
  expect(await survey.find({ text: NOTHING })).toBeDefined()
})

test('where the scene has no room, by width or by rows, the bars stand alone with their figures', SLOW, async ($, on) => {
  engine(on, { usd: 2, windows: twoWindows })
  await begin($)

  // Sixty columns is the scene's least: four bars, three rows each. Fifty-nine has the bars across the
  // band, each with its figures, and the limits side by side under their names.
  const least = await mount($, 60)
  expect(mascotOf(await linesOf(least))).toMatchObject({ row: 0, at: 0 })
  expect(await rowsOf(least)).toHaveLength(12)
  await least.unmount()

  const narrow = await mount($, 59)
  const [context, cost, gauges] = await rowsOf(narrow)
  expect(await rowsOf(narrow)).toHaveLength(3)
  expect(textOf(context!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k · 107k free$/)
  expect(textOf(cost!)).toMatch(/^░+ +\$2\.00$/)
  // The labels take the wider one's width, so the two bars are one length.
  expect(textOf(context!)).toHaveLength(57)
  expect(textOf(cost!)).toHaveLength(57)
  expect((gauges!.children ?? []).filter(isEl).map(textOf)).toEqual([expect.stringMatching(/^5h █+░+ {2}60% left$/), expect.stringMatching(/^Week █+░+ {2}15% left$/)])
  expect(mascotOf(await linesOf(narrow))).toBeNull()
  await narrow.unmount()

  // A band allowed fewer rows than the scene has: first the limit bars give up the free rows over them,
  // and what the cost bar still has to say stands beside the first of them. Eight rows for twelve.
  const low = await mount($, 120, 11)
  const lowLines = await linesOf(low)
  expect(lowLines).toHaveLength(8)
  expect(mascotOf(lowLines)).toMatchObject({ row: 0, at: 0 })
  expect(lowLines.slice(5).map(line => saidOf(line, 120))).toEqual(['Cost     $2.00', '         Before tracking $2.00', ''])
  expect(lowLines.slice(6).map(line => sceneOf(line, 120))).toEqual([`${FIVE}${'░'.repeat(7)}`, `${WEEK}${'░'.repeat(6)}`])
  await low.unmount()
  // With fewer rows than that, the bars alone.
  const lower = await mount($, 120, 7)
  expect(await rowsOf(lower)).toHaveLength(3)
  expect(textOf((await rowsOf(lower))[0]!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k · 107k free$/)
  await lower.unmount()

  // A label gives way before its bar does, last part first.
  const tiny = await mount($, 30)
  expect(textOf((await rowsOf(tiny))[0]!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k$/)
  await tiny.unmount()
  const least2 = await mount($, 14)
  expect(textOf((await rowsOf(least2))[0]!)).toMatch(/^[█░▒]{12}$/)
})

test('effort is taken from a tool call of the main loop, and kept with the session', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 120)
  const tool = { tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: {}, tool_use_id: 't1' }
  const model = async (): Promise<string> => saidOf((await linesOf(ui))[0]!, 120)

  await $.classic.PostToolUse({ ...tool, agent_id: 'agent-1', effort: { level: 'low' } })
  expect(await model()).toBe('Model    test-model')
  await $.classic.PostToolUse({ ...tool, effort: { level: 'xhigh' } })
  expect(await model()).toBe('Model    test-model · Xhigh effort')

  await turnEnd($)
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ effort: 'xhigh' })
})

test('the cost bar books every rise of the session total to whoever was acting, and the ledger justifies it', SLOW, async ($, on) => {
  const world = engine(on, { usd: 2 })
  world.agents = [{ id: 'agent-7', type: 'general-purpose', description: 'Check the build', status: 'completed' }]
  await begin($)
  const ui = await mount($, 120)
  expect(saidOf((await linesOf(ui))[6]!, 120)).toBe('         Before tracking $2.00')

  await turnStart($, 'fix the   flaky\ntest')
  world.usd = 2.3
  await call($)
  world.usd = 2.75
  await turnEnd($, 'agent-7', tokens(10, 2_000, 30_000, 500))
  world.usd = 2.76
  await turnEnd($, undefined, tokens(100, 50, 9_000, 1_000))

  const rows = await rowsOf(ui)
  expect(saidOf(textOf(rows[5]!), 120)).toBe('Cost     $2.76 · This prompt $0.76')
  expect(saidOf(textOf(rows[6]!), 120)).toBe('         █ Main $0.31  █ Subagents $0.45  Before tracking $2.00')
  // The bar is who spent what was seen being spent: what came before tracking is said, not drawn.
  expect(barOf(rows[5]!)).toEqual([['█'.repeat(19), 'permission', 'permission'], ['█'.repeat(28), 'cyan_FOR_SUBAGENTS_ONLY', 'cyan_FOR_SUBAGENTS_ONLY']])

  const text = (await command($, 'costs')).text
  expect(text).toContain('Session total reported by Claude Code: $2.76')
  expect(text).toContain('Itemised below:   $0.76')
  expect(text).toContain('Before tracking:  $2.00')
  expect(text).toContain('Unaccounted:      $0.00')
  expect(text).toContain('Prompts:          1 · Average $0.76 · Most expensive $0.76')
  expect(text).toContain('  1.     $0.76  fix the flaky test')
  expect(text).toContain('Main $0.31 · test-model · In 100, out 50, cache read 9k, cache write 1k (89% of input from cache)')
  expect(text).toContain('general-purpose "Check the build" $0.45 · test-model · In 10, out 2k, cache read 30k, cache write 500 (98% of input from cache)')
})

test('the cents shown always add up to the total shown, however the parts round', SLOW, async ($, on) => {
  const world = engine(on, { usd: 10.004 })
  await begin($)
  const ui = await mount($, 120)
  await turnStart($, 'a')
  world.usd = 10.008
  await call($)
  world.usd = 10.012
  await turnEnd($, 'agent-1')
  world.usd = 10.016
  await turnEnd($)

  const lines = await linesOf(ui)
  const shown = [...lines[6]!.matchAll(/\$(\d+)\.(\d\d)/g)].map(found => Number(found[1]) * 100 + Number(found[2]))
  // $0.012 was seen spent: of the 1,002 cents reported it is one, and that one is the main conversation's.
  expect(saidOf(lines[5]!, 120)).toBe('Cost     $10.02 · This prompt $0.01')
  expect(saidOf(lines[6]!, 120)).toBe('         █ Main $0.01  Before tracking $10.01')
  expect(shown.reduce((sum, cents) => sum + cents, 0)).toBe(1002)
  expect((await command($, 'costs')).text).toContain('Unaccounted:      $0.00')
  expect((await command($, 'audit')).text).not.toContain('OFF')
})

test('a subagent\'s later spend belongs to the prompt that started it', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1 })
  await begin($)
  await turnStart($, 'first prompt')
  world.usd = 1.1
  await turnEnd($, 'agent-1')
  await turnEnd($)
  await turnStart($, 'second prompt')
  world.usd = 1.5
  await turnEnd($, 'agent-1')
  world.usd = 1.52
  await turnEnd($)

  const text = (await command($, 'costs')).text
  expect(text).toContain('  1.     $0.50  first prompt')
  expect(text).toContain('  2.     $0.02  second prompt')
})

test('a session\'s ledger is its own: restored from its file, and another session neither reads nor writes it', SLOW, async ($, on) => {
  const world = engine(on, { usd: 5.5 })
  const turn = { seq: 1, label: 'earlier', main: 4, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: null, agents: {} }
  put(world, 'sessions/session-one.json', { ledger: { seen: 5, untracked: 1, folded: { usd: 0, prompts: 0 }, steps: 40, nextSeq: 2, turns: [turn], agents: {} }, effort: 'high', isHidden: false })
  put(world, 'days/session-one.json', { '2026-10-04': { steps: 40, usd: 4 } })
  await begin($)

  let text = (await command($, 'costs')).text
  expect(text).toContain('Before tracking:  $1.00')
  expect(text).toContain('  1.     $4.50  earlier')
  expect(text).toContain('Working time:     40 steps')

  // Another conversation takes over this process (as after /clear): its own id, its own files.
  world.sessionId = 'session-two'
  world.startedAt = 2
  world.usd = 6
  await turnStart($, 'new conversation')
  world.usd = 6.25
  await turnEnd($)
  text = (await command($, 'costs')).text
  expect(text).toContain('Before tracking:  $6.00')
  expect(text).toContain('  1.     $0.25  new conversation')
  expect(text).not.toContain('earlier')
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ ledger: { seen: 5.5, turns: [{ label: 'earlier', main: 4.5 }] } })
  expect(fileOf(world, 'sessions/session-two.json')).toMatchObject({ ledger: { seen: 6.25, untracked: 6 } })
  expect(fileOf(world, 'days/session-two.json')).toEqual({ '2026-10-04': { steps: 0, usd: 0.25 } })
})

test('the mascot walks the bars a step a second: along the first, down, back along the second, and so down to the last, then home again', SLOW, async ($, on) => {
  const world = engine(on, { usd: 3, windows: twoWindows })
  await begin($)
  const ui = await mount($, 62)
  const walk = async (seconds: number): Promise<{ row: number; at: number; face: string; legs: string } | null> => {
    await world.clock.advance(seconds * 1_000)

    return mascotOf(await linesOf(ui))
  }
  // A scene of twenty-four cells: the mascot's six leave it eighteen steps along a bar. Four bars: the
  // context, the cost, the five hours and the week, each with its two free rows over it.
  expect(trackOf(62)).toBe(24)
  expect(await rowsOf(ui)).toHaveLength(12)
  expect(await walk(0)).toEqual({ row: 0, at: 0, face: FACE.asleep, legs: LEGS[0] })

  // Nothing runs: the seconds pass and it stands where it is, asleep.
  expect(await walk(3)).toEqual({ row: 0, at: 0, face: FACE.asleep, legs: LEGS[0] })

  await turnStart($, 'work')
  // Awake and smiling; its inner legs step in on the odd steps and out on the even ones.
  expect(await walk(1)).toEqual({ row: 0, at: 1, face: faced('^__^'), legs: LEGS[1] })
  expect(await walk(1)).toEqual({ row: 0, at: 2, face: faced('^__^'), legs: LEGS[0] })
  // The right end of the first bar, then down onto the second, which it walks leftward.
  expect(await walk(16)).toMatchObject({ row: 0, at: 18, legs: LEGS[0] })
  expect(await walk(1)).toMatchObject({ row: 3, at: 18, legs: LEGS[1] })
  expect(await walk(1)).toMatchObject({ row: 3, at: 17, legs: LEGS[0] })
  expect(await walk(17)).toMatchObject({ row: 3, at: 0, legs: LEGS[1] })
  // Down onto the five hours' bar and along it, rightward; then DOWN onto the week's, not across to it:
  // there is no stretch of the walk with no bar under it.
  expect(await walk(1)).toMatchObject({ row: 6, at: 0, legs: LEGS[0] })
  expect(await walk(18)).toMatchObject({ row: 6, at: 18, legs: LEGS[0] })
  expect(await walk(1)).toEqual({ row: 9, at: 18, face: FACE.strained, legs: LEGS[1] })
  const lines = await linesOf(ui)
  expect(sceneOf(lines[9]!, 62)).toBe(`${' '.repeat(18)}${FACE.strained}`)
  expect(sceneOf(lines[10]!, 62)).toBe(`${' '.repeat(18)}${LEGS[1]}`)
  // Its body is its colour as background, with its face and the gaps between its legs cut out of it;
  // its arms are blocks at its sides.
  const rows = await rowsOf(ui)
  expect(piecesOf(rows[9]!).filter(piece => piece.color === 'claude').map(piece => [piece.text, piece.isCut])).toEqual([['▄', false], ['>__<', true], ['▄', false]])
  expect(piecesOf(rows[10]!).filter(piece => piece.color === 'claude').map(piece => [piece.text, piece.isCut])).toEqual([['▗▖▗▖', true]])
  // The rows it left are free again, and it never stands in a bar.
  expect([0, 1, 3, 4, 6, 7].map(i => sceneOf(lines[i]!, 62))).toEqual(Array.from({ length: 6 }, () => ' '.repeat(24)))
  expect([2, 5, 8, 11].map(i => sceneOf(lines[i]!, 62)).join('')).not.toMatch(/[▄▗▖]/)
  // The left end of the last bar, then the whole way back to where it began, and out again.
  expect(await walk(18)).toEqual({ row: 9, at: 0, face: FACE.strained, legs: LEGS[1] })
  expect(await walk(1)).toEqual({ row: 9, at: 1, face: FACE.strained, legs: LEGS[0] })
  expect(await walk(74)).toEqual({ row: 0, at: 0, face: faced('^__^'), legs: LEGS[0] })
  expect(await walk(1)).toEqual({ row: 0, at: 1, face: faced('^__^'), legs: LEGS[1] })
  expect(saidOf((await linesOf(ui))[1]!, 62)).toBe('Steps    Today 151 · Week 151')

  // The turn over and nothing left running, it stands, legs apart, and sleeps.
  await turnEnd($)
  await stop($, [])
  expect(await walk(2)).toEqual({ row: 0, at: 1, face: FACE.asleep, legs: LEGS[0] })
  expect(fileOf(world, 'days/session-one.json')).toMatchObject({ '2026-10-04': { steps: 151 } })
})

test('all the way down and back there is a bar under the mascot at every step', SLOW, async ($, on) => {
  const world = engine(on, { usd: 3, windows: twoWindows })
  await begin($)
  const ui = await mount($, 62)
  await turnStart($, 'work')
  const stood: string[] = []

  // Four bars of nineteen stops: seventy-six steps down, and as many back.
  for (let step = 0; step < 152; step += 1) {
    const rows = await rowsOf(ui)
    const found = mascotOf(rows.map(textOf))
    const under = found ? barOf(rows[found.row + 2]!).map(([text]) => text).join('') : ''
    stood.push(`${found?.row}:${under.length}`)
    await world.clock.advance(1_000)
  }

  // Its two rows are always the two right over a bar, and that bar is the scene's whole width.
  expect([...new Set(stood)].sort()).toEqual(['0:24', '3:24', '6:24', '9:24'])
  expect(stood.slice(0, 77).filter((where, i) => where !== stood[i - 1])).toEqual(['0:24', '3:24', '6:24', '9:24'])
})

test('where the limit bars have given up their free rows the mascot keeps to the bars above them', SLOW, async ($, on) => {
  const world = engine(on, { usd: 3, windows: twoWindows, lines: 'offline' })
  await begin($)
  // Nine rows: the context and cost bars with their free rows, the two limits, and the line. With eight,
  // the same without the line.
  const ui = await mount($, 62, 9)
  expect(await rowsOf(ui)).toHaveLength(9)
  expect(await lineOf(ui)).not.toBeNull()
  await turnStart($, 'work')
  const stood = new Set<number | undefined>()

  // Two bars of nineteen stops: thirty-eight steps out, and as many back.
  for (let step = 0; step < 80; step += 1) {
    stood.add(mascotOf(await linesOf(ui))?.row)
    await world.clock.advance(1_000)
  }

  expect([...stood].sort()).toEqual([0, 3])
  const rows = await rowsOf(ui)
  expect([6, 7].map(i => barOf(rows[i]!).map(([text]) => text).join('').length)).toEqual([24, 24])
  await ui.unmount()
  const noLine = await mount($, 62, 8)
  expect(await rowsOf(noLine)).toHaveLength(8)
  expect(await lineOf(noLine)).toBeNull()
  expect(mascotOf(await linesOf(noLine))).not.toBeNull()
})

test('the mascot takes the colour of the part of the bar under it, and wears its own over what is free or gone', SLOW, async ($, on) => {
  const world = engine(on, { windows: twoWindows })
  await begin($)
  const ui = await mount($, 120)
  const after = async (seconds: number): Promise<[number | undefined, unknown[]]> => {
    await world.clock.advance(seconds * 1_000)

    return [mascotOf(await linesOf(ui))?.at, await mascotColours(ui)]
  }
  // The context bar at forty-seven cells: 2 system prompt, 4 system tools, 9 messages, 24 free, 8 buffer.
  // The part that counts is the one under the mascot's third cell.
  expect(await after(0)).toEqual([0, ['inactive']])
  await turnStart($, 'work')
  expect(await after(3)).toEqual([3, ['inactive']])
  expect(await after(1)).toEqual([4, ['purple']])
  expect(await after(8)).toEqual([12, ['purple']])
  // The free stretch is no part of anything: there it is its own colour.
  expect(await after(1)).toEqual([13, ['claude']])
  expect(await after(23)).toEqual([36, ['claude']])
  expect(await after(1)).toEqual([37, ['inactive']])
  // Down onto the five hours' bar, walked right to left: nineteen cells gone, then twenty-eight left, in
  // green. The words written in the bar change nothing: it is the part under them that counts.
  expect(await after(5)).toEqual([41, ['claude']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 3, face: faced('*__*') })
  expect(await after(15)).toEqual([26, ['claude']])
  expect(await after(1)).toEqual([25, ['success']])
  expect(await after(25)).toEqual([0, ['success']])
  // Down onto the week's: eight cells left, in red, and everywhere along it a face to match.
  expect(await after(1)).toEqual([0, ['error']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 6, face: FACE.strained })
  expect(await after(5)).toEqual([5, ['error']])
  expect(await after(1)).toEqual([6, ['claude']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 6, face: FACE.strained })
})

test('where the bar over its head is the colour it would take, the mascot keeps its own: it is never lost against that bar', SLOW, async ($, on) => {
  // Both limits in the green: of forty-seven cells the five hours have twenty-eight left, the week thirty-seven.
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 20, resetsAt: later }] })
  await begin($)
  const ui = await mount($, 120)
  await turnStart($, 'work')
  const after = async (seconds: number): Promise<[number | undefined, number | undefined, unknown[]]> => {
    await world.clock.advance(seconds * 1_000)
    const found = mascotOf(await linesOf(ui))

    return [found?.row, found?.at, await mascotColours(ui)]
  }

  // On the five hours' bar it is under the context bar, whose colours are not the limit's: green.
  expect(await after(83)).toEqual([3, 0, ['success']])
  // On the week's, where the five hours' green is right over its head (its four cells, not its arms), its own.
  expect(await after(1)).toEqual([6, 0, ['claude']])
  expect(await after(26)).toEqual([6, 26, ['claude']])
  // Past the last cell the five hours have left there is only the track over it, and under it still the
  // week's green: now it can wear that.
  expect(await after(1)).toEqual([6, 27, ['success']])
  expect(await after(7)).toEqual([6, 34, ['success']])
  // And over what is gone of the week, its own again.
  expect(await after(1)).toEqual([6, 35, ['claude']])
})

test('while it walks it smiles: another smile every eight steps, a wink in the middle of every other, and dollars in its eyes over the cost bar', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1 })
  await begin($)
  const ui = await mount($, 200)
  await turnStart($, 'work')
  const faces: Record<number, string> = {}
  const rows: Record<number, number> = {}

  // A scene of seventy-nine cells: seventy-four steps a bar, so the cost bar is walked from the 74th.
  for (let step = 1; step <= 112; step += 1) {
    await world.clock.advance(1_000)
    const found = mascotOf(await linesOf(ui))
    faces[step] = found?.face ?? ''
    rows[step] = found?.row ?? -1
  }

  expect([1, 7, 8, 11, 12, 13, 16, 24, 28, 29, 32, 40, 44, 48].map(step => faces[step])).toEqual(
    ['^__^', '^__^', '^uu^', '^uu^', '^__~', '^uu^', 'n__n', '^ww^', '~__^', '^ww^', '^oo^', '*__*', '^__~', '^__^'].map(faced),
  )
  // Every face it wears while it walks is one of its smiles.
  expect(Object.values(faces).every(face => SMILES.map(faced).includes(face))).toBe(true)
  // The seventh smile is the cost bar's own: over the context bar the six come round again instead.
  expect([rows[48], faces[48]]).toEqual([0, faced('^__^')])
  expect([rows[104], faces[104], faces[108], faces[111]]).toEqual([3, faced('$__$'), faced('^__~'), faced('$__$')])
  expect(Object.entries(faces).filter(([, face]) => face === faced('$__$')).every(([step]) => rows[Number(step)] === 3)).toBe(true)
})

test('its face is strained wherever the meter under it has less than a fifth left, working or not', SLOW, async ($, on) => {
  // 120k of messages: 140k in use, 27k free of the 167k there is before compaction. Less than a fifth.
  const world = engine(on, { messages: 120_000, windows: [{ kind: 'five_hour', percentUsed: 81 }] })
  await begin($)
  const ui = await mount($, 120)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, face: FACE.strained })
  await turnStart($, 'work')
  await world.clock.advance(1_000)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, at: 1, face: FACE.strained })

  // With a fifth or more free it is at ease again.
  world.messages = 110_000
  await measure($, 'context')
  expect(mascotOf(await linesOf(ui))).toMatchObject({ face: faced('^__^') })
  await turnEnd($)
  await stop($, [])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ face: FACE.asleep })
})

test('the hourly rate is the ledger\'s to say, not the band\'s', SLOW, async ($, on) => {
  const world = engine(on, { usd: 0 })
  await begin($)
  const ui = await mount($, 120)
  await turnStart($, 'work')
  await world.clock.advance(90_000)
  world.usd = 0.5
  await turnEnd($)

  expect(saidOf((await linesOf(ui))[5]!, 120)).toBe('Cost     $0.50 · This prompt $0.50')
  expect((await linesOf(ui)).join('\n')).not.toContain('/h')
  expect((await command($, 'costs')).text).toContain('Working time:     90 steps (1m) · $20.00/h while working')
})

test('a background shell or subagent keeps the mascot walking after the turn; a monitor alone does not', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 120)
  const at = async (): Promise<number | undefined> => mascotOf(await linesOf(ui))?.at
  await turnStart($, 'work')
  await turnEnd($)

  await stop($, ['monitor'])
  await world.clock.advance(2_000)
  expect(await at()).toBe(0)

  await stop($, ['shell', 'monitor'])
  await world.clock.advance(2_000)
  expect(await at()).toBe(2)

  await subagentStop($, [])
  await world.clock.advance(2_000)
  expect(await at()).toBe(2)
  // The steps are kept by day in this session's own file.
  expect(fileOf(world, 'days/session-one.json')).toEqual({ '2026-10-04': { steps: 2, usd: 0 } })
})

test('a subagent already running when the mod loads is background work', SLOW, async ($, on) => {
  const world = engine(on)
  world.agents = [{ id: 'agent-1', type: 'general-purpose', description: 'long job', status: 'running' }]
  await begin($)
  const ui = await mount($, 120)
  await world.clock.advance(4_000)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, at: 4 })
})

test('a limit bar shows what is left of its window, draining, in the colour of how much that is, and says it in the bar', SLOW, async ($, on) => {
  const world = engine(on, { windows: twoWindows })
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)
  // With no cost reported there is no cost bar: the context bar, then the two limits, a bar each.
  expect(rows).toHaveLength(9)
  expect([5, 8].map(i => saidOf(textOf(rows[i]!), 120))).toEqual(['', ''])
  // What is left is the filled part: green above half, red under a fifth. The words are cut out of it
  // in the colour for that, stand plain over what is gone, and the rest of what is gone is the track.
  expect(barOf(rows[5]!)).toEqual([
    [' 5h limit · 60% left · Reset', 'success', WORD],
    ['s in 1h 20m ', TRACK, undefined],
    ['░'.repeat(7), TRACK, TRACK],
  ])
  expect(barOf(rows[8]!)).toEqual([
    [' Week li', 'error', WORD],
    ['mit · 15% left · Resets in 3d 5h ', TRACK, undefined],
    ['░'.repeat(6), TRACK, TRACK],
  ])
  // Written for the other sessions, stamped with when it was read.
  expect(fileOf(world, 'limits.json')).toMatchObject({ at: NOW, windows: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day' }] })
})

test('what a limit bar says is as long as the bar has room for', SLOW, async ($, on) => {
  engine(on, { windows: twoWindows })
  await begin($)
  const five = async (columns: number): Promise<string> => {
    const ui = await mount($, columns)
    const scene = sceneOf((await linesOf(ui))[5]!, columns)
    await ui.unmount()

    return scene
  }

  // Forty-seven cells hold it all; twenty-four, the title and what is left; twenty-three, the same.
  expect(await five(120)).toBe(`${FIVE}${'░'.repeat(7)}`)
  expect(trackOf(62)).toBe(24)
  expect(await five(62)).toBe(` 5h limit · 60% left ${'░'.repeat(3)}`)
  expect(trackOf(60)).toBe(23)
  expect(await five(60)).toBe(` 5h limit · 60% left ${'░'.repeat(2)}`)
})

test('a countdown moves on while nothing else does: the band is drawn again every minute', SLOW, async ($, on) => {
  const world = engine(on, { windows: twoWindows })
  await begin($)
  const ui = await mount($, 120)
  const fiveHours = async (): Promise<string> => sceneOf((await linesOf(ui))[5]!, 120).slice(0, 40)

  await world.clock.advance(59_000)
  expect(await fiveHours()).toBe(FIVE)
  await world.clock.advance(1_000)
  expect(await fiveHours()).toBe(' 5h limit · 60% left · Resets in 1h 19m ')
})

test('a reading another session wrote shows here within five seconds; an older one does not', SLOW, async ($, on) => {
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40 }] })
  await begin($)
  const ui = await mount($, 100)
  // One window, with no reset told: thirty-nine cells, twenty-three of them left.
  const bar = async (): Promise<string> => sceneOf((await linesOf(ui))[5]!, 100)
  expect(trackOf(100)).toBe(39)
  expect(await bar()).toBe(` 5h limit · 60% left ██${'░'.repeat(16)}`)

  put(world, 'limits.json', { at: NOW - 60_000, windows: [{ kind: 'five_hour', percentUsed: 5 }] })
  await world.clock.advance(5_000)
  expect(await bar()).toBe(` 5h limit · 60% left ██${'░'.repeat(16)}`)

  put(world, 'limits.json', { at: NOW + 4_000, windows: [{ kind: 'five_hour', percentUsed: 90, resetsAt: new Date(NOW - 1_000).toISOString() }] })
  await world.clock.advance(5_000)
  expect(await bar()).toBe(` 5h limit · 10% left · Reset due ${'░'.repeat(6)}`)
  // A tenth of thirty-nine cells, a part keeping a cell: five, in red.
  expect(barOf((await rowsOf(ui))[5]!)[0]).toEqual([' 5h l', 'error', WORD])
})

test('an account with no limit window gets the month\'s spend: growing, or draining a budget once one is set', SLOW, async ($, on) => {
  const world = engine(on, { usd: 100 })
  await begin($)
  const ui = await mount($, 120)
  const month = async (): Promise<{ bar: string; said: string; ground: unknown }> => {
    const found = (await rowsOf(ui))[8]!

    return { bar: sceneOf(textOf(found), 120), said: saidOf(textOf(found), 120), ground: barOf(found)[0]?.[1] }
  }
  // Nothing spent since tracking began: an empty bar toward the first round figure.
  expect(await month()).toEqual({ bar: ` Month · $0.00 spent · Bar full at $1.00 ${'░'.repeat(6)}`, said: '', ground: TRACK })

  await turnStart($, 'spend')
  world.usd = 103.04
  await turnEnd($)
  expect(await month()).toEqual({ bar: ` Month · $3.04 spent · Bar full at $5.00 ${'░'.repeat(6)}`, said: '', ground: 'permission' })
  // Twenty-eight of the forty-seven cells are spent: $3.04 of $5.00.
  expect(barOf((await rowsOf(ui))[8]!).map(([text, ground]) => [text.length, ground])).toEqual([[28, 'permission'], [13, TRACK], [6, TRACK]])

  expect((await command($, 'budget')).text).toContain('not set')
  expect((await command($, 'budget 8,000')).text).toContain('Budget set: $8,000.00 a month')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: 8000, lines: 'off', isIntroduced: true })
  expect(await month()).toEqual({ bar: ' Month budget · $7,996.96 left of $8,000.00 ██░', said: '', ground: 'success' })

  expect((await command($, 'budget off')).text).toBe('Budget cleared.')
  expect(await month()).toMatchObject({ bar: ` Month · $3.04 spent · Bar full at $5.00 ${'░'.repeat(6)}` })
  // Set from another session: taken up at the next look at the others' files.
  put(world, 'settings.json', { budget: 50, lines: 'off', isIntroduced: true })
  await world.clock.advance(30_000)
  expect((await month()).bar.startsWith(' Month budget · $46.96 left of $50.00 ')).toBe(true)
})

test('a budget with the limit windows: a bar each, the budget\'s under the windows\'', SLOW, async ($, on) => {
  const world = engine(on, { usd: 12.4, windows: twoWindows })
  put(world, 'settings.json', { budget: 200, lines: 'off', isIntroduced: true })
  await begin($)
  const ui = await mount($, 160)
  const lines = await linesOf(ui)

  expect(trackOf(160)).toBe(63)
  expect(lines).toHaveLength(15)
  expect([8, 11, 14].map(i => sceneOf(lines[i]!, 160).replace(/[█░]+$/, ''))).toEqual([FIVE, WEEK, ' Month budget · $200.00 left of $200.00 '])
  expect([8, 11, 14].map(i => saidOf(lines[i]!, 160))).toEqual(['', '', ''])
})

test('the band counts this session\'s steps by day, week from Sunday, month and year; the ledger adds every session\'s on this machine', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1 })
  // This session, on earlier days of this year and month; and another session's days.
  put(world, 'days/session-one.json', { '2026-09-30': { steps: 5, usd: 0 }, '2026-10-03': { steps: 20, usd: 0 }, '2026-10-04': { steps: 3, usd: 0 } })
  put(world, 'days/another-session.json', {
    '2025-12-31': { steps: 999, usd: 9 },
    '2026-09-30': { steps: 7, usd: 2 },
    '2026-10-03': { steps: 100, usd: 1 },
    '2026-10-04': { steps: 10, usd: 0.5 },
  })
  await begin($)
  const ui = await mount($, 120)
  const steps = async (): Promise<string> => saidOf((await linesOf(ui))[1]!, 120)
  const month = async (): Promise<string> => sceneOf((await linesOf(ui))[8]!, 120).replace(/░+$/, '')
  // Today is a Sunday, so the week is today; yesterday is this month's, the 30th of September this year's.
  expect(await steps()).toBe('Steps    Today 3 · Week 3 · Month 23 · Year 28')

  await turnStart($, 'work')
  await world.clock.advance(4_000)
  world.usd = 1.25
  await turnEnd($)
  await stop($, [])
  expect(await steps()).toBe('Steps    Today 7 · Week 7 · Month 27 · Year 32')
  // Neither the other session's steps nor anyone's dollars by period are on the band: the ledger has both.
  expect((await linesOf(ui)).join('\n')).not.toMatch(/Today.*\$/)
  let text = (await command($, 'costs')).text
  expect(text).toContain('This machine:     Steps today 17 · Week 17 · Month 137 · Year 149')
  expect(text).toContain('                    Spend today $0.75 · Week $0.75 · Month $1.75 · Year $3.75')
  // The month's bar is the one part of the band that is every session's: a budget is the account's.
  expect(await month()).toBe(' Month · $1.75 spent · Bar full at $2.00 ')

  // The other session goes on working: its file changes, and the next look takes it up, in the ledger only.
  await world.clock.advance(1_000)
  put(world, 'days/another-session.json', { '2026-10-04': { steps: 1_010, usd: 20.5 } })
  await world.clock.advance(30_000)
  expect(await steps()).toBe('Steps    Today 7 · Week 7 · Month 27 · Year 32')
  text = (await command($, 'costs')).text
  expect(text).toContain('This machine:     Steps today 1,017 · Week 1,017 · Month 1,037 · Year 1,042')
  expect(text).toContain('Spend today $20.75')
  expect(await month()).toBe(' Month · $20.75 spent · Bar full at $50.00 ')
})

test('audit says the figures agree, and says so when they do not', SLOW, async ($, on) => {
  const world = engine(on, { usd: 4, windows: [{ kind: 'five_hour', percentUsed: 10 }] })
  world.last = { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 59_000, cache_creation_input_tokens: 995 }
  await begin($)
  await turnStart($, 'work')
  world.usd = 4.2
  await turnEnd($)

  let text = (await command($, 'audit')).text
  expect(text).toContain('OK   Context: the categories in use add up to 60,000; Claude Code reports 60,000 in use')
  expect(text).toContain('OK   Context: in use, free and buffer add up to 200,000; the window is 200,000')
  expect(text).toContain('OK   Context: 60,000 of 200,000 is 30%')
  expect(text).toContain('Note the last request sent 60,000 tokens in (5 new, 59,000 read from the cache, 995 written to it) and got 7 out')
  expect(text).toContain('OK   Cost: prompts $0.20 + earlier $0.00 + before tracking $4.00 = $4.20; Claude Code reports $4.20')
  expect(text).not.toContain('OFF')

  world.isOffBy = 1_500
  text = (await command($, 'audit')).text
  expect(text).toContain('OFF  Context: the categories in use add up to 60,000; Claude Code reports 61,500 in use')
})

test('with no cost and no limit reported the scene is the context bar alone, and the ledger says so', SLOW, async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const lines = await linesOf(ui)
  // Two free rows, the bar, and under it what it has to say.
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'Model    test-model',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '         ▒ Autocompact buffer 33k',
  ])
  expect(lines.join('\n')).not.toContain('$')
  expect((await command($, 'costs')).text).toBe('No cost is reported for this session.')
  expect((await command($, 'nonsense')).text).toContain('/penny-patrol costs prints the ledger')
})

test('a reading that fails after a tool call leaves the call, run once, and the last reading', SLOW, async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  world.isUsageDown = true
  expect(await call($)).toMatchObject({ result: 'ran' })
  expect(world.toolRuns).toBe(1)
  expect(await ui.find({ type: 'Text', text: '30% · 60k / 200k' })).toBeDefined()
})

test('everything the band names begins with a capital', SLOW, async ($, on) => {
  const world = engine(on, { usd: 2, windows: twoWindows, lines: 'offline' })
  world.last = { input_tokens: 1_200, output_tokens: 900, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 800 }
  await begin($)
  await turnStart($, 'spend')
  world.usd = 2.31
  await call($)
  world.usd = 2.76
  await turnEnd($, 'agent-7')
  await $.classic.PostToolUse({ tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: {}, tool_use_id: 't1', effort: { level: 'high' } })
  const ui = await mount($, 200)
  // The line under the bars is a sentence of its own, under a label that is one of four.
  expect(Object.keys(TOPICS)).toContain((await lineOf(ui))?.label)
  const lines = (await linesOf(ui)).slice(0, -1)
  // What stands for itself on the band: a label, and each thing said after a middle dot or two spaces,
  // beside a bar or in one.
  const named = lines
    .flatMap(line => [...sceneOf(line, 200).split(/ · | {2,}/), ...saidOf(line, 200).split(/ · | {2,}/)])
    .map(item => item.replace(/^[\s█▒░]+|[\s█▒░]+$/g, ''))
    .filter(item => /^[A-Za-z]/.test(item))

  expect(named).toEqual(expect.arrayContaining(['Model', 'High effort', 'Steps', 'Today 0', 'Week 0', 'Month 0', 'Year 0', 'Context', 'Cost', 'This prompt $0.76', 'Main $0.31', 'Subagents $0.45', 'Before tracking $2.00', 'Resets in 1h 20m', 'Week limit']))
  expect(named.filter(item => !/^[A-Z]/.test(item) && !item.startsWith('test-model'))).toEqual([])
})

// What the feeds answer in these tests: the head of a changelog, a search of headlines, two kinds of
// jokes and one outlet's good news, each with what must not get through.
const CHANGELOG = [
  '# Changelog',
  '',
  '## 2.1.288',
  '',
  '- Fixed something dull',
  '- Added recovery for a prompt cleared with Ctrl+C: pressing Up on the empty prompt brings the draft back, including pasted text and images',
  '- Added `$.ui.selection()` for mods: returns the text you last selected',
  '- Added Ctrl+F to find a session by name and Alt+↑/↓ to jump between groups',
  '',
  '## 2.1.287',
  '',
  '- Added a count such as "2 of 5" to the permission prompt when several permission requests stack up',
  '- Added a thing that is cut sho',
].join('\n')
const HEADLINES = JSON.stringify({ hits: [
  { title: 'Getting the most out of Opus 5.5 in Claude and Claude Code', objectID: '101' },
  { title: 'OpenAI safety leader quits, warning AI company\'s culture is \'broken\'', objectID: '102' },
  { title: 'Git 3.0 will default to SHA-256', objectID: '103' },
  { title: 'Show HN: An open-source Lego AI generator', objectID: '104' },
  { title: 'Ask HN: Is AI worth it for a small team?', objectID: '105' },
  { title: 'An AI story \u001b[31mwith an escape in it', objectID: '106' },
  { title: 'A researcher has "zero concerns" about AI wiping out humanity', objectID: '107' },
] })
const DAD_JOKES = JSON.stringify({ results: [
  { joke: 'A steak pun is a rare medium well done.' },
  { joke: 'Why did the tomato blush?\r\nBecause it saw the salad dressing.' },
  { joke: 'Short.' },
  { joke: 'Why did the half blind man fall in the well? Because he could not see that well!' },
] })
const CODE_JOKES = JSON.stringify({ jokes: [
  { type: 'twopart', setup: 'Why did the functional programmer get thrown out of school?', delivery: 'Because he refused to take classes.' },
  { type: 'single', joke: 'Yo mama is so old, she knew Burger King while he was still a prince.' },
] })
const GOOD_NEWS = [
  '<rss><channel><title>Good News Network</title>',
  '<item><title>Underwater Umbrellas Could Protect Coral Reefs From Heat Damage</title><link>https://www.goodnewsnetwork.org/underwater-umbrellas/</link></item>',
  '<item><title><![CDATA[Rare &#8216;Ghost Lobster&#8217; Goes to School to Help Scientists &#8211; LOOK]]></title><link>https://www.goodnewsnetwork.org/ghost-lobster/</link></item>',
  '<item><title>Good News in History, October 5</title><link>https://www.goodnewsnetwork.org/history/</link></item>',
  '<item><title>Town Rallies After Crash Kills Two</title><link>https://www.goodnewsnetwork.org/sad/</link></item>',
  '<item><title>Your Weekly Horoscope &#8211; by a Columnist</title><link>https://www.goodnewsnetwork.org/horoscope/</link></item>',
  '<item><title>Scientists Crack a Genetic Mystery&#8211;in Time for Halloween</title><link>https://www.goodnewsnetwork.org/mystery/</link></item>',
  '<item><title>Nonprofit Brings Free Music Education to 20,000 Students</title><link>https://evil.example.com/steal</link></item>',
  '</channel></rss>',
].join('\n')
const online = (world: World): void => {
  world.feeds.set('https://raw.githubusercontent.com/', CHANGELOG)
  world.feeds.set('https://hn.algolia.com/', HEADLINES)
  world.feeds.set('https://icanhazdadjoke.com/', DAD_JOKES)
  world.feeds.set('https://v2.jokeapi.dev/', CODE_JOKES)
  world.feeds.set('https://www.goodnewsnetwork.org/', GOOD_NEWS)
}
const kept = { at: NOW, notes: [
  { topic: 'news', text: 'Underwater Umbrellas Could Protect Coral Reefs From Heat Damage', by: 'Good News Network', href: 'https://www.goodnewsnetwork.org/underwater-umbrellas/' },
  { topic: 'news', text: 'Nairobi Is Transforming Neglected Libraries Into Vibrant Civic Hubs', by: 'Reasons to be Cheerful' },
] }

test('the line under the bars: something about AI, a joke, good news, by turns, another each time the mascot has walked a bar\'s length', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'live' })
  put(world, 'lines.json', kept)
  await begin($)
  const ui = await mount($, 220)
  await turnStart($, 'work')
  // A scene of eighty-seven cells: eighty-two steps a bar. Three bars over it: nine rows, and the line.
  expect(trackOf(220)).toBe(87)
  expect(await rowsOf(ui)).toHaveLength(10)
  const seen: Array<{ label: string; color: unknown; text: string }> = []

  for (let pass = 0; pass < 6; pass += 1) {
    const first = await lineOf(ui)
    await world.clock.advance(81_000)
    // The same thing all the way along the bar; another at the next.
    expect((await lineOf(ui))?.text).toBe(first?.text)
    await world.clock.advance(1_000)
    seen.push({ label: first?.label ?? '', color: first?.color, text: first?.text ?? '' })
  }

  expect(seen.map(note => note.label)).toEqual(['AI', 'Joke', 'Good news', 'AI', 'Joke', 'Good news'])
  expect(seen.map(note => note.color)).toEqual(seen.map(note => TOPICS[note.label]))
  expect(new Set(seen.map(note => note.text)).size).toBe(6)
  // Good news is only ever what a feed gave, and it says where it was read: as a link when it has one.
  expect(seen.filter(note => note.label === 'Good news').map(note => note.text).sort()).toEqual([
    'Nairobi Is Transforming Neglected Libraries Into Vibrant Civic Hubs · Reasons to be Cheerful',
    'Underwater Umbrellas Could Protect Coral Reefs From Heat Damage · Good News Network',
  ])
  await world.clock.advance(1_000 * 82 * 2)
  const pieces = (await lineOf(ui))?.pieces ?? []
  const where = pieces.at(-1)
  expect(pieces.map(piece => piece.text.trimEnd())[0]).toBe('Good news')
  expect(where?.text === 'Good News Network' ? where.href : 'no link').toBe(where?.text === 'Good News Network' ? 'https://www.goodnewsnetwork.org/underwater-umbrellas/' : 'no link')
  // Nothing but the settings and what the feeds gave decides it: no request was made for a kept read.
  expect(world.fetched).toEqual([])
})

test('a note too long for the band is passed over for one that fits; the line gives way before the scene does', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  await begin($)
  const ui = await mount($, 70)
  await turnStart($, 'work')
  const texts: string[] = []

  // Fifty-seven cells for the note at seventy columns.
  for (let pass = 0; pass < 12; pass += 1) {
    texts.push((await lineOf(ui))?.text ?? '')
    await world.clock.advance(1_000 * (trackOf(70) - 5))
  }

  // Few of the notes that come with the mod are this short: they take their turns, whole, and none of
  // the longer ones is shown cut.
  expect(texts.every(text => text.length > 0 && text.length <= 57)).toBe(true)
  expect(new Set(texts).size).toBeGreaterThanOrEqual(4)
  expect(texts.slice(0, new Set(texts).size)).toEqual([...new Set(texts)])
  await ui.unmount()

  // Nine rows of scene and one of line: with ten rows the line is there, with nine it is not, and the
  // scene still is.
  const all = await mount($, 120, 10)
  expect(await rowsOf(all)).toHaveLength(10)
  expect(await lineOf(all)).not.toBeNull()
  await all.unmount()
  const scene = await mount($, 120, 9)
  expect(await rowsOf(scene)).toHaveLength(9)
  expect(await lineOf(scene)).toBeNull()
  expect(mascotOf(await linesOf(scene))).not.toBeNull()
})

test('the feeds are read through the host when what they gave is old, made fit to draw, and kept for every session', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  online(world)
  await begin($)
  // Not while the session starts: a little after.
  expect(world.fetched).toEqual([])
  await world.clock.advance(4_000)

  expect(world.fetched.map(asked => /^https:\/\/([^/]+)/.exec(asked.url)?.[1])).toEqual([
    'raw.githubusercontent.com', 'hn.algolia.com', 'icanhazdadjoke.com', 'v2.jokeapi.dev', 'www.goodnewsnetwork.org', 'reasonstobecheerful.world', 'www.optimistdaily.com',
  ])
  // The changelog's head only, and the jokes as data.
  expect(world.fetched[0]?.headers).toEqual({ Range: 'bytes=0-60000' })
  expect(world.fetched[2]?.headers).toEqual({ Accept: 'application/json' })
  expect(world.fetched[2]?.url).toMatch(/[?&]page=([1-9]|1\d|20)$/)
  const file = fileOf(world, 'lines.json') as { at: number; notes: Array<{ topic: string; text: string; by?: string; href?: string }> }
  expect(file.at).toBe(NOW + 4_000)
  expect(file.notes).toEqual([
    // What was added, release by release: not the plumbing, not a line with a character that is no Latin
    // letter, not the line the read cut short.
    { topic: 'ai', text: 'New in Claude Code 2.1.288: recovery for a prompt cleared with Ctrl+C: pressing Up on the empty prompt brings the draft back, including pasted text and images', by: 'changelog', href: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md' },
    { topic: 'ai', text: 'New in Claude Code 2.1.287: a count such as "2 of 5" to the permission prompt when several permission requests stack up', by: 'changelog', href: 'https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md' },
    // Headlines about AI, none of them grim or doom-laden, none a question, and never one with an escape in
    // it.
    { topic: 'ai', text: 'Getting the most out of Opus 5.5 in Claude and Claude Code', by: 'Hacker News', href: 'https://news.ycombinator.com/item?id=101' },
    { topic: 'ai', text: 'An open-source Lego AI generator', by: 'Hacker News', href: 'https://news.ycombinator.com/item?id=104' },
    { topic: 'joke', text: 'A steak pun is a rare medium well done.' },
    { topic: 'joke', text: 'Why did the tomato blush? Because it saw the salad dressing.' },
    { topic: 'joke', text: 'Why did the functional programmer get thrown out of school? Because he refused to take classes.' },
    // Jokes at nobody's expense; and good news: entities and typography made plain, nothing grim, nothing
    // about the outlet itself or its horoscope, and a link only to the outlet's own pages.
    { topic: 'news', text: 'Underwater Umbrellas Could Protect Coral Reefs From Heat Damage', by: 'Good News Network', href: 'https://www.goodnewsnetwork.org/underwater-umbrellas/' },
    { topic: 'news', text: 'Rare \'Ghost Lobster\' Goes to School to Help Scientists', by: 'Good News Network', href: 'https://www.goodnewsnetwork.org/ghost-lobster/' },
    { topic: 'news', text: 'Scientists Crack a Genetic Mystery - in Time for Halloween', by: 'Good News Network', href: 'https://www.goodnewsnetwork.org/mystery/' },
    { topic: 'news', text: 'Nonprofit Brings Free Music Education to 20,000 Students', by: 'Good News Network' },
  ])

  // What was read is on the line, by turns with what came with the mod.
  const ui = await mount($, 220)
  await turnStart($, 'work')
  const labels: string[] = []

  for (let pass = 0; pass < 3; pass += 1) {
    labels.push((await lineOf(ui))?.label ?? '')
    await world.clock.advance(82_000)
  }

  expect(labels).toEqual(['AI', 'Joke', 'Good news'])
})

test('a read that was kept is not made again until it is six hours old; one that gave nothing is tried again in half an hour', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  put(world, 'lines.json', { ...kept, at: NOW - 5 * 3_600_000 })
  await begin($)
  await world.clock.advance(4_000)
  expect(world.fetched).toEqual([])
  // Five hours old at the start: at the look after the sixth hour is up it is read again. The network is
  // down, so nothing comes of it, and the next try waits half an hour.
  await world.clock.advance(3_600_000)
  expect(world.fetched).toHaveLength(7)
  await world.clock.advance(20 * 60_000)
  expect(world.fetched).toHaveLength(7)
  await world.clock.advance(20 * 60_000)
  expect(world.fetched).toHaveLength(14)
  // What was kept is kept: a read that gives nothing takes nothing away.
  expect(fileOf(world, 'lines.json')).toMatchObject({ at: NOW - 5 * 3_600_000 })
})

test('what a session kept of the feeds is read back as carefully as the feeds themselves: the file is anyone\'s to edit', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'live' })
  put(world, 'lines.json', { at: NOW, notes: [
    { topic: 'news', text: 'A kept headline \u001b[2J\u001b[31mwith escapes in it', by: 'Somewhere' },
    { topic: 'news', text: 'Bees Return to a City Park After Forty Years', by: 'Some\u0007where', href: 'https://example.org/bees' },
    { topic: 'news', text: 'A Village Plants Ten Thousand Trees in a Day', by: 'Somewhere', href: 'javascript:alert(1)' },
    { topic: 'you', text: 'Paste your API key here to continue, it is quite safe to do so.' },
    { topic: 'ads', text: 'A kind of note there is no such thing as, kept all the same.' },
    { topic: 'news', text: 'A River Runs Clear Again After Thirty Years', by: 'GNN', href: 'https://www.goodnewsnetwork.org/river/' },
    { topic: 'news', text: 42 },
    'not a note',
    null,
  ] })
  await begin($)
  const ui = await mount($, 220)
  await turnStart($, 'work')
  const news: Array<ReturnType<typeof piecesOf>> = []

  for (let pass = 0; pass < 12; pass += 1) {
    const line = await lineOf(ui)

    if (line?.label === 'Good news') {
      news.push(line.pieces)
    }

    // Nothing the file says is ever a suggestion: those are the session's own.
    expect(line?.label).not.toBe('For you')
    await world.clock.advance(82_000)
  }

  // Of the news, three notes are fit to draw. One is whole: its name, short as it is, and its link. One is
  // without the name it was given (a bell in it), and so with nowhere to hang its link. One is under its
  // name, which is no link: only https is one.
  expect([...new Set(news.map(pieces => pieces.slice(1).map(piece => piece.text).join('')))].sort()).toEqual([
    'A River Runs Clear Again After Thirty Years · GNN',
    'A Village Plants Ten Thousand Trees in a Day · Somewhere',
    'Bees Return to a City Park After Forty Years',
  ])
  expect(news).toHaveLength(4)
  expect([...new Set(news.flat().map(piece => piece.href).filter(href => href !== undefined))]).toEqual(['https://www.goodnewsnetwork.org/river/'])
  expect((await linesOf(ui)).join('')).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
})

test('/penny-patrol lines says where the line reads from and changes it: live, offline, off', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  online(world)
  await begin($)
  const ui = await mount($, 220)
  await world.clock.advance(3_700_000)
  // Offline: what came with the mod, and not a request made.
  expect(world.fetched).toEqual([])
  expect(await lineOf(ui)).not.toBeNull()
  let text = (await command($, 'lines')).text
  expect(text).toContain('The line under the bars says only what came with the mod; nothing is read from the web.')
  expect(text).toContain('raw.githubusercontent.com, hn.algolia.com, icanhazdadjoke.com, v2.jokeapi.dev, www.goodnewsnetwork.org, reasonstobecheerful.world, www.optimistdaily.com')

  // Live: read at once, and said.
  text = (await command($, 'lines live')).text
  expect(world.fetched).toHaveLength(7)
  expect(text).toContain('The line under the bars is live: what came with the mod, and 11 notes read from the feeds 0s ago.')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: null, lines: 'live', isIntroduced: true })

  // Off: no line, the scene as it was.
  expect((await command($, 'lines off')).text).toContain('The line under the bars is off.')
  expect(await rowsOf(ui)).toHaveLength(9)
  expect(await lineOf(ui)).toBeNull()
  expect((await command($, 'lines sideways')).text).toContain('Say live, offline or off.')
  // Another session's choice is taken up at the next look at the settings.
  put(world, 'settings.json', { budget: null, lines: 'offline', isIntroduced: true })
  await world.clock.advance(30_000)
  expect(await lineOf(ui)).not.toBeNull()
})

test('on a machine that has not been told, the line says once that it reads the web and how to stop it', SLOW, async ($, on) => {
  const world = engine(on, { lines: null })
  await begin($)
  const ui = await mount($, 220)
  const first = await lineOf(ui)

  expect(first).toMatchObject({ label: 'For you', color: 'warning' })
  expect(first?.text).toBe('This line also reads a few public feeds for fresh jokes, AI news and good news. /penny-patrol lines offline keeps it to what came with the mod.')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: null, lines: 'live', isIntroduced: true })
  // It holds the line for ninety steps of the mascot's, then the notes take their turns.
  await turnStart($, 'work')
  await world.clock.advance(89_000)
  expect((await lineOf(ui))?.label).toBe('For you')
  await world.clock.advance(1_000)
  expect((await lineOf(ui))?.label).not.toBe('For you')
})

test('every five to ten prompts the line makes a suggestion from the session\'s own figures, and holds it', SLOW, async ($, on) => {
  // 152k of messages: the window is 86% full, which is the most pressing thing there is to say.
  const world = engine(on, { usd: 1, messages: 152_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  const suggested: Array<{ at: number; text: string }> = []
  let before = ''

  for (let prompt = 1; prompt <= 22; prompt += 1) {
    await turnStart($, `prompt number ${prompt} asks for something`)
    const line = await lineOf(ui)

    if (line?.label === 'For you' && line.text !== before) {
      suggested.push({ at: prompt, text: line.text })
      before = line.text
    }

    world.usd = (world.usd ?? 0) + 0.25
    await turnEnd($)
  }

  // The first comes with the fifth to the tenth prompt, the next five to ten prompts after it.
  expect(suggested.length).toBeGreaterThanOrEqual(2)
  expect(suggested[0]!.at).toBeGreaterThanOrEqual(5)
  expect(suggested[0]!.at).toBeLessThanOrEqual(10)
  expect(suggested[1]!.at - suggested[0]!.at).toBeGreaterThanOrEqual(5)
  expect(suggested[1]!.at - suggested[0]!.at).toBeLessThanOrEqual(10)
  expect(suggested[0]!.text).toBe('Context is 86% full. /compact now, or /clear if the task has changed: every request sends all 172k tokens again.')
  // What was just said is not said again while there is something else: the session's own account.
  expect(suggested[1]!.text).toMatch(/^\d+ prompts so far for \$\d+\.\d\d: \$0\.25 each on average\. \/penny-patrol costs says what each one cost, and why\.$/)
  // It holds the line while the mascot takes ninety steps, however many bars that is; then the notes return.
  await turnStart($, 'work')
  const held = (await lineOf(ui))?.label
  await world.clock.advance(90_000)
  expect((await lineOf(ui))?.label).not.toBe('For you')
  expect(['For you', 'AI', 'Joke']).toContain(held)
})

test('what the suggestions are made of: what every request carries, how the turns went, how the prompts were put', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'offline', windows: [{ kind: 'five_hour', percentUsed: 82, resetsAt: soon }] })
  world.memory = [{ path: '/home/kumar/.claude/CLAUDE.md', type: 'User', tokens: 2_400 }, { path: '/work/memory/MEMORY.md', type: 'AutoMem', tokens: 6_100 }]
  world.mcp = [
    { name: 'mcp__figma__get_design', serverName: 'figma', tokens: 9_000, isLoaded: true },
    { name: 'mcp__figma__use', serverName: 'figma', tokens: 3_000, isLoaded: true },
    { name: 'mcp__gmail__send', serverName: 'gmail', tokens: 2_000, isLoaded: true },
    { name: 'mcp__drive__read', serverName: 'drive', tokens: 40_000, isLoaded: false },
  ]
  await begin($)
  const ui = await mount($, 220)
  const said = new Set<string>()

  const order: string[] = []

  // Terse prompts, every one of them stopped: seventy of them, so every suggestion has its turn.
  for (let prompt = 1; prompt <= 70; prompt += 1) {
    await turnStart($, 'fix it')
    const line = await lineOf(ui)

    if (line?.label === 'For you' && !said.has(line.text)) {
      said.add(line.text)
      order.push(line.text.split(/[ :]/)[0] ?? '')
    }

    await turnEnd($, undefined, undefined, 'aborted')
  }

  // The most pressing first, and none said twice before each has been said once.
  expect(order).toEqual(['5h', 'MCP', 'Memory', 'You', 'Your', 'The'])

  expect([...said].sort()).toEqual([
    '5h limit: 18% left for the next 1h 20m. Put the small asks into one prompt, and keep the big ones for after the reset.',
    'MCP tools are 14k tokens of every request, 12k of them from "figma". /mcp switches off the servers this task does not need.',
    'Memory files are 8.5k tokens of every request; the largest is MEMORY.md (6.1k). /memory opens them: keep what still changes how Claude works.',
    'The window is 30% in use. /context shows what is filling it, category by category.',
    'You stopped 7 of your last 8 turns. Plan mode (Shift+Tab) agrees the approach before tokens are spent on doing it.',
    'Your last 6 prompts averaged 2 words. Name the file, the goal and what done looks like: one clear ask beats three corrections.',
  ].sort())
})

test('the suggestions that are about money: a prompt far dearer than the rest, the subagents\' share, a cache gone cold, a cache kept warm', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  // Each suggestion as it is made: one holds the line until the next.
  const said: string[] = []
  const ask = async (text: string, spend: number, used: TurnUsage, agentSpend = 0): Promise<void> => {
    await turnStart($, text)
    const line = await lineOf(ui)

    if (line?.label === 'For you' && line.text !== said.at(-1)) {
      said.push(line.text)
    }

    if (agentSpend > 0) {
      world.usd = (world.usd ?? 0) + agentSpend
      await turnEnd($, 'agent-1')
    }

    world.usd = (world.usd ?? 0) + spend
    await turnEnd($, undefined, used)
  }

  // Steady prompts, nearly all of their input read from the cache; then a break of twenty minutes, after
  // which one prompt writes the whole conversation to the cache again and costs ten times the others.
  for (let prompt = 1; prompt <= 12; prompt += 1) {
    await ask('change the limit bars so that they say what is left', 0.2, tokens(500, 800, 60_000, 400))
  }

  await world.clock.advance(20 * 60_000)
  await ask('and now the week bar as well, the same way', 2.4, tokens(900, 700, 2_000, 58_000))
  // Another dear one right after, though less so: of two not yet said, the dearer is the one to say.
  await ask('and the month bar too, while you are there', 1.2, tokens(700, 900, 61_000, 500))

  // What that turn's end noted is kept until a suggestion is due, however many prompts later that is.
  for (let prompt = 1; prompt <= 45; prompt += 1) {
    await ask('look this up for me in the other repository', 0.1, tokens(400, 300, 61_000, 300), 0.5)
  }

  const all = said
  // Each of the two was said, and once: a turn's end is not news twice, however often the rest come round.
  expect(all.filter(text => text.startsWith('One prompt cost'))).toEqual(['One prompt cost $2.40, 12 times what this session\'s prompts usually do. Point Claude at the files and lines that matter, not the whole tree.'])
  expect(all.filter(text => text.startsWith('After a'))).toEqual(['After a 20m break, one prompt wrote 58k tokens to the prompt cache again. /compact before you step away, and the way back is cheaper.'])
  expect(all.length).toBeGreaterThan(new Set(all).size - 1)
  expect(all.some(text => /^Subagents are \d\d% of what this session has spent \(\$\d+\.\d\d\)\. For a small lookup, ask Claude to do it inline\.$/.test(text))).toBe(true)
  expect(all.some(text => /^9\d% of this session's input came from the prompt cache, where it costs about a tenth\. Back-to-back prompts keep it warm\.$/.test(text))).toBe(true)
})
