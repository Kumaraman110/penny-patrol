// Runs under `claude plugin test <this folder>`: the mod is loaded by the engine's own host, and the hooks
// this file registers stand for the engine beneath it, answering what the mod calls on $ from memory
// (the session, its usage, the clock, the home folder's files).

import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ContextCategory, ContextCategoryKind, ModelUsage, On, SessionRateLimit, SessionUsage, TurnUsage } from 'claude-code'

// Sunday 4 October 2026, noon, local time: the first day of a week.
const NOW = new Date(2026, 9, 4, 12).getTime()
const HOME = '/home/kumar'
const FOLDER = `${HOME}/.penny-patrol`
const BUFFER = 33_000
const FIXED = 20_000 // system prompt + system tools
const NOTHING = 'nothing drawn'
// The mascot as text: its head between its arms, and its legs apart, then together.
const HEAD = '▄▪  ▪▄'
const LEGS = [' ▗▗▖▖ ', ' ▗▖▗▖ ']

// An element as drawn; one given no props has none.
type El = { type: string; props?: Record<string, unknown>; children?: Array<El | string> }
type World = ReturnType<typeof engine>

const row = (name: string, tokens: number, color: string, kind: ContextCategoryKind): ContextCategory => ({
  name,
  tokens,
  color,
  kind,
  isDeferred: kind === 'deferred',
})

// What `$.session.usage()` answers. The categories come in the engine's own order: the buffer before the
// free space, and a deferred row among them.
function usage(world: { messages: number; window: number; usd: number | null; windows: SessionRateLimit[]; startedAt: number; last: ModelUsage | null; isOffBy: number }): SessionUsage {
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
        memoryFiles: [],
        mcpTools: [],
        agents: [],
        isAutoCompactEnabled: true,
        apiUsage: world.last,
      },
    },
  }
}

// The engine beneath the mod.
function engine(on: On, start: { messages?: number; usd?: number | null; windows?: SessionRateLimit[] } = {}) {
  const world = {
    messages: start.messages ?? 40_000,
    window: 200_000,
    usd: start.usd ?? null,
    windows: start.windows ?? [],
    sessionId: 'session-one',
    startedAt: 1,
    last: null as ModelUsage | null,
    isOffBy: 0,
    agents: [] as Array<{ id: string; type: string; description: string; status: 'running' | 'completed' }>,
    readings: 0,
    toolRuns: 0,
    isUsageDown: false,
    files: new Map<string, { text: string; mtimeMs: number }>(),
    clock: mock.clock(on, { now: NOW }),
  }
  mock.env(on, { HOME })

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

const mount = ($: Engine, bodyColumns: number, maxRows = 12, hasSurvey = false) =>
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
const turnEnd = ($: Engine, agentId?: string, used?: TurnUsage) =>
  $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't', reason: 'answer', ...(agentId === undefined ? {} : { agentId }), ...(used === undefined ? {} : { usage: used }) })
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

// The drawing as rows, and what each row holds.
const isEl = (node: El | string): node is El => typeof node !== 'string'
const textOf = (node: El | string): string => (isEl(node) ? (node.children ?? []).map(textOf).join('') : node)
const rowsOf = async (ui: Band): Promise<El[]> => (((await ui.drawn()) as unknown as El).children ?? []).filter(isEl)
const linesOf = async (ui: Band): Promise<string[]> => (await rowsOf(ui)).map(textOf)
// A row's pieces, each with how it is drawn.
const piecesOf = (el: El): Array<{ text: string; color: unknown; isDim: boolean; isCut: boolean }> =>
  (el.children ?? []).filter(isEl).map(run => ({ text: textOf(run), color: run.props?.color, isDim: run.props?.dimColor === true, isCut: run.props?.inverse === true }))
// The scene's width in a band of `columns`, as the mod lays it out: two fifths of what the padding
// leaves, the rest (to 136 cells) being the readout's, two cells between them.
const trackOf = (columns: number): number => columns - 4 - Math.min(136, columns - 4 - Math.floor((columns - 2) * 0.4))
// A row's cells within the scene, and what it says at the scene's right: a label of nine cells, then words.
const sceneOf = (line: string, columns: number): string => line.slice(0, trackOf(columns))
const saidOf = (line: string, columns: number): string => line.slice(trackOf(columns) + 2).trimEnd()
// Where the mascot stands: the row of its head and its first cell, with the legs it shows.
const mascotOf = (lines: string[]): { row: number; at: number; legs: string } | null => {
  const row = lines.findIndex(line => line.includes(HEAD))
  const at = lines[row]?.indexOf(HEAD) ?? -1

  return row < 0 ? null : { row, at, legs: (lines[row + 1] ?? '').slice(at, at + HEAD.length) }
}
const fileOf = (world: World, name: string): unknown => JSON.parse(world.files.get(`${FOLDER}/${name}`)?.text ?? 'null')
const put = (world: World, name: string, value: unknown): void => {
  world.files.set(`${FOLDER}/${name}`, { text: JSON.stringify(value), mtimeMs: world.clock.now() })
}
const soon = new Date(NOW + 80 * 60_000).toISOString()
const later = new Date(NOW + (3 * 24 + 5) * 3_600_000).toISOString()
const twoWindows: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 85, resetsAt: later }]

test('the scene and the readout: the bars at the left with two free rows over each, a line beside every row', async ($, on) => {
  const world = engine(on, { usd: 2, windows: twoWindows })
  world.last = { input_tokens: 1_200, output_tokens: 900, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 800 }
  await begin($)
  const ui = await mount($, 120)
  const lines = await linesOf(ui)

  expect(trackOf(120)).toBe(47)
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'model    test-model',
    'steps    today/week/month/year 0',
    'context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '         last request: in 60k (58k cached) · out 900',
    'cost     $2.00',
    '         before tracking $2.00',
    '5h       60% left · resets in 1h 20m',
    'week     15% left · resets in 3d 5h',
  ])
  const scene = lines.map(line => sceneOf(line, 120))
  // The mascot stands over the first bar, at its left, and nothing else is in the free rows.
  expect(scene[0]).toBe(HEAD.padEnd(47))
  expect(scene[1]).toBe(LEGS[0]!.padEnd(47))
  expect([scene[3], scene[4], scene[6], scene[7]]).toEqual(Array.from({ length: 4 }, () => ' '.repeat(47)))
  // The context bar; an empty cost bar, nothing having been seen spent; the two limit bars, the first
  // before its name and the second after its own, so the row begins and ends on a bar.
  expect(scene[2]).toHaveLength(47)
  expect(scene[2]).toMatch(/^█+░+▒+$/)
  expect(scene[5]).toBe('░'.repeat(47))
  expect(scene[8]).toBe(`${'█'.repeat(11)}${'░'.repeat(7)} 5h   week ${'█'.repeat(3)}${'░'.repeat(15)}`)
  // No row is wider than the band.
  expect(Math.max(...lines.map(line => line.length))).toBeLessThanOrEqual(118)
})

test('the context bar: a colour a category, what is in use first, then the free space, then the buffer', async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)
  const bar = piecesOf(rows[2]!).filter(piece => /^[█░▒]+$/.test(piece.text))

  // The engine lists the buffer before the free space, and a deferred row among them; the bar does not.
  expect(bar.map(piece => [piece.text[0], piece.color, piece.isDim])).toEqual([
    ['█', 'promptBorder', false],
    ['█', 'inactive', false],
    ['█', 'purple', false],
    ['░', 'promptBorder', true],
    ['▒', 'inactive', false],
  ])
  expect(bar.map(piece => piece.text).join('')).toHaveLength(47)
  // The legend's swatches are the bar's; with no request made yet the buffer's entry has the second line.
  const legend = piecesOf(rows[3]!).filter(piece => piece.text === '█')
  expect(legend.map(piece => piece.color)).toEqual(['promptBorder', 'inactive', 'purple'])
  expect(saidOf(textOf(rows[4]!), 120)).toBe('         ▒ Autocompact buffer 33k')
  expect((await linesOf(ui)).join('\n')).not.toContain('deferred')
  // A label is dim, what a bar's own line says is not, a legend is.
  expect(piecesOf(rows[2]!).slice(-2).map(piece => [piece.text, piece.isDim])).toEqual([['context  ', true], ['30% · 60k / 200k · 107k free', false]])
  expect(piecesOf(rows[3]!).at(-1)).toMatchObject({ text: 'Messages 40k', isDim: true })
})

test('a legend that does not fit gives up its lightest entries and says how many', async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 62)
  const said = (await linesOf(ui)).map(line => saidOf(line, 62))

  // Twenty-five cells for words: the free figure goes from the bar's line, the smallest category and
  // the buffer's entry from the legend.
  expect(trackOf(62)).toBe(24)
  expect(said).toEqual(['model    test-model', 'steps    today/week/month/year 0', 'context  30% · 60k / 200k', '         █ System tools 16k', '         █ Messages 40k  +1'])
})

test('what came before tracking is said only where there is room for it beside who spent', async ($, on) => {
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
  expect(said.slice(5, 8)).toEqual(['cost     $2.76 · this prompt $0.76', '         █ Main $0.31', '         █ Subagents $0.45'])
  await ui.unmount()
  const wide = await mount($, 120)
  expect(saidOf((await linesOf(wide))[6]!, 120)).toBe('         █ Main $0.31  █ Subagents $0.45  before tracking $2.00')
})

test('a legend with room for none of its entries says nothing, not a bare count of them', async ($, on) => {
  const world = engine(on, { usd: 0, windows: twoWindows })
  await begin($)
  await turnStart($, 'spend')
  world.usd = 0.31
  await call($)
  world.usd = 12_345.98
  await turnEnd($, 'agent-7')
  const ui = await mount($, 60)
  const said = (await linesOf(ui)).map(line => saidOf(line, 60))

  // One row under the cost bar (the other is the first limit's), twenty-four cells: the larger entry
  // and a count of the other would need twenty-six.
  expect(said.slice(5, 8)).toEqual(['cost     $12,345.98', '', '5h       60% left'])
})

test('hiding is this session\'s own choice, kept in its file and restored when it loads', async ($, on) => {
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

test('a session saved hidden starts hidden, reads nothing, and shows on request', async ($, on) => {
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

test('the window is read again when the engine measures a moved context, and during a turn at most once in ten seconds', async ($, on) => {
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

test('/clear drops the reading until the new conversation is measured, and a survey is given the band', async ($, on) => {
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

test('where the scene has no room, by width or by rows, the bars stand alone with their figures', async ($, on) => {
  engine(on, { usd: 2, windows: twoWindows })
  await begin($)

  // Sixty columns is the scene's least; fifty-nine has the bars across the band, each with its figures.
  const least = await mount($, 60)
  expect(mascotOf(await linesOf(least))).toMatchObject({ row: 0, at: 0 })
  expect(await rowsOf(least)).toHaveLength(9)
  await least.unmount()

  const narrow = await mount($, 59)
  const [context, cost, gauges] = await rowsOf(narrow)
  expect(await rowsOf(narrow)).toHaveLength(3)
  expect(textOf(context!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k · 107k free$/)
  expect(textOf(cost!)).toMatch(/^░+ +\$2\.00$/)
  // The labels take the wider one's width, so the two bars are one length.
  expect(textOf(context!)).toHaveLength(57)
  expect(textOf(cost!)).toHaveLength(57)
  expect((gauges!.children ?? []).filter(isEl).map(textOf)).toEqual([expect.stringMatching(/^5h █+░+ {2}60% left$/), expect.stringMatching(/^week █+░+ {2}15% left$/)])
  expect((await linesOf(narrow)).join('')).not.toContain('▪')
  await narrow.unmount()

  // A band allowed fewer rows than the scene has: the same.
  const low = await mount($, 120, 8)
  expect(await rowsOf(low)).toHaveLength(3)
  expect(textOf((await rowsOf(low))[0]!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k · 107k free$/)
  await low.unmount()

  // A label gives way before its bar does, last part first.
  const tiny = await mount($, 30)
  expect(textOf((await rowsOf(tiny))[0]!)).toMatch(/^█+░+▒+ {2}30% · 60k \/ 200k$/)
  await tiny.unmount()
  const least2 = await mount($, 14)
  expect(textOf((await rowsOf(least2))[0]!)).toMatch(/^[█░▒]{12}$/)
})

test('effort is taken from a tool call of the main loop, and kept with the session', async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 120)
  const tool = { tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: {}, tool_use_id: 't1' }
  const model = async (): Promise<string> => saidOf((await linesOf(ui))[0]!, 120)

  await $.classic.PostToolUse({ ...tool, agent_id: 'agent-1', effort: { level: 'low' } })
  expect(await model()).toBe('model    test-model')
  await $.classic.PostToolUse({ ...tool, effort: { level: 'xhigh' } })
  expect(await model()).toBe('model    test-model · xhigh effort')

  await turnEnd($)
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ effort: 'xhigh' })
})

test('the cost bar books every rise of the session total to whoever was acting, and the ledger justifies it', async ($, on) => {
  const world = engine(on, { usd: 2 })
  world.agents = [{ id: 'agent-7', type: 'general-purpose', description: 'Check the build', status: 'completed' }]
  await begin($)
  const ui = await mount($, 120)
  expect(saidOf((await linesOf(ui))[6]!, 120)).toBe('         before tracking $2.00')

  await turnStart($, 'fix the   flaky\ntest')
  world.usd = 2.3
  await call($)
  world.usd = 2.75
  await turnEnd($, 'agent-7', tokens(10, 2_000, 30_000, 500))
  world.usd = 2.76
  await turnEnd($, undefined, tokens(100, 50, 9_000, 1_000))

  const rows = await rowsOf(ui)
  expect(saidOf(textOf(rows[5]!), 120)).toBe('cost     $2.76 · this prompt $0.76')
  expect(saidOf(textOf(rows[6]!), 120)).toBe('         █ Main $0.31  █ Subagents $0.45  before tracking $2.00')
  // The bar is who spent what was seen being spent: what came before tracking is said, not drawn.
  const bar = piecesOf(rows[5]!).filter(piece => /^█+$/.test(piece.text))
  expect(bar.map(piece => piece.color)).toEqual(['permission', 'cyan_FOR_SUBAGENTS_ONLY'])
  expect(bar.map(piece => piece.text.length)).toEqual([19, 28])

  const text = (await command($, 'costs')).text
  expect(text).toContain('Session total reported by Claude Code: $2.76')
  expect(text).toContain('itemised below:   $0.76')
  expect(text).toContain('before tracking:  $2.00')
  expect(text).toContain('unaccounted:      $0.00')
  expect(text).toContain('prompts:          1 · average $0.76 · most expensive $0.76')
  expect(text).toContain('  1.     $0.76  fix the flaky test')
  expect(text).toContain('main $0.31 · test-model · in 100, out 50, cache read 9k, cache write 1k (89% of input from cache)')
  expect(text).toContain('general-purpose "Check the build" $0.45 · test-model · in 10, out 2k, cache read 30k, cache write 500 (98% of input from cache)')
})

test('the cents shown always add up to the total shown, however the parts round', async ($, on) => {
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
  expect(saidOf(lines[5]!, 120)).toBe('cost     $10.02 · this prompt $0.01')
  expect(saidOf(lines[6]!, 120)).toBe('         █ Main $0.01  before tracking $10.01')
  expect(shown.reduce((sum, cents) => sum + cents, 0)).toBe(1002)
  expect((await command($, 'costs')).text).toContain('unaccounted:      $0.00')
  expect((await command($, 'audit')).text).not.toContain('OFF')
})

test('a subagent\'s later spend belongs to the prompt that started it', async ($, on) => {
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

test('a session\'s ledger is its own: restored from its file, and another session neither reads nor writes it', async ($, on) => {
  const world = engine(on, { usd: 5.5 })
  const turn = { seq: 1, label: 'earlier', main: 4, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, model: null, agents: {} }
  put(world, 'sessions/session-one.json', { ledger: { seen: 5, untracked: 1, folded: { usd: 0, prompts: 0 }, steps: 40, nextSeq: 2, turns: [turn], agents: {} }, effort: 'high', isHidden: false })
  put(world, 'days/session-one.json', { '2026-10-04': { steps: 40, usd: 4 } })
  await begin($)

  let text = (await command($, 'costs')).text
  expect(text).toContain('before tracking:  $1.00')
  expect(text).toContain('  1.     $4.50  earlier')
  expect(text).toContain('working time:     40 steps')

  // Another conversation takes over this process (as after /clear): its own id, its own files.
  world.sessionId = 'session-two'
  world.startedAt = 2
  world.usd = 6
  await turnStart($, 'new conversation')
  world.usd = 6.25
  await turnEnd($)
  text = (await command($, 'costs')).text
  expect(text).toContain('before tracking:  $6.00')
  expect(text).toContain('  1.     $0.25  new conversation')
  expect(text).not.toContain('earlier')
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ ledger: { seen: 5.5, turns: [{ label: 'earlier', main: 4.5 }] } })
  expect(fileOf(world, 'sessions/session-two.json')).toMatchObject({ ledger: { seen: 6.25, untracked: 6 } })
  expect(fileOf(world, 'days/session-two.json')).toEqual({ '2026-10-04': { steps: 0, usd: 0.25 } })
})

test('the mascot walks the bars a step a second: along the first, down, back along the second, down, along the last, and home again', { timeoutMs: 30_000 }, async ($, on) => {
  const world = engine(on, { usd: 3, windows: twoWindows })
  await begin($)
  const ui = await mount($, 62)
  const walk = async (seconds: number): Promise<{ row: number; at: number; legs: string } | null> => {
    await world.clock.advance(seconds * 1_000)

    return mascotOf(await linesOf(ui))
  }
  // A scene of twenty-four cells: the mascot's six leave it eighteen steps along a bar.
  expect(trackOf(62)).toBe(24)
  expect(await walk(0)).toEqual({ row: 0, at: 0, legs: LEGS[0] })

  // Nothing runs: the seconds pass and it stands where it is.
  expect(await walk(3)).toEqual({ row: 0, at: 0, legs: LEGS[0] })

  await turnStart($, 'work')
  // Its inner legs step in on the odd steps and out on the even ones.
  expect(await walk(1)).toEqual({ row: 0, at: 1, legs: LEGS[1] })
  expect(await walk(1)).toEqual({ row: 0, at: 2, legs: LEGS[0] })
  // The right end of the first bar, then down onto the second, which it walks leftward.
  expect(await walk(16)).toEqual({ row: 0, at: 18, legs: LEGS[0] })
  expect(await walk(1)).toEqual({ row: 3, at: 18, legs: LEGS[1] })
  expect(await walk(1)).toEqual({ row: 3, at: 17, legs: LEGS[0] })
  expect(await walk(17)).toEqual({ row: 3, at: 0, legs: LEGS[1] })
  // Down onto the limit bars, and along both to the right end of the last.
  expect(await walk(1)).toEqual({ row: 6, at: 0, legs: LEGS[0] })
  expect(await walk(18)).toEqual({ row: 6, at: 18, legs: LEGS[0] })
  const lines = await linesOf(ui)
  expect(sceneOf(lines[6]!, 62)).toBe(`${' '.repeat(18)}${HEAD}`)
  expect(sceneOf(lines[7]!, 62)).toBe(`${' '.repeat(18)}${LEGS[0]}`)
  // It is drawn in its own colour: the body as background with the eyes and the gaps between the legs
  // cut out of it, the arms as blocks at its sides.
  const drawn = piecesOf((await rowsOf(ui))[6]!).filter(piece => piece.color === 'claude')
  expect(drawn.map(piece => [piece.text, piece.isCut])).toEqual([['▄', false], ['▪  ▪', true], ['▄', false]])
  // The rows it left are free again, and it never stands in a bar.
  expect(sceneOf(lines[0]!, 62)).toBe(' '.repeat(24))
  expect([lines[2], lines[5], lines[8]].map(line => sceneOf(line!, 62)).join('')).not.toMatch(/[▄▪▗▖]/)
  // Then the whole way back, to where it began, and out again.
  expect(await walk(1)).toEqual({ row: 6, at: 17, legs: LEGS[1] })
  expect(await walk(55)).toEqual({ row: 0, at: 0, legs: LEGS[0] })
  expect(await walk(1)).toEqual({ row: 0, at: 1, legs: LEGS[1] })
  expect(saidOf((await linesOf(ui))[1]!, 62)).toBe('steps    today/week/month/year 113')

  // The turn over and nothing left running, it stands, legs apart.
  await turnEnd($)
  await stop($, [])
  expect(await walk(2)).toEqual({ row: 0, at: 1, legs: LEGS[0] })
  expect(fileOf(world, 'days/session-one.json')).toMatchObject({ '2026-10-04': { steps: 113 } })
})

test('a background shell or subagent keeps the mascot walking after the turn; a monitor alone does not', async ($, on) => {
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

test('a subagent already running when the mod loads is background work', async ($, on) => {
  const world = engine(on)
  world.agents = [{ id: 'agent-1', type: 'general-purpose', description: 'long job', status: 'running' }]
  await begin($)
  const ui = await mount($, 120)
  await world.clock.advance(4_000)
  expect(mascotOf(await linesOf(ui))).toMatchObject({ row: 0, at: 4 })
})

test('the limit bars show what is left of each window, draining, in the colour of how much that is', async ($, on) => {
  const world = engine(on, { windows: twoWindows })
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)
  // With no cost reported there is no cost bar: the limit bars are the second row of the scene.
  expect(rows).toHaveLength(6)
  expect(saidOf(textOf(rows[4]!), 120)).toBe('5h       60% left · resets in 1h 20m')
  expect(saidOf(textOf(rows[5]!), 120)).toBe('week     15% left · resets in 3d 5h')
  // What is left is the filled part: green above half, red under a fifth; the names between, dim.
  expect(piecesOf(rows[5]!).slice(0, 5).map(piece => [piece.text, piece.color, piece.isDim])).toEqual([
    ['█'.repeat(11), 'success', false],
    ['░'.repeat(7), 'inactive', true],
    [' 5h   week ', undefined, true],
    ['█'.repeat(3), 'error', false],
    ['░'.repeat(15), 'inactive', true],
  ])
  // Written for the other sessions, stamped with when it was read.
  expect(fileOf(world, 'limits.json')).toMatchObject({ at: NOW, windows: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day' }] })
})

test('a countdown moves on while nothing else does: the band is drawn again every minute', async ($, on) => {
  const world = engine(on, { windows: twoWindows })
  await begin($)
  const ui = await mount($, 120)
  const fiveHours = async (): Promise<string> => saidOf((await linesOf(ui))[4]!, 120)

  await world.clock.advance(59_000)
  expect(await fiveHours()).toBe('5h       60% left · resets in 1h 20m')
  await world.clock.advance(1_000)
  expect(await fiveHours()).toBe('5h       60% left · resets in 1h 19m')
})

test('a reading another session wrote shows here within five seconds; an older one does not', async ($, on) => {
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40 }] })
  await begin($)
  const ui = await mount($, 100)
  // One window: its bar has the row to itself, and its line stands beside it.
  const left = async (): Promise<string> => saidOf((await linesOf(ui))[5]!, 100)
  expect(await left()).toBe('5h       60% left')
  expect(sceneOf((await linesOf(ui))[5]!, 100)).toMatch(/^█+░+$/)

  put(world, 'limits.json', { at: NOW - 60_000, windows: [{ kind: 'five_hour', percentUsed: 5 }] })
  await world.clock.advance(5_000)
  expect(await left()).toBe('5h       60% left')

  put(world, 'limits.json', { at: NOW + 4_000, windows: [{ kind: 'five_hour', percentUsed: 90, resetsAt: new Date(NOW - 1_000).toISOString() }] })
  await world.clock.advance(5_000)
  expect(await left()).toBe('5h       10% left · reset due')
  expect(piecesOf((await rowsOf(ui))[5]!)[0]).toMatchObject({ color: 'error' })
})

test('an account with no limit window gets the month\'s spend: growing, or draining a budget once one is set', async ($, on) => {
  const world = engine(on, { usd: 100 })
  await begin($)
  const ui = await mount($, 120)
  const month = async (): Promise<{ bar: string; said: string; color: unknown }> => {
    const row = (await rowsOf(ui))[8]!

    return { bar: sceneOf(textOf(row), 120), said: saidOf(textOf(row), 120), color: piecesOf(row)[0]?.color }
  }
  // Nothing spent since tracking began: an empty bar toward the first round figure.
  expect(await month()).toEqual({ bar: '░'.repeat(47), said: 'month    $0.00 spent · bar full at $1.00', color: 'inactive' })

  await turnStart($, 'spend')
  world.usd = 103.04
  await turnEnd($)
  expect(await month()).toMatchObject({ bar: `${'█'.repeat(28)}${'░'.repeat(19)}`, said: 'month    $3.04 spent · bar full at $5.00', color: 'permission' })

  expect((await command($, 'budget')).text).toContain('not set')
  expect((await command($, 'budget 8,000')).text).toContain('Budget set: $8,000.00 a month')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: 8000 })
  expect(await month()).toMatchObject({ bar: `${'█'.repeat(46)}░`, said: 'month    $7,996.96 left of $8,000.00', color: 'success' })

  expect((await command($, 'budget off')).text).toBe('Budget cleared.')
  expect(await month()).toMatchObject({ said: 'month    $3.04 spent · bar full at $5.00' })
  // Set from another session: taken up at the next look at the others' files.
  put(world, 'settings.json', { budget: 50 })
  await world.clock.advance(30_000)
  expect(await month()).toMatchObject({ said: 'month    $46.96 left of $50.00' })
})

test('a budget beside the limit windows: the first has its line above the bars, the others share the line beside them', async ($, on) => {
  const world = engine(on, { usd: 12.4, windows: twoWindows })
  put(world, 'settings.json', { budget: 200 })
  await begin($)
  const ui = await mount($, 160)
  const lines = await linesOf(ui)

  expect(trackOf(160)).toBe(63)
  expect(saidOf(lines[7]!, 160)).toBe('5h       60% left · resets in 1h 20m')
  expect(saidOf(lines[8]!, 160)).toBe('week     15% left · resets in 3d 5h   month $200.00 left of $200.00')
  expect(sceneOf(lines[8]!, 160)).toMatch(/^[█░]{15} 5h {2}week [█░]{15} {2}month [█░]{15}$/)
})

test('steps add up by day, week from Sunday, month and year, across every session on this machine; equal periods are said once', async ($, on) => {
  const world = engine(on, { usd: 1 })
  put(world, 'days/another-session.json', {
    '2025-12-31': { steps: 999, usd: 9 },
    '2026-09-30': { steps: 7, usd: 2 },
    '2026-10-03': { steps: 100, usd: 1 },
    '2026-10-04': { steps: 10, usd: 0.5 },
  })
  await begin($)
  const ui = await mount($, 120)
  const steps = async (): Promise<string> => saidOf((await linesOf(ui))[1]!, 120)
  // Today is a Sunday, so the week is today; yesterday is this month's, the 30th of September this year's.
  expect(await steps()).toBe('steps    today/week 10 · month 110 · year 117')

  await turnStart($, 'work')
  await world.clock.advance(4_000)
  world.usd = 1.25
  await turnEnd($)
  await stop($, [])
  expect(await steps()).toBe('steps    today/week 14 · month 114 · year 121')
  // The dollars by period are the ledger's to say, not the band's.
  expect((await linesOf(ui)).join('\n')).not.toMatch(/today.*\$/)
  expect((await command($, 'costs')).text).toContain('this machine:     today $0.75 · week $0.75 · month $1.75 · year $3.75')

  // The other session goes on working: its file changes, and the next look takes it up.
  await world.clock.advance(1_000)
  put(world, 'days/another-session.json', { '2026-10-04': { steps: 1_010, usd: 20.5 } })
  await world.clock.advance(30_000)
  expect(await steps()).toBe('steps    today/week/month/year 1,014')
  expect((await command($, 'costs')).text).toContain('this machine:     today $20.75')
})

test('audit says the figures agree, and says so when they do not', async ($, on) => {
  const world = engine(on, { usd: 4, windows: [{ kind: 'five_hour', percentUsed: 10 }] })
  world.last = { input_tokens: 5, output_tokens: 7, cache_read_input_tokens: 59_000, cache_creation_input_tokens: 995 }
  await begin($)
  await turnStart($, 'work')
  world.usd = 4.2
  await turnEnd($)

  let text = (await command($, 'audit')).text
  expect(text).toContain('ok   context: the categories in use add up to 60,000; Claude Code reports 60,000 in use')
  expect(text).toContain('ok   context: in use, free and buffer add up to 200,000; the window is 200,000')
  expect(text).toContain('ok   context: 60,000 of 200,000 is 30%')
  expect(text).toContain('note the last request sent 60,000 tokens in (5 new, 59,000 read from the cache, 995 written to it) and got 7 out')
  expect(text).toContain('ok   cost: prompts $0.20 + earlier $0.00 + before tracking $4.00 = $4.20; Claude Code reports $4.20')
  expect(text).not.toContain('OFF')

  world.isOffBy = 1_500
  text = (await command($, 'audit')).text
  expect(text).toContain('OFF  context: the categories in use add up to 60,000; Claude Code reports 61,500 in use')
})

test('with no cost and no limit reported the scene is the context bar alone, and the ledger says so', async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const lines = await linesOf(ui)
  // Two free rows, the bar, and under it what it has to say.
  expect(lines.map(line => saidOf(line, 120))).toEqual([
    'model    test-model',
    'steps    today/week/month/year 0',
    'context  30% · 60k / 200k · 107k free',
    '         █ System prompt 4k  █ System tools 16k  █ Messages 40k',
    '         ▒ Autocompact buffer 33k',
  ])
  expect(lines.join('\n')).not.toContain('$')
  expect((await command($, 'costs')).text).toBe('No cost is reported for this session.')
  expect((await command($, 'nonsense')).text).toContain('/penny-patrol costs prints the ledger')
})

test('a reading that fails after a tool call leaves the call, run once, and the last reading', async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  world.isUsageDown = true
  expect(await call($)).toMatchObject({ result: 'ran' })
  expect(world.toolRuns).toBe(1)
  expect(await ui.find({ type: 'Text', text: '30% · 60k / 200k' })).toBeDefined()
})
