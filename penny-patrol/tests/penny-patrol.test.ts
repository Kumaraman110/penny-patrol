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
// What a bar's free or spent stretch is drawn on (black, whatever the theme), the white of the words over
// it, and the colour of words cut out of a part.
const TRACK = '#000000'
const TRACK_WORD = '#ffffff'
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
  on('session.compact', (_$, e) => ({ messages: e.messages }))
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

const mount = ($: Engine, bodyColumns: number, maxRows = 40, hasSurvey = false, surface: 'terminal' | 'desktop' = 'terminal') =>
  $.ui.mount({
    plugin: 'penny-patrol',
    surface,
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
  })

type Band = Awaited<ReturnType<typeof mount>>

const command = ($: Engine, args = '') =>
  $.command.run({ command: 'penny-patrol', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })

// A tool call of the main loop's.
const call = ($: Engine) => $.tool.call({ tool: 'Bash', command: 'true' })
const measure = ($: Engine, changed: 'context' | 'cost') => $.session.measure({ context: { window: 200_000 }, rateLimits: [], changed: [changed] })
// The account's windows as a response just reported them.
const measureLimits = ($: Engine, world: World) => $.session.measure({ context: { window: 200_000 }, rateLimits: world.windows, changed: ['rateLimits'] })
// The conversation compacted: by the person's /compact, or by the engine at its threshold.
const SUMMARY = [{ role: 'user' as const, text: 'What the conversation came to, in a few lines.', toolUses: [] }]
const compact = ($: Engine, trigger: 'manual' | 'auto' = 'manual') => $.session.compact({ trigger, messages: SUMMARY })
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

// The drawing as rows, and what each row holds. A link is its label or, with none, its address.
const isEl = (node: El | string): node is El => typeof node !== 'string'
const textOf = (node: El | string): string =>
  isEl(node) ? (node.type === 'Link' ? String(node.props?.label ?? node.props?.href ?? '') : (node.children ?? []).map(textOf).join('')) : node
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
// Prompts until the line makes a suggestion it has not made (the tenth prompt at the latest), and what
// it suggests.
const suggestion = async ($: Engine, ui: Band, made: string[] = [], text = 'a prompt put with enough words to be a clear ask'): Promise<string> => {
  for (let prompt = 0; prompt < 10; prompt += 1) {
    await turnStart($, text)
    const line = await lineOf(ui)
    await turnEnd($)

    if (line?.label === 'For you' && !made.includes(line.text)) {
      return line.text
    }
  }

  return ''
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

test('the scene and the readout: a limit first with the model beside it, the context and the cost with what they say, then the week with the steps', SLOW, async ($, on) => {
  const world = engine(on, { usd: 2, windows: twoWindows })
  world.last = { input_tokens: 1_200, output_tokens: 900, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 800 }
  await begin($)
  const ui = await mount($, 120)
  const lines = await linesOf(ui)

  expect(trackOf(120)).toBe(47)
  // A limit bar says what it has to say itself, so the line beside it is another's: the model beside the
  // five hours, the steps beside the week. What the context and the cost say is beside and under them;
  // the cost is each window's, and what was spent before the session first looked is neither's.
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    '',
    '',
    'Model    test-model',
    '',
    '',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '         Last request: 60k in (58k cached) · 900 out',
    'Cost     5h $0.00 · Week $0.00',
    '',
    '',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
  ])
  const scene = lines.map(line => sceneOf(line, 120))
  // The mascot stands over the first bar, at its left, and nothing else is in the free rows.
  expect(scene[0]).toBe(FACE.asleep.padEnd(47))
  expect(scene[1]).toBe(LEGS[0]!.padEnd(47))
  expect([3, 4, 6, 7, 9, 10].map(i => scene[i])).toEqual(Array.from({ length: 6 }, () => ' '.repeat(47)))
  // The five hours, with what is left written in it from its second cell; the context bar, what is in use
  // and then what is free and nothing after it; an empty cost bar, nothing having been seen spent; the week.
  expect(scene[2]).toBe(`${FIVE}${'░'.repeat(7)}`)
  expect(scene[5]).toHaveLength(47)
  expect(scene[5]).toMatch(/^█+░+$/)
  expect(scene[8]).toBe('░'.repeat(47))
  expect(scene[11]).toBe(`${WEEK}${'░'.repeat(6)}`)
  // No row is wider than the band.
  expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(118)
})

test('every cell of a bar is drawn as background: a part in its colour, what is free in black; the autocompact buffer is no part of the bar', SLOW, async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)

  // The engine lists the buffer before the free space, and a deferred row among them. The bar has neither:
  // it is what is in use and what is free, so it is full when compaction is due. A part's glyph is in its
  // own colour, so the cell is one block whatever the terminal's line spacing.
  expect(barOf(rows[2]!).map(([text, ground, color]) => [text[0], ground, color])).toEqual([
    ['█', 'promptBorder', 'promptBorder'],
    ['█', 'inactive', 'inactive'],
    ['█', 'purple', 'purple'],
    ['░', TRACK, TRACK],
  ])
  // Forty-seven cells for 4k, 16k and 40k in use and 107k free, each part keeping a cell.
  expect(barOf(rows[2]!).map(([text]) => text.length)).toEqual([2, 5, 11, 29])
  // The legend's swatches are the bar's, and it has no entry for the buffer either: nothing is under it.
  const legend = piecesOf(rows[3]!).filter(piece => piece.text === '█')
  expect(legend.map(piece => piece.color)).toEqual(['promptBorder', 'inactive', 'purple'])
  expect(rows).toHaveLength(4)
  expect((await linesOf(ui)).join('\n')).not.toMatch(/deferred|buffer|▒/i)
  // A label is dim, what a bar's own line says is not, a legend is.
  expect(piecesOf(rows[2]!).slice(-2).map(piece => [piece.text, piece.isDim])).toEqual([['Context  ', true], ['30% · 60k / 200k · 107k free', false]])
  expect(piecesOf(rows[3]!).at(-1)).toMatchObject({ text: 'Messages 40k', isDim: true })
})

test('a legend that does not fit gives up its lightest entries and says how many', SLOW, async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 62)
  const said = (await linesOf(ui)).map(line => saidOf(line, 62))

  // Twenty-five cells for words: the free figure goes from the bar's line, the smallest category from
  // the legend.
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
  expect(said.slice(8, 11)).toEqual(['Cost     5h $1,234,567.98', '', ''])
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
  expect(textOf(context!)).toMatch(/^█+░+ {2}30% · 60k \/ 200k · 107k free$/)
  expect(textOf(cost!)).toMatch(/^░+ +5h \$0\.00 · Week \$0\.00$/)
  // The labels take the wider one's width, so the two bars are one length.
  expect(textOf(context!)).toHaveLength(57)
  expect(textOf(cost!)).toHaveLength(57)
  expect((gauges!.children ?? []).filter(isEl).map(textOf)).toEqual([expect.stringMatching(/^5h █+░+ {2}60% left$/), expect.stringMatching(/^Week █+░+ {2}15% left$/)])
  expect(mascotOf(await linesOf(narrow))).toBeNull()
  await narrow.unmount()

  // A band allowed fewer rows than the scene has: first the limit bars give up the free rows over them,
  // each keeping the line beside it, and the mascot stands over the context bar. Eight rows for twelve;
  // what the cost bar had to say under it has no row left.
  const low = await mount($, 120, 11)
  const lowLines = await linesOf(low)
  expect(lowLines.map(line => saidOf(line, 120))).toEqual([
    'Model    test-model',
    '',
    '',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '',
    'Cost     5h $0.00 · Week $0.00',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
  ])
  expect(mascotOf(lowLines)).toMatchObject({ row: 1, at: 0 })
  expect([0, 7].map(i => sceneOf(lowLines[i]!, 120))).toEqual([`${FIVE}${'░'.repeat(7)}`, `${WEEK}${'░'.repeat(6)}`])
  await low.unmount()
  // With fewer rows than that, the bars alone.
  const lower = await mount($, 120, 7)
  expect(await rowsOf(lower)).toHaveLength(3)
  expect(textOf((await rowsOf(lower))[0]!)).toMatch(/^█+░+ {2}30% · 60k \/ 200k · 107k free$/)
  await lower.unmount()

  // A label gives way before its bar does, last part first.
  const tiny = await mount($, 30)
  expect(textOf((await rowsOf(tiny))[0]!)).toMatch(/^█+░+ {2}30% · 60k \/ 200k$/)
  await tiny.unmount()
  const least2 = await mount($, 14)
  expect(textOf((await rowsOf(least2))[0]!)).toMatch(/^[█░]{12}$/)
})

test('with one window alone and few rows, the steps still stand right under it', SLOW, async ($, on) => {
  engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40 }] })
  await begin($)
  // Seven rows for all of it; with six the limit bar gives up the free rows over it.
  const full = await mount($, 120)
  expect(await rowsOf(full)).toHaveLength(7)
  await full.unmount()
  const low = await mount($, 120, 6)
  const lines = await linesOf(low)
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'Model    test-model',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
    '',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
  ])
  expect(mascotOf(lines)).toMatchObject({ row: 1, at: 0 })
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
  // five hours, the context, the cost and the week, each with its two free rows over it.
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
  // Down onto the cost bar and along it, rightward; then down onto the week's: there is no stretch of
  // the walk with no bar under it.
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
  expect(saidOf((await linesOf(ui))[11]!, 62)).toBe('Steps    Today 151 · Week 151')

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

test('where the limit bars have given up their free rows the mascot keeps to the other bars', SLOW, async ($, on) => {
  const world = engine(on, { usd: 3, windows: twoWindows, lines: 'offline' })
  await begin($)
  // Nine rows: the five hours' bar, the context and cost bars with their free rows, the week's, and the
  // line. With eight, the same without the line.
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

  expect([...stood].sort()).toEqual([1, 4])
  const rows = await rowsOf(ui)
  expect([0, 7].map(i => barOf(rows[i]!).map(([text]) => text).join('').length)).toEqual([24, 24])
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
  // The five hours' bar at forty-seven cells: twenty-eight left, in green, then nineteen gone. The part
  // that counts is the one under the mascot's third cell; the words written in the bar change nothing.
  expect(await after(0)).toEqual([0, ['success']])
  await turnStart($, 'work')
  expect(await after(25)).toEqual([25, ['success']])
  // What is gone is no part of anything: there it is its own colour.
  expect(await after(1)).toEqual([26, ['claude']])
  expect(await after(15)).toEqual([41, ['claude']])
  // Down onto the context bar, walked right to left: 2 cells of system prompt, 5 of system tools, 11 of
  // messages, then 29 free.
  expect(await after(1)).toEqual([41, ['claude']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 3, face: faced('*__*') })
  expect(await after(25)).toEqual([16, ['claude']])
  expect(await after(1)).toEqual([15, ['purple']])
  expect(await after(10)).toEqual([5, ['purple']])
  expect(await after(1)).toEqual([4, ['inactive']])
  expect(await after(4)).toEqual([0, ['inactive']])
  // Down onto the week's: eight cells left, in red, and everywhere along it a face to match.
  expect(await after(1)).toEqual([0, ['error']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 6, face: FACE.strained })
  expect(await after(5)).toEqual([5, ['error']])
  expect(await after(1)).toEqual([6, ['claude']])
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 6, face: FACE.strained })
})

test('where the bar over its head is the colour it would take, the mascot keeps its own: it is never lost against that bar', SLOW, async ($, on) => {
  // Two limits in the green, one right over the other: the week, with thirty-seven of its forty-seven
  // cells left, and under it a month's budget with nothing spent of it.
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 20, resetsAt: later }] })
  put(world, 'settings.json', { budget: 200, lines: 'off', isIntroduced: true })
  await begin($)
  const ui = await mount($, 120)
  await turnStart($, 'work')
  const after = async (seconds: number): Promise<[number | undefined, number | undefined, unknown[]]> => {
    await world.clock.advance(seconds * 1_000)
    const found = mascotOf(await linesOf(ui))

    return [found?.row, found?.at, await mascotColours(ui)]
  }

  // On the week's bar it is under the context bar, whose colours are not the limit's: green, as far as
  // the week has anything left.
  expect(await after(84)).toEqual([6, 0, ['success']])
  expect(await after(34)).toEqual([6, 34, ['success']])
  expect(await after(1)).toEqual([6, 35, ['claude']])
  // Down onto the budget's, walked right to left. Where only what is gone of the week is over its head
  // it wears the budget's green.
  expect(await after(7)).toEqual([9, 41, ['success']])
  expect(await after(5)).toEqual([9, 36, ['success']])
  // And where the week's green is right over its head (its four cells, not its arms), its own.
  expect(await after(1)).toEqual([9, 35, ['claude']])
  expect(await after(35)).toEqual([9, 0, ['claude']])
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
  // The five hours have nine tenths left.
  const world = engine(on, { messages: 120_000, windows: [{ kind: 'five_hour', percentUsed: 10 }] })
  await begin($)
  const ui = await mount($, 120)
  // It is the meter under it that counts: over the five hours' bar it is at ease, tight as the window is.
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, face: FACE.asleep })
  await turnStart($, 'work')
  await world.clock.advance(1_000)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, at: 1, face: faced('^__^') })
  // Along that bar and down onto the context bar: strained, at its free end as anywhere along it.
  await world.clock.advance(41_000)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 3, at: 41, face: FACE.strained })

  // With a fifth or more free it is at ease again.
  world.messages = 110_000
  await measure($, 'context')
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 3, face: faced('*__*') })
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
  // With no cost reported there is no cost bar: the five hours, the context bar, the week. The model is
  // beside the first limit, the steps beside the next.
  expect(rows).toHaveLength(9)
  expect([2, 8].map(i => saidOf(textOf(rows[i]!), 120))).toEqual(['Model    test-model', 'Steps    Today 0 · Week 0 · Month 0 · Year 0'])
  // What is left is the filled part: green above half, red under a fifth. The words are cut out of it
  // in the colour for that; over what is gone they are white on black, and the rest of what is gone is
  // black alone.
  expect(barOf(rows[2]!)).toEqual([
    [' 5h limit · 60% left · Reset', 'success', WORD],
    ['s in 1h 20m ', TRACK, TRACK_WORD],
    ['░'.repeat(7), TRACK, TRACK],
  ])
  expect(barOf(rows[8]!)).toEqual([
    [' Week li', 'error', WORD],
    ['mit · 15% left · Resets in 3d 5h ', TRACK, TRACK_WORD],
    ['░'.repeat(6), TRACK, TRACK],
  ])
  expect([TRACK, TRACK_WORD]).toEqual(['#000000', '#ffffff'])
  // Written for the other sessions, stamped with when it was read.
  expect(fileOf(world, 'limits.json')).toMatchObject({ at: NOW, windows: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day' }] })
})

test('what a limit bar says is as long as the bar has room for', SLOW, async ($, on) => {
  engine(on, { windows: twoWindows })
  await begin($)
  const five = async (columns: number): Promise<string> => {
    const ui = await mount($, columns)
    const scene = sceneOf((await linesOf(ui))[2]!, columns)
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
  const fiveHours = async (): Promise<string> => sceneOf((await linesOf(ui))[2]!, 120).slice(0, 40)

  await world.clock.advance(59_000)
  expect(await fiveHours()).toBe(FIVE)
  await world.clock.advance(1_000)
  expect(await fiveHours()).toBe(' 5h limit · 60% left · Resets in 1h 19m ')
})

test('a reading another session wrote shows here within five seconds; an older one does not', SLOW, async ($, on) => {
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40 }] })
  await begin($)
  const ui = await mount($, 100)
  // One window, with no reset told: thirty-nine cells, twenty-three of them left. With one window alone
  // the steps stand under it.
  const bar = async (): Promise<string> => sceneOf((await linesOf(ui))[2]!, 100)
  expect(trackOf(100)).toBe(39)
  expect((await linesOf(ui)).slice(2, 4).map(line => saidOf(line, 100))).toEqual(['Model    test-model', 'Steps    Today 0 · Week 0 · Month 0 · Year 0'])
  expect(await bar()).toBe(` 5h limit · 60% left ██${'░'.repeat(16)}`)

  put(world, 'limits.json', { at: NOW - 60_000, windows: [{ kind: 'five_hour', percentUsed: 5 }] })
  await world.clock.advance(5_000)
  expect(await bar()).toBe(` 5h limit · 60% left ██${'░'.repeat(16)}`)

  put(world, 'limits.json', { at: NOW + 4_000, windows: [{ kind: 'five_hour', percentUsed: 90, resetsAt: new Date(NOW - 1_000).toISOString() }] })
  await world.clock.advance(5_000)
  expect(await bar()).toBe(` 5h limit · 10% left · Reset due ${'░'.repeat(6)}`)
  // A tenth of thirty-nine cells, a part keeping a cell: five, in red.
  expect(barOf((await rowsOf(ui))[2]!)[0]).toEqual([' 5h l', 'error', WORD])
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

test('a budget with the limit windows: a bar each, the budget\'s last', SLOW, async ($, on) => {
  const world = engine(on, { usd: 12.4, windows: twoWindows })
  put(world, 'settings.json', { budget: 200, lines: 'off', isIntroduced: true })
  await begin($)
  const ui = await mount($, 160)
  const lines = await linesOf(ui)

  // The five hours, the context, the cost, the week, the budget: the model beside the first limit, the
  // steps beside the next, and nothing beside the third.
  expect(trackOf(160)).toBe(63)
  expect(lines).toHaveLength(15)
  expect([2, 11, 14].map(i => sceneOf(lines[i]!, 160).replace(/[█░]+$/, ''))).toEqual([FIVE, WEEK, ' Month budget · $200.00 left of $200.00 '])
  expect([2, 11, 14].map(i => saidOf(lines[i]!, 160))).toEqual(['Model    test-model', 'Steps    Today 0 · Week 0 · Month 0 · Year 0', ''])
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
  // Two free rows with the model and the steps beside them, the bar, and under it what it has to say.
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'Model    test-model',
    'Steps    Today 0 · Week 0 · Month 0 · Year 0',
    'Context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
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

  expect(named).toEqual(expect.arrayContaining(['Model', 'High effort', 'Steps', 'Today 0', 'Week 0', 'Month 0', 'Year 0', 'Context', 'Cost', 'Week $0.76', 'This prompt $0.76', 'Main $0.31', 'Subagents $0.45', 'Resets in 1h 20m', 'Week limit']))
  expect(named.filter(item => !/^[A-Z]/.test(item) && !item.startsWith('test-model'))).toEqual([])
})

test('with the plan\'s windows known the cost is what was spent in each, and begins again when its window does; the ledger keeps it all', SLOW, async ($, on) => {
  const world = engine(on, { usd: 5, windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 30, resetsAt: later }] })
  await begin($)
  const ui = await mount($, 120)
  const cost = async (): Promise<string[]> => (await linesOf(ui)).slice(8, 10).map(line => saidOf(line, 120))
  // What was spent before the session first looked is no window's: both begin at nothing.
  expect(await cost()).toEqual(['Cost     5h $0.00 · Week $0.00', ''])

  await turnStart($, 'first')
  world.usd = 5.4
  await call($)
  world.usd = 6.2
  await turnEnd($, 'agent-1')
  world.usd = 6.25
  await turnEnd($)
  expect(await cost()).toEqual(['Cost     5h $1.25 · Week $1.25 · This prompt $1.25', '         █ Main $0.45  █ Subagents $0.80'])

  // The five hours begin again: a window that ends later than the one before it. Its cost is nothing
  // again and its bar empty; the week's goes on.
  const next = new Date(NOW + 6 * 3_600_000).toISOString()
  world.windows = [{ kind: 'five_hour', percentUsed: 2, resetsAt: next }, { kind: 'seven_day', percentUsed: 31, resetsAt: later }]
  await measureLimits($, world)
  expect(await cost()).toEqual(['Cost     5h $0.00 · Week $1.25 · This prompt $1.25', ''])
  expect(sceneOf((await linesOf(ui))[8]!, 120)).toBe('░'.repeat(47))

  await turnStart($, 'second')
  world.usd = 6.75
  await turnEnd($)
  expect(await cost()).toEqual(['Cost     5h $0.50 · Week $1.75 · This prompt $0.50', '         █ Main $0.50'])
  // The marks are kept with the session, to be there when it loads again: what had been spent in all
  // when each window was met.
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ ledger: { seen: 6.75, marks: { five_hour: { resetsAt: next, usd: 6.25 }, seven_day: { resetsAt: later, usd: 5 } } } })

  // The week begins again too.
  world.windows = [{ kind: 'five_hour', percentUsed: 5, resetsAt: next }, { kind: 'seven_day', percentUsed: 1, resetsAt: new Date(NOW + 9 * 24 * 3_600_000).toISOString() }]
  await measureLimits($, world)
  expect(await cost()).toEqual(['Cost     5h $0.50 · Week $0.00 · This prompt $0.50', '         █ Main $0.50'])

  // The ledger has all of it still, prompt by prompt, and says what each window's is.
  const text = (await command($, 'costs')).text
  expect(text).toContain('Session total reported by Claude Code: $6.75')
  expect(text).toContain('  This 5h window:   $0.50  (seen spent since it began, or since this session first met it: the band\'s cost)')
  expect(text).toContain('  This Week window: $0.00')
  expect(text).toContain('  Itemised below:   $1.75')
  expect(text).toContain('  Before tracking:  $5.00')
  expect(text).toContain('  1.     $1.25  first')
  expect(text).toContain('  2.     $0.50  second')
})

test('a window that runs out begins again there and then, and one with no end told when less of it is used', SLOW, async ($, on) => {
  const ends = new Date(NOW + 10 * 60_000).toISOString()
  const world = engine(on, { usd: 1, windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: ends }] })
  await begin($)
  const ui = await mount($, 120)
  const cost = async (): Promise<string> => saidOf((await linesOf(ui))[8]!, 120)
  await turnStart($, 'work')
  world.usd = 2
  await turnEnd($)
  await stop($, [])
  expect(await cost()).toBe('Cost     5h $1.00 · This prompt $1.00')

  // Its end passes with nothing asked: the plan has renewed, whether or not a new window was reported.
  await world.clock.advance(10 * 60_000 + 5_000)
  expect(sceneOf((await linesOf(ui))[2]!, 120).startsWith(' 5h limit · 60% left · Reset due ')).toBe(true)
  expect(await cost()).toBe('Cost     5h $0.00 · This prompt $1.00')
  // The next window is reported with the first spend in it: that spend is its own.
  await turnStart($, 'more')
  world.windows = [{ kind: 'five_hour', percentUsed: 3, resetsAt: new Date(NOW + 5 * 3_600_000).toISOString() }]
  world.usd = 2.3
  await turnEnd($)
  expect(await cost()).toBe('Cost     5h $0.30 · This prompt $0.30')

  // With no end told, more of it used is the same window; so is less of it by under a point; less of
  // it by more than that is a new one.
  world.windows = [{ kind: 'five_hour', percentUsed: 30 }]
  await measureLimits($, world)
  expect(await cost()).toBe('Cost     5h $0.30 · This prompt $0.30')
  await turnStart($, 'again')
  world.usd = 2.7
  await turnEnd($)
  world.windows = [{ kind: 'five_hour', percentUsed: 29.5 }]
  await measureLimits($, world)
  expect(await cost()).toBe('Cost     5h $0.70 · This prompt $0.40')
  world.windows = [{ kind: 'five_hour', percentUsed: 4 }]
  await measureLimits($, world)
  expect(await cost()).toBe('Cost     5h $0.00 · This prompt $0.40')
})

test('a session that loads again has its windows where it left them; one kept before they were followed starts from where it is', SLOW, async ($, on) => {
  const world = engine(on, { usd: 9, windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }] })
  const turn = { seq: 1, label: 'earlier', main: 8, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: null, agents: {} }
  const ledger = { seen: 9, untracked: 1, folded: { usd: 0, prompts: 0 }, steps: 0, nextSeq: 2, turns: [turn], agents: {} }
  // Six dollars had been spent when this window was met: three of the nine are its.
  put(world, 'sessions/session-one.json', { ledger: { ...ledger, spent: { main: 8, agents: 0 }, marks: { five_hour: { resetsAt: soon, used: 35, usd: 6, main: 5, agents: 0 } } }, effort: null, isHidden: false })
  put(world, 'sessions/session-two.json', { ledger, effort: null, isHidden: false })
  put(world, 'sessions/session-three.json', { ledger: { ...ledger, marks: { five_hour: { resetsAt: soon, used: 35, usd: 'six' } } }, effort: null, isHidden: false })
  await begin($)
  const ui = await mount($, 120)
  const cost = async (): Promise<string[]> => (await linesOf(ui)).slice(8, 10).map(line => saidOf(line, 120))
  expect(await cost()).toEqual(['Cost     5h $3.00 · This prompt $8.00', '         █ Main $3.00'])

  // A ledger from before the windows were followed: what it holds cannot be told apart by window, so
  // the window's cost starts from here.
  world.sessionId = 'session-two'
  world.startedAt = 2
  await call($)
  expect(await cost()).toEqual(['Cost     5h $0.00 · This prompt $8.00'])
  // One whose marks are not what marks are is no ledger: the session starts its own.
  world.sessionId = 'session-three'
  world.startedAt = 3
  await call($)
  expect((await command($, 'costs')).text).toContain('Before tracking:  $9.00')
})

// What the feeds answer in these tests: the head of a changelog, two kinds of jokes, and four outlets'
// stories (two that give a summary written as one, two that give a story's opening lines; three as RSS,
// one as Atom), each with what must not get through.
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
const DAD_JOKES = JSON.stringify({ results: [
  { joke: 'A steak pun is a rare medium well done.' },
  { joke: 'Why did the tomato blush?\r\nBecause it saw the salad dressing.' },
  { joke: 'Short.' },
  { joke: 'Why did the half blind man fall in the well? Because he could not see that well!' },
  { joke: 'I am &frac12; joking about entities, but only &frac12; of the time.' },
] })
const CODE_JOKES = JSON.stringify({ jokes: [
  { type: 'twopart', setup: 'Why did the functional programmer get thrown out of school?', delivery: 'Because he refused to take classes.' },
  { type: 'single', joke: 'Yo mama is so old, she knew Burger King while he was still a prince.' },
] })
// A story as an outlet's feed gives it: its headline, its summary and, after that, the line a feed adds
// about itself; a short link for the post, and the long one.
const story = (title: string, summary: string, id: string, link: string, kind = 'post'): string =>
  `<item><title>${title}</title><link>${link}</link><guid isPermaLink="false">${id}</guid><description><![CDATA[<p>${summary}</p>\n<p>The ${kind} <a href="${link}">${title}</a> appeared first on <a href="https://example.org">The Outlet</a>.</p>]]></description></item>`
const DECODER = [
  '<rss><channel><title>The Decoder</title>',
  story('Aleph Alpha releases Kolibri, an open-weight model', 'Aleph Alpha has released Kolibri, a German-English model with 78 billion parameters. Over 21 percent of the training data is German.', 'https://the-decoder.com/?p=41102', 'https://the-decoder.com/aleph-alpha-releases-kolibri/', 'article'),
  story('OpenAI safety leader quits, warning the culture is broken', 'A senior researcher has left OpenAI after 6 years at the company.', 'https://the-decoder.com/?p=41103', 'https://the-decoder.com/safety-leader/', 'article'),
  story('Trump launches a "Super Intelligence Force"', 'Donald Trump has established a "Super Intelligence Force" of 40 officials.', 'https://the-decoder.com/?p=41088', 'https://the-decoder.com/force/', 'article'),
  story('Anthropic is becoming a big corporate donor', 'Anthropic employees donated $540 million in 2025 alone, nearly five times as much as the next-largest Fortune 500 donors, thanks to a company program that tops up every stock donation with extra shares.', 'https://the-decoder.com/?p=41108', 'https://the-decoder.com/donor/', 'article'),
  story('A lab opens its weights', 'Acme Labs has opened the weights of its 12 billion parameter model.', 'urn:uuid:77', 'https://evil.example.com/steal', 'article'),
  story('Acme halves its prices', 'Acme has cut the price of its largest model by half. The reporting was supported by a grant from Initech.', 'https://the-decoder.com/?p=41110', 'https://the-decoder.com/prices/', 'article'),
  story('Acme opens an office', 'Acme has opened an office in Lisbon for 40 engineers. Read more about the move on our site.', 'https://the-decoder.com/?p=41111', 'https://the-decoder.com/office/', 'article'),
  story('A model for the Moon', 'NASA and IBM have released the Lunar Foundation Model, one of the first open-source AI models for lunar science. It was trained on 12 years of images from an orbiter and is free to download.', 'https://the-decoder.com/?p=41067', 'https://the-decoder.com/moon/', 'article'),
  '</channel></rss>',
].join('\n')
const entry = (title: string, summary: string, post: number): string =>
  `<entry><id>https://www.theverge.com/?p=${post}</id><title type="html"><![CDATA[${title}]]></title><link rel="alternate" type="text/html" href="https://www.theverge.com/ai/${post}/a-long-address-for-the-story" /><summary type="html">${summary}</summary></entry>`
const VERGE = [
  '<feed xmlns="http://www.w3.org/2005/Atom"><title>AI | The Verge</title>',
  // Markup escaped once more than it needs to be, as a feed may.
  entry('OpenAI is sticking more ads in ChatGPT', '&lt;p&gt;OpenAI&amp;#8217;s latest ad format will put images of sponsored products on your screen. The ads will appear when you generate images.&lt;/p&gt;', 1004655),
  entry('Gemini comes to Docs', '<![CDATA[<p>Imagine a Tuesday when a chatbot at Google surprised you. Google has put Gemini 4 into Docs for 3 billion users.</p>]]>', 1004700),
  entry('On sleep', '<![CDATA[<p>Sleep is one of the most important things people do every night.</p>]]>', 1004701),
  entry('A model ships', '<![CDATA[<p>Acme has shipped a model \u001b[31mwith an escape in it to 40 countries.</p>]]>', 1004702),
  entry('Ethical AI', '<![CDATA[<p>Can affordable ethical AI scale up at Acme in 2027?</p>]]>', 1004703),
  entry('A model goes abroad', '<![CDATA[<p>They shipped it to 40 countries on Monday.</p>]]>', 1004704),
  '</feed>',
].join('\n')
const POSITIVE = [
  '<rss><channel><title>Positive News</title>',
  story('Meet the 14-year-old uncovering London&#8217;s lost history', 'Seasoned mudlark Emmylou Vaxby has spent nearly a decade searching the Thames foreshore for fragments of the city&#8217;s past', 'https://www.positive.news/?p=594738', 'https://www.positive.news/environment/meet-the-14-year-old/'),
  story('The race to get more young people into work', 'The UK has one of the highest NEET rates for young adults in Europe. New figures offer some encouragement', 'https://www.positive.news/?p=592622', 'https://www.positive.news/society/the-race/'),
  story('I stopped reading bad news for 48 hours', 'What changes when you swap the daily doomscroll for journalism that asks what is working? Oliver Balch finds out', 'https://www.positive.news/?p=593754', 'https://www.positive.news/lifestyle/i-stopped/'),
  story('Gallery: winning pictures from Bird Photographer of the Year', 'A striking shot of a gannet flying through the water is among the winners of this year&#8217;s award', 'https://www.positive.news/?p=592693', 'https://www.positive.news/gallery/'),
  story('Kosovo was cleared of landmines after 27 years of work', 'Kosovo was cleared of landmines after 27 years of work.', 'https://www.positive.news/?p=594045', 'https://www.positive.news/kosovo/'),
  story('A village rebuilds', 'A village in Kerala has rebuilt its school in 9 months. Could yours do the same?', 'https://www.positive.news/?p=594800', 'https://www.positive.news/village/'),
  story('The Spark', 'The Spark is generously supported by Laura Rice of Denver, who reads every issue.', 'https://www.positive.news/?p=594801', 'https://www.positive.news/spark/'),
  '</channel></rss>',
].join('\n')
const GOOD_NEWS = [
  '<rss><channel><title>Good News Network</title>',
  story('Underwater Umbrellas Could Protect Coral Reefs From Heat Damage', 'Underwater umbrellas could protect coral reefs from heat &#8211; and even partly reverse the bleaching, according to a new study by Florida scientists. The shades cut the light by a third [&#8230;]', 'https://www.goodnewsnetwork.org/?p=241699', 'https://www.goodnewsnetwork.org/underwater-umbrellas/'),
  story('Town Rallies After Crash Kills Two', 'Hundreds of neighbours in Ohio came together on Sunday.', 'https://www.goodnewsnetwork.org/?p=241700', 'https://www.goodnewsnetwork.org/sad/'),
  story('Good News in History, October 5', '20 years ago today, a rock star opened a kitchen in New Jersey.', 'https://www.goodnewsnetwork.org/?p=241701', 'https://www.goodnewsnetwork.org/history/'),
  story('Fan Becomes a Hero', 'When Alastair Cass got outside, he heard a woman&#8217;s cries [&#8230;]', 'https://www.goodnewsnetwork.org/?p=241675', 'https://www.goodnewsnetwork.org/fan/'),
  story('Comedy Wildlife Finalists', 'It&#8217;s that time of the year again. The awards just released the 40 finalists for 2026.', 'https://www.goodnewsnetwork.org/?p=241735', 'https://www.goodnewsnetwork.org/comedy/'),
  story('Rare Ghost Lobster Goes to School', 'A &#8216;ghost&#8217; lobster so rare that the odds of finding one are 1 in 100 million is going to school.', 'urn:uuid:9', 'https://www.goodnewsnetwork.org/ghost-lobster/'),
  story('Nonprofit Brings Free Music Education to 20,000 Students', 'A nonprofit in Miami has brought free music lessons to 20,000 students.', 'urn:uuid:10', 'https://evil.example.com/steal'),
  story('Japan Has More Centenarians Than Ever', 'There are 107,677 people in Japan who are aged 100 or older, according to health ministry figures.', 'https://www.goodnewsnetwork.org/?p=241800', 'https://www.goodnewsnetwork.org/centenarians/'),
  story('UK Museums Stay Free', 'After months of talks between UK ministries, the government has decided that the national museums of the country will remain free to every single visitor from anywhere in the world for good.', 'https://www.goodnewsnetwork.org/?p=241652', 'https://www.goodnewsnetwork.org/museums/'),
  '</channel></rss>',
].join('\n')
// Seven of the nine feeds answer; the other two are down.
const online = (world: World): void => {
  world.feeds.set('https://raw.githubusercontent.com/', CHANGELOG)
  world.feeds.set('https://the-decoder.com/', DECODER)
  world.feeds.set('https://www.theverge.com/', VERGE)
  world.feeds.set('https://icanhazdadjoke.com/', DAD_JOKES)
  world.feeds.set('https://v2.jokeapi.dev/', CODE_JOKES)
  world.feeds.set('https://www.positive.news/', POSITIVE)
  world.feeds.set('https://www.goodnewsnetwork.org/', GOOD_NEWS)
}
const HOSTS = ['raw.githubusercontent.com', 'the-decoder.com', 'techcrunch.com', 'www.theverge.com', 'icanhazdadjoke.com', 'v2.jokeapi.dev', 'www.positive.news', 'www.goodnewsnetwork.org', 'www.optimistdaily.com']
const CHANGELOG_PAGE = 'https://code.claude.com/docs/en/changelog'
// What a session kept of an earlier read: a gist and its link each.
const UMBRELLAS = { topic: 'news', text: 'Underwater umbrellas could protect coral reefs from heat, a new study by Florida scientists finds.', href: 'https://www.goodnewsnetwork.org/?p=241699' }
const MUDLARK = { topic: 'news', text: 'A mudlark has spent nearly a decade searching the Thames foreshore for fragments of the past.', href: 'https://www.positive.news/?p=594738' }
const KOLIBRI = { topic: 'ai', text: 'Aleph Alpha has released Kolibri, a German-English model with 78 billion parameters.', href: 'https://the-decoder.com/?p=41102' }
const kept = { format: 2, at: NOW, notes: [UMBRELLAS, MUDLARK, KOLIBRI] }

test('the line under the bars: something about AI, a joke, good news, by turns, another every four minutes', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'live' })
  put(world, 'lines.json', kept)
  await begin($)
  const ui = await mount($, 220)
  // Three bars over it: nine rows, and the line.
  expect(await rowsOf(ui)).toHaveLength(10)
  const seen: Array<{ label: string; color: unknown; text: string }> = []

  // Nothing runs, and nothing needs to: the line goes by the clock.
  for (let turn = 0; turn < 9; turn += 1) {
    const first = await lineOf(ui)
    await world.clock.advance(239_000)
    // The same thing for four minutes; another at the next.
    expect((await lineOf(ui))?.text).toBe(first?.text)
    await world.clock.advance(1_000)
    seen.push({ label: first?.label ?? '', color: first?.color, text: first?.text ?? '' })
  }

  expect(seen.map(note => note.label)).toEqual(['AI', 'Joke', 'Good news', 'AI', 'Joke', 'Good news', 'AI', 'Joke', 'Good news'])
  expect(seen.map(note => note.color)).toEqual(seen.map(note => TOPICS[note.label]))
  // Good news is only ever what a feed gave: its gist, then its link. There are two of them, so the third
  // time it is the first one's turn again; nothing else was said twice.
  const news = seen.filter(note => note.label === 'Good news').map(note => note.text)
  expect(news.slice(0, 2).sort()).toEqual([`${MUDLARK.text} ${MUDLARK.href}`, `${UMBRELLAS.text} ${UMBRELLAS.href}`])
  expect(news[2]).toBe(news[0])
  expect(new Set(seen.map(note => note.text)).size).toBe(8)
  // What is fresh is not kept for last: of the notes about AI, the one a feed gave comes first.
  expect(seen[0]?.text).toBe(`${KOLIBRI.text} ${KOLIBRI.href}`)
  // Nothing but the settings and what the feeds gave decides it: no request was made for a kept read.
  expect(world.fetched).toEqual([])
})

test('a line is its label, one space, and the note right after it; a story\'s link comes whole after its gist, which gives way where the band is narrow', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  put(world, 'lines.json', { format: 2, at: NOW, notes: [UMBRELLAS] })
  await begin($)
  // The third turn is the good news'.
  await world.clock.advance(480_000)
  const wide = await mount($, 220)
  expect((await lineOf(wide))?.pieces.map(piece => [piece.text, piece.isBold, piece.isDim, piece.href])).toEqual([
    ['Good news ', true, false, undefined],
    [UMBRELLAS.text, false, false, undefined],
    [' ', false, false, undefined],
    // On a terminal the address is written out, for the terminal to make a link of.
    [UMBRELLAS.href, false, true, undefined],
  ])
  await wide.unmount()

  // Anywhere else it has to be given as a link.
  const desktop = await mount($, 220, 40, false, 'desktop')
  expect((await lineOf(desktop))?.pieces.at(-1)).toMatchObject({ text: UMBRELLAS.href, href: UMBRELLAS.href })
  await desktop.unmount()

  // A hundred and twenty columns leave the gist sixty-six cells: it is cut where a clause ends, and marked
  // as cut; the link is whole.
  const narrow = await mount($, 120)
  expect((await lineOf(narrow))?.pieces.map(piece => piece.text)).toEqual(['Good news ', 'Underwater umbrellas could protect coral reefs from heat...', ' ', UMBRELLAS.href])
  expect(textOf((await rowsOf(narrow)).at(-1)!).length).toBeLessThanOrEqual(118)
  await narrow.unmount()

  // Eighty leave it twenty-six, which is no gist: the turn goes to the next kind.
  const tight = await mount($, 80)
  expect((await lineOf(tight))?.label).toBe('AI')
})

test('a note too long for the band is passed over for one that fits; the line gives way before the scene does', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  await begin($)
  const ui = await mount($, 70)
  const lines: Array<{ label: string; text: string }> = []

  for (let turn = 0; turn < 12; turn += 1) {
    const line = await lineOf(ui)
    lines.push({ label: line?.label ?? '', text: line?.text ?? '' })
    await world.clock.advance(240_000)
  }

  // Sixty-eight cells at seventy columns, the label and its space among them. Few of the notes that come
  // with the mod are that short: they take their turns, whole, and none of the longer ones is shown cut.
  expect(lines.every(line => line.text.length > 0 && line.label.length + 1 + line.text.length <= 68 && !line.text.endsWith('...'))).toBe(true)
  // Offline there is no good news: its turn goes to the next kind.
  expect(lines.map(line => line.label)).toEqual(['AI', 'Joke', 'AI', 'AI', 'Joke', 'AI', 'AI', 'Joke', 'AI', 'AI', 'Joke', 'AI'])
  expect(new Set(lines.map(line => line.text)).size).toBeGreaterThanOrEqual(4)

  // None of a kind is said again before all of that kind that fit have been said.
  for (const label of ['AI', 'Joke']) {
    const said = lines.filter(line => line.label === label).map(line => line.text)
    expect(said.slice(0, new Set(said).size)).toEqual([...new Set(said)])
  }

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

test('the feeds are read through the host when what they gave is old: of a story its gist and its link, never its headline; and kept for every session', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  online(world)
  await begin($)
  // Not while the session starts: a little after.
  expect(world.fetched).toEqual([])
  await world.clock.advance(4_000)

  expect(world.fetched.map(asked => /^https:\/\/([^/]+)/.exec(asked.url)?.[1])).toEqual(HOSTS)
  // The changelog's head only, and the jokes as data.
  expect(world.fetched[0]?.headers).toEqual({ Range: 'bytes=0-60000' })
  expect(world.fetched[4]?.headers).toEqual({ Accept: 'application/json' })
  expect(world.fetched[4]?.url).toMatch(/[?&]page=([1-9]|1\d|20)$/)
  const file = fileOf(world, 'lines.json') as { format: number; at: number; notes: Array<{ topic: string; text: string; href?: string }> }
  expect(file.format).toBe(2)
  expect(file.at).toBe(NOW + 4_000)
  expect(file.notes).toEqual([
    // What was added, release by release: not the plumbing, not a line with a character that is no Latin
    // letter, not the line the read cut short.
    { topic: 'ai', text: 'New in Claude Code 2.1.288: recovery for a prompt cleared with Ctrl+C: pressing Up on the empty prompt brings the draft back, including pasted text and images', href: CHANGELOG_PAGE },
    { topic: 'ai', text: 'New in Claude Code 2.1.287: a count such as "2 of 5" to the permission prompt when several permission requests stack up', href: CHANGELOG_PAGE },
    // A summary written as one: as many of its sentences as fit, without what the feed says of itself
    // after them, and with the short link the feed gives for the post. A long one is cut where a clause
    // ends. Nothing grim, nothing about politics, and no link that is not the outlet's own.
    { topic: 'ai', text: 'Aleph Alpha has released Kolibri, a German-English model with 78 billion parameters. Over 21 percent of the training data is German.', href: 'https://the-decoder.com/?p=41102' },
    { topic: 'ai', text: 'Anthropic employees donated $540 million in 2025 alone, nearly five times as much as the next-largest Fortune 500 donors...', href: 'https://the-decoder.com/?p=41108' },
    // A summary stops before a sentence that is about the outlet or the page, and before one that would
    // take it past its length: it is said in whole sentences where it can be.
    { topic: 'ai', text: 'Acme has cut the price of its largest model by half.', href: 'https://the-decoder.com/?p=41110' },
    { topic: 'ai', text: 'Acme has opened an office in Lisbon for 40 engineers.', href: 'https://the-decoder.com/?p=41111' },
    { topic: 'ai', text: 'NASA and IBM have released the Lunar Foundation Model, one of the first open-source AI models for lunar science.', href: 'https://the-decoder.com/?p=41067' },
    // A story's opening lines: the first sentence that names someone or a figure, not one that only sets
    // the scene, though it names someone. Markup escaped twice comes off twice. No sentence that names
    // nothing, none that leans on its headline, no question, and never one with an escape in it.
    { topic: 'ai', text: 'OpenAI\'s latest ad format will put images of sponsored products on your screen.', href: 'https://www.theverge.com/?p=1004655' },
    { topic: 'ai', text: 'Google has put Gemini 4 into Docs for 3 billion users.', href: 'https://www.theverge.com/?p=1004700' },
    // Jokes at nobody's expense, and none with an entity left in it.
    { topic: 'joke', text: 'A steak pun is a rare medium well done.' },
    { topic: 'joke', text: 'Why did the tomato blush? Because it saw the salad dressing.' },
    { topic: 'joke', text: 'Why did the functional programmer get thrown out of school? Because he refused to take classes.' },
    // Good news: entities and typography made plain; a summary of two sentences whole, and of one where
    // the second is a question; none that opens with a question, no gallery, nothing that only says the
    // headline again, and nothing about who pays for the outlet.
    { topic: 'news', text: 'Seasoned mudlark Emmylou Vaxby has spent nearly a decade searching the Thames foreshore for fragments of the city\'s past', href: 'https://www.positive.news/?p=594738' },
    { topic: 'news', text: 'The UK has one of the highest NEET rates for young adults in Europe. New figures offer some encouragement', href: 'https://www.positive.news/?p=592622' },
    { topic: 'news', text: 'A village in Kerala has rebuilt its school in 9 months.', href: 'https://www.positive.news/?p=594800' },
    // Nothing grim, nothing about the outlet itself, no sentence its feed cut off before it got anywhere,
    // none that leans on another; and where the feed gives no short link, the story's own address. A
    // sentence that only seems to set a scene has a figure in it; a long one is cut at the end of a
    // word, not in one, which keeps more of it than its one early comma would.
    { topic: 'news', text: 'Underwater umbrellas could protect coral reefs from heat - and even partly reverse the bleaching, according to a new study by Florida scientists.', href: 'https://www.goodnewsnetwork.org/?p=241699' },
    { topic: 'news', text: 'A \'ghost\' lobster so rare that the odds of finding one are 1 in 100 million is going to school.', href: 'https://www.goodnewsnetwork.org/ghost-lobster/' },
    { topic: 'news', text: 'There are 107,677 people in Japan who are aged 100 or older, according to health ministry figures.', href: 'https://www.goodnewsnetwork.org/?p=241800' },
    { topic: 'news', text: 'After months of talks between UK ministries, the government has decided that the national museums of the country will remain free to every single...', href: 'https://www.goodnewsnetwork.org/?p=241652' },
  ])
  // No headline is among them.
  expect(file.notes.map(note => note.text).join('\n')).not.toMatch(/Kolibri, an open-weight|sticking more ads|Meet the 14-year-old|Umbrellas Could Protect/)

  // What was read is on the line, by turns with what came with the mod: first what is fresh.
  const ui = await mount($, 220)
  const said: Array<{ label: string; link: string }> = []

  for (let turn = 0; turn < 3; turn += 1) {
    const line = await lineOf(ui)
    said.push({ label: line?.label ?? '', link: line?.pieces.at(-1)?.text ?? '' })
    await world.clock.advance(240_000)
  }

  expect(said.map(line => line.label)).toEqual(['AI', 'Joke', 'Good news'])
  expect(said[0]?.link).toMatch(/^https:\/\/(code\.claude\.com|the-decoder\.com|www\.theverge\.com)\//)
  expect(said[2]?.link).toMatch(/^https:\/\/www\.(positive\.news|goodnewsnetwork\.org)\//)
})

test('a read that was kept is not made again until it is an hour old; one that gave nothing is tried again in half an hour', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  put(world, 'lines.json', { ...kept, at: NOW - 50 * 60_000 })
  await begin($)
  await world.clock.advance(4_000)
  expect(world.fetched).toEqual([])
  // Fifty minutes old at the start: at the look ten minutes on it is an hour old, and read again. The
  // network is down, so nothing comes of it, and the next try waits half an hour.
  await world.clock.advance(10 * 60_000)
  expect(world.fetched).toHaveLength(9)
  await world.clock.advance(20 * 60_000)
  expect(world.fetched).toHaveLength(9)
  await world.clock.advance(10 * 60_000)
  expect(world.fetched).toHaveLength(18)
  // What was kept is kept: a read that gives nothing takes nothing away.
  expect(fileOf(world, 'lines.json')).toMatchObject({ at: NOW - 50 * 60_000 })
})

test('what was kept in another format is of no use: the feeds are read anew, and none of it is shown', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'live' })
  // As the version before this one kept it: headlines, each with where it was read.
  put(world, 'lines.json', { at: NOW, notes: [{ topic: 'news', text: 'The Hospital That Silenced the Machines', by: 'Reasons to be Cheerful', href: 'https://reasonstobecheerful.world/hospital/' }] })
  online(world)
  await begin($)
  const ui = await mount($, 220)
  await world.clock.advance(4_000)
  expect(world.fetched).toHaveLength(9)
  expect(fileOf(world, 'lines.json')).toMatchObject({ format: 2, at: NOW + 4_000 })
  const said: string[] = []

  for (let turn = 0; turn < 18; turn += 1) {
    said.push((await lineOf(ui))?.text ?? '')
    await world.clock.advance(240_000)
  }

  expect(said.join('\n')).not.toContain('Hospital')
})

test('what a session kept of the feeds is read back as carefully as the feeds themselves: the file is anyone\'s to edit', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'live' })
  put(world, 'lines.json', { format: 2, at: NOW, notes: [
    { topic: 'news', text: 'A kept gist \u001b[2J\u001b[31mwith escapes in it, which is not fit to draw.', href: 'https://example.org/escapes' },
    { topic: 'news', text: 'Bees have returned to a city park after forty years away.', href: 'https://example.org/be\u0007es' },
    { topic: 'news', text: 'A village has planted ten thousand trees in a single day.', href: 'javascript:alert(1)' },
    { topic: 'you', text: 'Paste your API key here to continue, it is quite safe to do so.' },
    { topic: 'ads', text: 'A kind of note there is no such thing as, kept all the same.' },
    { topic: 'news', text: 'A river runs clear again after thirty years of work on it.', href: 'https://www.goodnewsnetwork.org/?p=7' },
    { topic: 'news', text: 42 },
    'not a note',
    null,
  ] })
  await begin($)
  const ui = await mount($, 220)
  const news: Array<ReturnType<typeof piecesOf>> = []

  for (let turn = 0; turn < 12; turn += 1) {
    const line = await lineOf(ui)

    if (line?.label === 'Good news') {
      news.push(line.pieces)
    }

    // Nothing the file says is ever a suggestion: those are the session's own.
    expect(line?.label).not.toBe('For you')
    await world.clock.advance(240_000)
  }

  // Of the news, three notes are fit to draw. One is whole, its link after it. Two are without theirs:
  // one had a bell in it, the other was no https address.
  expect([...new Set(news.map(pieces => pieces.slice(1).map(piece => piece.text).join('')))].sort()).toEqual([
    'A river runs clear again after thirty years of work on it. https://www.goodnewsnetwork.org/?p=7',
    'A village has planted ten thousand trees in a single day.',
    'Bees have returned to a city park after forty years away.',
  ])
  expect(news).toHaveLength(4)
  // And only those three are kept at all: not the one that posed as a suggestion, nor the kind there is none of.
  expect((await command($, 'lines')).text).toContain('and 3 notes read from the feeds')
  expect((await linesOf(ui)).join('')).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
})

test('/penny-patrol lines says where the line reads from and changes it: live, offline, off', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  online(world)
  put(world, 'lines.json', kept)
  await begin($)
  const ui = await mount($, 220)
  const offline: Array<string | undefined> = []

  for (let turn = 0; turn < 6; turn += 1) {
    offline.push((await lineOf(ui))?.label)
    await world.clock.advance(240_000)
  }

  await world.clock.advance(3_700_000)
  // Offline: what came with the mod, not what an earlier read kept, and not a request made.
  expect(offline).toEqual(['AI', 'Joke', 'AI', 'AI', 'Joke', 'AI'])
  expect(world.fetched).toEqual([])
  expect(await lineOf(ui)).not.toBeNull()
  let text = (await command($, 'lines')).text
  expect(text).toContain('The line under the bars says only what came with the mod; nothing is read from the web.')
  expect(text).toContain(HOSTS.join(', '))

  // Live: read at once, and said, with how often the line and the feeds turn over.
  text = (await command($, 'lines live')).text
  expect(world.fetched).toHaveLength(9)
  expect(text).toContain('The line under the bars is live: what came with the mod, and 19 notes read from the feeds 0s ago. It says something else every 4 minutes; the feeds are read again every 60.')
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
  expect(first?.text).toBe('This line also reads a few public feeds, every hour, for fresh jokes, AI news and good news. /penny-patrol lines offline keeps it to what came with the mod.')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: null, lines: 'live', isIntroduced: true })
  // It holds the line for four minutes, then the notes take their turns.
  await world.clock.advance(239_000)
  expect((await lineOf(ui))?.label).toBe('For you')
  await world.clock.advance(1_000)
  expect((await lineOf(ui))?.label).not.toBe('For you')
})

test('every five to ten prompts the line makes a suggestion from the session\'s own figures, and holds it four minutes', SLOW, async ($, on) => {
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
  // What to do and, in this session's own figures, what doing it would move: the bar the person is looking at.
  expect(suggested[0]!.text).toBe('Context is 86% full, 152k of it messages. /compact swaps those for a summary: the bar would fall toward 10%, and every request sends that much less.')
  // What was just said is not said again while there is something else.
  expect(suggested[1]!.text).toBe('Every request sends all 172k tokens of this conversation again. When the task changes, /clear: the next one sends about 20k.')
  // It holds the line four minutes by the clock, working or not; then the notes take their turns again.
  expect((await lineOf(ui))?.label).toBe('For you')
  await world.clock.advance(239_000)
  expect((await lineOf(ui))?.label).toBe('For you')
  await world.clock.advance(1_000)
  expect(['AI', 'Joke']).toContain((await lineOf(ui))?.label)
})

test('a suggestion takes a turn of its own: the line is drawn again the second it ends, and the note after it has its whole four minutes', SLOW, async ($, on) => {
  const world = engine(on, { messages: 10_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  // A hundred seconds into the first turn, the suggestion.
  await world.clock.advance(100_000)
  const first = (await lineOf(ui))?.text
  expect(await suggestion($, ui)).toMatch(/^The window is 15% in use/)
  await stop($, [])
  // It ends on no minute's stroke, and nothing else is going on: the line is drawn again all the same.
  await world.clock.advance(239_000)
  expect((await lineOf(ui))?.label).toBe('For you')
  await world.clock.advance(1_000)
  const next = await lineOf(ui)
  expect(next?.label).toBe('Joke')
  // And it stays its four minutes, though it began a hundred seconds after the clock's own turn would have.
  await world.clock.advance(239_000)
  expect((await lineOf(ui))?.text).toBe(next?.text)
  await world.clock.advance(1_000)
  expect(await lineOf(ui)).toMatchObject({ label: 'AI' })
  expect((await lineOf(ui))?.text).not.toBe(first)
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
  expect(order).toEqual(['5h', 'MCP', 'Memory', 'You', 'Your', 'Every'])

  // Each says what to do and what that takes off, in the session's own figures. Nothing has moved, so
  // the line has nothing to show for any of them.
  expect([...said].sort()).toEqual([
    '5h limit: 18% left for the next 1h 20m. Put the small asks into one prompt, and keep the big ones for after the reset.',
    'Every request sends all 60k tokens of this conversation again. When the task changes, /clear: the next one sends about 20k.',
    'MCP tools are 14k tokens of every request, 12k of them from "figma". /mcp switches a server off: without that one, every request is 12k lighter.',
    'Memory files are 8.5k tokens of every request; MEMORY.md is 6.1k of them. /memory opens it: each 1k you cut comes off every request from then on.',
    'You stopped 7 of your last 8 turns. Plan mode (Shift+Tab) shows the approach before anything is done: say no there instead.',
    'Your last 6 prompts averaged 2 words. Name the file, the goal and what done looks like: one clear ask beats three corrections.',
  ].sort())
})

test('with nothing else to say the suggestion is a plain account of the window', SLOW, async ($, on) => {
  engine(on, { messages: 10_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  expect(await suggestion($, ui)).toBe('The window is 15% in use. /context shows what is filling it, category by category.')
})

test('the suggestions that are about money: a prompt far dearer than the rest, a cache gone cold, the subagents\' share; and what the prompts since show', SLOW, async ($, on) => {
  const world = engine(on, { usd: 1, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  // Each thing the line says to the person, as it is said: after a prompt is put, and after its turn ends.
  const said: string[] = []
  const look = async (): Promise<void> => {
    const line = await lineOf(ui)

    if (line?.label === 'For you' && line.text !== said.at(-1)) {
      said.push(line.text)
    }
  }
  let asks = 0
  const ask = async (text: string, spend: number, used: TurnUsage, agentSpend = 0): Promise<void> => {
    asks += 1
    await turnStart($, text)
    await look()

    // A subagent of the prompt's own: what it spends is that prompt's.
    if (agentSpend > 0) {
      world.usd = (world.usd ?? 0) + agentSpend
      await turnEnd($, `agent-${asks}`)
    }

    world.usd = (world.usd ?? 0) + spend
    await turnEnd($, undefined, used)
    await look()
  }

  // Steady prompts, nearly all of their input read from the cache; then a break of twenty minutes, after
  // which one prompt writes the whole conversation to the cache again and costs twelve times the others.
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

  // Each of the two was said, and once, in what it cost: a turn's end is not news twice.
  expect(said.filter(text => text.startsWith('One prompt cost'))).toEqual(['One prompt cost $2.40, 12 times this session\'s usual $0.20. Point Claude at the files and lines that matter, not the whole tree.'])
  expect(said.filter(text => text.startsWith('After a'))).toEqual(['After a 20m break, one prompt wrote 58k tokens to the prompt cache again and cost $2.40. /compact before you step away: the way back writes only what is left.'])
  expect(said.some(text => /^Subagents are \d\d% of what this session has spent: \$\d+\.\d\d over \d+ runs, \$0\.50 a run\. For a small lookup, ask Claude to do it inline\.$/.test(text))).toBe(true)
  // Four prompts after the dear one was pointed out, the line says what they cost against it: a lookup
  // each, with its subagent. The subagents' share has not fallen and there was no second break: of those
  // it says nothing.
  expect(said.filter(text => text.startsWith('It shows'))).toEqual(['It shows: the dearest of the 4 prompts since cost $0.60, against $2.40 for that one.'])
})

test('what a suggestion said of the context is shown once the conversation is in fact shorter, by however little', SLOW, async ($, on) => {
  const world = engine(on, { messages: 152_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  expect(await suggestion($, ui)).toBe('Context is 86% full, 152k of it messages. /compact swaps those for a summary: the bar would fall toward 10%, and every request sends that much less.')

  // The estimate moving by itself shows nothing.
  world.messages = 151_000
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toMatch(/^Context is 86% full/)
  // A compaction does, by however little: ten tokens are said in full figures, and as the share they are.
  world.messages = 151_990
  await compact($)
  await measure($, 'context')
  expect(await lineOf(ui)).toMatchObject({ label: 'For you', color: 'warning', text: 'It shows: after /compact the context went from 172,000 to 171,990 tokens, so every request from here sends 0.006% less.' })
  // It holds the line its four minutes, and is said once: what is compacted after that is no news.
  await world.clock.advance(239_000)
  expect((await lineOf(ui))?.text).toMatch(/^It shows/)
  await world.clock.advance(1_000)
  expect((await lineOf(ui))?.label).not.toBe('For you')
  world.messages = 20_000
  await compact($)
  await measure($, 'context')
  expect((await lineOf(ui))?.label).not.toBe('For you')
})

test('a compaction that leaves more in the window than there was shows nothing; the engine\'s own is said as that', SLOW, async ($, on) => {
  const world = engine(on, { messages: 60_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  const first = await suggestion($, ui)
  expect(first).toBe('Every request sends all 80k tokens of this conversation again. When the task changes, /clear: the next one sends about 20k.')

  // A compaction that leaves more in the window than there was when the suggestion was made shows
  // nothing; and what the window does after that reading is not the compaction's doing.
  world.messages = 90_000
  await compact($)
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe(first)
  world.messages = 30_000
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe(first)
  // A subagent's own transcript compacted, and a compaction only worked out ahead, are not this conversation's.
  await $.session.compact({ trigger: 'auto', agentId: 'agent-1', messages: SUMMARY })
  await $.session.compact({ trigger: 'precompute', messages: SUMMARY })
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe(first)
  // The engine's own compaction of it is.
  await compact($, 'auto')
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe('It shows: after compaction the context went from 80k to 50k tokens, so every request from here sends 38% less.')
})

test('/clear answers a suggestion about the context too: the line says what the new conversation sends', SLOW, async ($, on) => {
  const world = engine(on, { messages: 60_000, lines: 'offline' })
  await begin($)
  const ui = await mount($, 220)
  expect(await suggestion($, ui)).toBe('Every request sends all 80k tokens of this conversation again. When the task changes, /clear: the next one sends about 20k.')

  await $.session.end({ reason: 'clear', sessionId: 'session-one', resume: { id: 'session-one' } })
  world.sessionId = 'session-two'
  world.startedAt = 2
  world.messages = 0
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe('It shows: after /clear the context went from 80k to 20k tokens, so every request from here sends 75% less.')
  // The new conversation's first prompt leaves it its four minutes; nothing else of the old one is kept.
  await turnStart($, 'a new task')
  expect((await lineOf(ui))?.text).toMatch(/^It shows: after \/clear/)
  await turnEnd($)
  await world.clock.advance(240_000)
  expect((await lineOf(ui))?.label).not.toBe('For you')
})

test('what every request carries: the line says when a server was switched off, and when a memory file was cut', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'offline' })
  world.memory = [{ path: '/home/kumar/.claude/CLAUDE.md', type: 'User', tokens: 2_400 }, { path: '/work/memory/MEMORY.md', type: 'AutoMem', tokens: 6_100 }]
  world.mcp = [
    { name: 'mcp__figma__get_design', serverName: 'figma', tokens: 9_000, isLoaded: true },
    { name: 'mcp__figma__use', serverName: 'figma', tokens: 3_000, isLoaded: true },
    { name: 'mcp__gmail__send', serverName: 'gmail', tokens: 2_000, isLoaded: true },
  ]
  await begin($)
  const ui = await mount($, 220)
  const made = [await suggestion($, ui)]
  expect(made[0]).toBe('MCP tools are 14k tokens of every request, 12k of them from "figma". /mcp switches a server off: without that one, every request is 12k lighter.')

  // The server switched off: the next reading shows it.
  world.mcp = world.mcp.filter(tool => tool.serverName !== 'figma')
  await measure($, 'context')
  made.push((await lineOf(ui))?.text ?? '')
  expect(made[1]).toBe('It shows: MCP tools are 2k tokens of every request now, down from 14k: 86% less.')

  made.push(await suggestion($, ui, made))
  expect(made[2]).toBe('Memory files are 8.5k tokens of every request; MEMORY.md is 6.1k of them. /memory opens it: each 1k you cut comes off every request from then on.')
  world.memory = [{ path: '/home/kumar/.claude/CLAUDE.md', type: 'User', tokens: 2_400 }, { path: '/work/memory/MEMORY.md', type: 'AutoMem', tokens: 4_000 }]
  await measure($, 'context')
  expect((await lineOf(ui))?.text).toBe('It shows: memory files are 6.4k tokens of every request now, down from 8.5k: 25% less.')
})

test('a limit running out before its reset: the line says at what pace, and says so when the pace has fallen', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'offline', windows: [{ kind: 'five_hour', percentUsed: 70, resetsAt: soon }] })
  await begin($)
  const ui = await mount($, 220)
  // Twenty minutes on, ten points more of it are used: thirty an hour. A fifth is left, and an hour to go.
  await world.clock.advance(20 * 60_000)
  world.windows = [{ kind: 'five_hour', percentUsed: 80, resetsAt: soon }]
  await measureLimits($, world)
  expect(await suggestion($, ui)).toBe('5h limit: 20% left, going at 30% an hour: gone in 40m, 20m before it resets. Keep the big asks for after the reset.')

  // Twenty minutes later, two points more: six an hour.
  await world.clock.advance(20 * 60_000)
  world.windows = [{ kind: 'five_hour', percentUsed: 82, resetsAt: soon }]
  await measureLimits($, world)
  expect((await lineOf(ui))?.text).toBe('It shows: the 5h limit is going at 6.0% an hour now, down from 30%.')
})

test('a window that begins again takes its pace with it: nothing is shown of the one that ended', SLOW, async ($, on) => {
  const world = engine(on, { lines: 'offline', windows: [{ kind: 'five_hour', percentUsed: 70, resetsAt: soon }] })
  await begin($)
  const ui = await mount($, 220)
  await world.clock.advance(20 * 60_000)
  world.windows = [{ kind: 'five_hour', percentUsed: 80, resetsAt: soon }]
  await measureLimits($, world)
  expect(await suggestion($, ui)).toMatch(/^5h limit: 20% left, going at 30% an hour/)

  // The window ends and another begins, hardly used: that is no pace fallen.
  const next = new Date(NOW + 6 * 3_600_000).toISOString()
  await world.clock.advance(20 * 60_000)
  world.windows = [{ kind: 'five_hour', percentUsed: 2, resetsAt: next }]
  await measureLimits($, world)
  expect((await lineOf(ui))?.label).not.toBe('For you')
  await world.clock.advance(20 * 60_000)
  world.windows = [{ kind: 'five_hour', percentUsed: 3, resetsAt: next }]
  await measureLimits($, world)
  expect((await lineOf(ui))?.label).not.toBe('For you')
})
