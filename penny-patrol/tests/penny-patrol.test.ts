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
const BAR = /^[█░▒▗▖▝▘▪]+$/

type El = { type: string; props: Record<string, unknown>; children?: Array<El | string> }
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

const mount = ($: Engine, bodyColumns: number, hasSurvey = false) =>
  $.ui.mount({
    plugin: 'penny-patrol',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey, isWorking: false, maxRows: 12, bodyColumns, scroll: { offset: 0, bodyRows: 12 }, view: {} },
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
const runsOf = (el: El): El[] => (el.children ?? []).filter(isEl)
// A bar's cells: the runs of block characters, walker and all.
const barOf = (el: El): string => runsOf(el).map(textOf).filter(text => BAR.test(text)).join('')
// Where the walker's leading arm stands on the bar, or -1.
const walkerAt = (el: El): number => barOf(el).search(/[▗▝]/)
const labelOf = (el: El): string => textOf(runsOf(el).at(-1) ?? '')
const fileOf = (world: World, name: string): unknown => JSON.parse(world.files.get(`${FOLDER}/${name}`)?.text ?? 'null')
const put = (world: World, name: string, value: unknown): void => {
  world.files.set(`${FOLDER}/${name}`, { text: JSON.stringify(value), mtimeMs: world.clock.now() })
}

test('the context bar: what is in use, then the free space, then the buffer at the window\'s end', async ($, on) => {
  const world = engine(on)
  world.last = { input_tokens: 1_200, output_tokens: 900, cache_read_input_tokens: 58_000, cache_creation_input_tokens: 800 }
  await begin($)
  const ui = await mount($, 120)
  const [bar, legend] = await rowsOf(ui)

  const label = '  30%  60k / 200k  ·  test-model  ·  0 steps'
  expect(labelOf(bar!)).toBe(label)
  // 120 cells less the padding's two and the label. Nothing runs, so no walker stands on it.
  expect(barOf(bar!)).toHaveLength(120 - 2 - label.length)
  expect(barOf(bar!)).toMatch(/^█+░+▒+$/)
  // The legend follows the bar: the engine lists the buffer before the free space, the bar does not.
  expect(textOf(legend!)).toMatch(/System prompt 4k.*System tools 16k.*Messages 40k.*Free space 107k.*Autocompact buffer 33k/)
  expect(textOf(legend!)).not.toContain('deferred')
  expect(textOf(legend!)).toContain('last request: in 1.2k · cache read 58k · cache write 800 · out 900')

  const colours = runsOf(bar!).filter(run => BAR.test(textOf(run)) && run.props.color !== 'claude').map(run => [run.props.color, run.props.dimColor])
  expect(colours).toEqual([['promptBorder', false], ['inactive', false], ['purple', false], ['promptBorder', true], ['inactive', false]])
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
  expect(await ui.find({ type: 'Text', text: '30%' })).toBeDefined()
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
  expect(await ui.find({ type: 'Text', text: '60%  120k / 200k' })).toBeDefined()

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
  expect(await ui.find({ type: 'Text', text: '50%  100k / 200k' })).toBeDefined()
})

test('/clear drops the reading until the new conversation is measured, and a survey is given the band', async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 100)
  await $.session.end({ reason: 'clear', sessionId: 'session-one', resume: { id: 'session-one' } })
  expect(await ui.find({ text: NOTHING })).toBeDefined()

  world.messages = 0
  await call($)
  expect(await ui.find({ type: 'Text', text: '10%  20k / 200k' })).toBeDefined()
  await ui.unmount()

  const survey = await mount($, 100, true)
  expect(await survey.find({ text: NOTHING })).toBeDefined()
})

test('a narrow band keeps its bars and gives up the label, last part first', async ($, on) => {
  engine(on)
  await begin($)

  const narrow = await mount($, 32)
  expect(labelOf((await rowsOf(narrow))[0]!)).toBe('  30%  60k / 200k')
  await narrow.unmount()

  const tiny = await mount($, 24)
  const [bar] = await rowsOf(tiny)
  expect(barOf(bar!)).toHaveLength(22)
  expect(textOf(bar!)).not.toContain('%')
  await tiny.unmount()
  // Too short for a walker, even while a turn runs: sixteen cells are its least.
  await turnStart($, 'work')
  const short = await mount($, 12)
  expect(walkerAt((await rowsOf(short))[0]!)).toBe(-1)
})

test('effort is taken from a tool call of the main loop, and kept with the session', async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 120)
  const tool = { tool_name: 'Bash', tool_input: { command: 'true' }, tool_response: {}, tool_use_id: 't1' }

  await $.classic.PostToolUse({ ...tool, agent_id: 'agent-1', effort: { level: 'low' } })
  expect(labelOf((await rowsOf(ui))[0]!)).not.toContain('low')
  await $.classic.PostToolUse({ ...tool, effort: { level: 'xhigh' } })
  expect(labelOf((await rowsOf(ui))[0]!)).toBe('  30%  60k / 200k  ·  test-model  ·  xhigh  ·  0 steps')

  await turnEnd($)
  expect(fileOf(world, 'sessions/session-one.json')).toMatchObject({ effort: 'xhigh' })
})

test('the cost bar books every rise of the session total to whoever was acting, and the ledger justifies it', async ($, on) => {
  const world = engine(on, { usd: 2 })
  world.agents = [{ id: 'agent-7', type: 'general-purpose', description: 'Check the build', status: 'completed' }]
  await begin($)
  const ui = await mount($, 140)
  expect(textOf((await rowsOf(ui))[3]!)).toContain('Before tracking $2.00')

  await turnStart($, 'fix the   flaky\ntest')
  world.usd = 2.3
  await call($)
  world.usd = 2.75
  await turnEnd($, 'agent-7', tokens(10, 2_000, 30_000, 500))
  world.usd = 2.76
  await turnEnd($, undefined, tokens(100, 50, 9_000, 1_000))

  const [, , bar, legend] = await rowsOf(ui)
  expect(labelOf(bar!).trim()).toBe('$2.76  ·  this prompt $0.76  ·  0 steps')
  expect(textOf(legend!)).toMatch(/Main conversation \$0\.31.*Subagents \$0\.45.*Before tracking \$2\.00/)

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
  const ui = await mount($, 140)
  await turnStart($, 'a')
  world.usd = 10.008
  await call($)
  world.usd = 10.012
  await turnEnd($, 'agent-1')
  world.usd = 10.016
  await turnEnd($)

  const [, , bar, legend] = await rowsOf(ui)
  const shown = [...textOf(legend!).matchAll(/\$(\d+)\.(\d\d)/g)].map(found => Number(found[1]) * 100 + Number(found[2]))
  expect(labelOf(bar!)).toContain('$10.02')
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

test('while a turn runs a walker paces each bar, a step a second, neighbours in opposite directions; then they step off', async ($, on) => {
  const world = engine(on, { usd: 3 })
  await begin($)
  const ui = await mount($, 120)
  let [context, , cost] = await rowsOf(ui)
  const track = barOf(context!).length - 8
  // Both labels take the wider one's width, so the two bars are one length and the walkers one track.
  expect(barOf(cost!)).toHaveLength(barOf(context!).length)
  // Nothing runs: the bars are bare, and stay so as the seconds pass.
  await world.clock.advance(3_000)
  ;[context, , cost] = await rowsOf(ui)
  expect([walkerAt(context!), walkerAt(cost!)]).toEqual([-1, -1])

  await turnStart($, 'work')
  await world.clock.advance(3_000)
  ;[context, , cost] = await rowsOf(ui)
  expect([walkerAt(context!), walkerAt(cost!)]).toEqual([3, track - 3])
  // An odd step: arms up. An even one: arms down.
  expect(barOf(context!).slice(3, 11)).toBe('▝█▪██▪█▘')
  expect(runsOf(context!).filter(run => textOf(run) === '▪').map(run => [run.props.color, run.props.inverse])).toEqual([['claude', true], ['claude', true]])
  expect(labelOf(context!)).toContain('3 steps')
  expect(labelOf(cost!)).toContain('3 steps')
  await world.clock.advance(1_000)
  expect(barOf((await rowsOf(ui))[0]!).slice(4, 12)).toBe('▗█▪██▪█▖')

  // Past the end of the track it has turned back. (The bar is a cell shorter by now: the count of steps
  // in its label gained a digit.)
  const steps = track + 10
  await world.clock.advance((steps - 4) * 1_000)
  ;[context, , cost] = await rowsOf(ui)
  const now = barOf(context!).length - 8
  expect(now).toBe(track - 1)
  expect([walkerAt(context!), walkerAt(cost!)]).toEqual([now * 2 - steps, now - (now * 2 - steps)])

  await turnEnd($)
  await stop($, [])
  await world.clock.advance(2_000)
  ;[context, , cost] = await rowsOf(ui)
  expect([walkerAt(context!), walkerAt(cost!)]).toEqual([-1, -1])
  expect(labelOf(context!)).toContain(`${steps} steps`)
})

test('a background shell or subagent keeps the walkers walking after the turn; a monitor alone does not', async ($, on) => {
  const world = engine(on)
  await begin($)
  const ui = await mount($, 120)
  await turnStart($, 'work')
  await turnEnd($)

  await stop($, ['monitor'])
  await world.clock.advance(2_000)
  expect(walkerAt((await rowsOf(ui))[0]!)).toBe(-1)

  await stop($, ['shell', 'monitor'])
  await world.clock.advance(2_000)
  expect(walkerAt((await rowsOf(ui))[0]!)).toBe(2)

  await subagentStop($, [])
  await world.clock.advance(2_000)
  expect(walkerAt((await rowsOf(ui))[0]!)).toBe(-1)
  // The steps are kept by day in this session's own file.
  expect(fileOf(world, 'days/session-one.json')).toEqual({ '2026-10-04': { steps: 2, usd: 0 } })
})

test('a subagent already running when the mod loads is background work', async ($, on) => {
  const world = engine(on)
  world.agents = [{ id: 'agent-1', type: 'general-purpose', description: 'long job', status: 'running' }]
  await begin($)
  const ui = await mount($, 120)
  await world.clock.advance(4_000)
  expect(walkerAt((await rowsOf(ui))[0]!)).toBe(4)
})

test('the limit bars show what is left of each window, draining, with its reset beside it', async ($, on) => {
  const soon = new Date(NOW + 80 * 60_000).toISOString()
  const later = new Date(NOW + (3 * 24 + 5) * 3_600_000).toISOString()
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40, resetsAt: soon }, { kind: 'seven_day', percentUsed: 85, resetsAt: later }] })
  await begin($)
  const ui = await mount($, 142)
  const gauges = runsOf((await rowsOf(ui))[2]!)

  expect(gauges.map(textOf).map(text => text.replace(BAR, '').replace(/[█░▗▖▝▘▪]+/, '|'))).toEqual([
    '5h |  60% left · resets in 1h 20m',
    'week |  15% left · resets in 3d 5h',
  ])
  const [fiveHour, week] = gauges.map(gauge => runsOf(gauge).filter(run => BAR.test(textOf(run)) && run.props.color !== 'claude'))
  expect(fiveHour!.map(run => run.props.color)).toEqual(['success', 'inactive'])
  expect(week!.map(run => run.props.color)).toEqual(['error', 'inactive'])
  // What is left is the filled part: three fifths of the first bar.
  const cells = barOf(gauges[0]!).length
  expect(Math.abs((barOf(gauges[0]!).match(/█/g) ?? []).length - cells * 0.6)).toBeLessThanOrEqual(1)
  // While a turn runs, the two walkers of the row go opposite ways as well.
  await turnStart($, 'work')
  await world.clock.advance(1_000)
  const walking = runsOf((await rowsOf(ui))[2]!)
  expect([walkerAt(walking[0]!), walkerAt(walking[1]!)]).toEqual([cells - 8 - 1, 1])
  // Written for the other sessions, stamped with when it was read.
  expect(fileOf(world, 'limits.json')).toMatchObject({ at: NOW, windows: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day' }] })
})

test('a reading another session wrote shows here within five seconds; an older one does not', async ($, on) => {
  const world = engine(on, { windows: [{ kind: 'five_hour', percentUsed: 40 }] })
  await begin($)
  const ui = await mount($, 100)
  const left = async (): Promise<string> => textOf((await rowsOf(ui))[2]!)
  expect(await left()).toContain('60% left')

  put(world, 'limits.json', { at: NOW - 60_000, windows: [{ kind: 'five_hour', percentUsed: 5 }] })
  await world.clock.advance(5_000)
  expect(await left()).toContain('60% left')

  put(world, 'limits.json', { at: NOW + 4_000, windows: [{ kind: 'five_hour', percentUsed: 90, resetsAt: new Date(NOW - 1_000).toISOString() }] })
  await world.clock.advance(5_000)
  expect(await left()).toContain('10% left · reset due')
  expect(runsOf(runsOf((await rowsOf(ui))[2]!)[0]!).find(run => /^█+$/.test(textOf(run)))?.props.color).toBe('error')
})

test('an account with no limit window gets the month\'s spend: growing, or draining a budget once one is set', async ($, on) => {
  const world = engine(on, { usd: 100 })
  await begin($)
  const ui = await mount($, 120)
  const month = async (): Promise<string> => textOf((await rowsOf(ui))[4]!).replace(/[█░▗▖▝▘▪]+/, '|')
  // Nothing spent since tracking began: an empty bar toward the first round figure.
  expect(await month()).toBe('month |  $0.00 spent, of $1.00 next')

  await turnStart($, 'spend')
  world.usd = 103.04
  await turnEnd($)
  expect(await month()).toBe('month |  $3.04 spent, of $5.00 next')

  expect((await command($, 'budget')).text).toContain('not set')
  expect((await command($, 'budget 8,000')).text).toContain('Budget set: $8,000.00 a month')
  expect(fileOf(world, 'settings.json')).toEqual({ budget: 8000 })
  expect(await month()).toBe('month |  $7,996.96 left of $8,000.00')
  expect(runsOf(runsOf((await rowsOf(ui))[4]!)[0]!).find(run => /█/.test(textOf(run)) && run.props.color !== 'claude')?.props.color).toBe('success')

  expect((await command($, 'budget off')).text).toBe('Budget cleared.')
  expect(await month()).toBe('month |  $3.04 spent, of $5.00 next')
  // Set from another session: taken up at the next look at the others' files.
  put(world, 'settings.json', { budget: 50 })
  await world.clock.advance(30_000)
  expect(await month()).toBe('month |  $46.96 left of $50.00')
})

test('steps and spend add up by day, week from Sunday, month and year, across every session on this machine', async ($, on) => {
  const world = engine(on, { usd: 1 })
  put(world, 'days/another-session.json', {
    '2025-12-31': { steps: 999, usd: 9 },
    '2026-09-30': { steps: 7, usd: 2 },
    '2026-10-03': { steps: 100, usd: 1 },
    '2026-10-04': { steps: 10, usd: 0.5 },
  })
  await begin($)
  const ui = await mount($, 140)
  await turnStart($, 'work')
  await world.clock.advance(4_000)
  world.usd = 1.25
  await turnEnd($)
  await stop($, [])

  const last = async (): Promise<string> => textOf((await rowsOf(ui)).at(-1)!)
  expect(await last()).toContain('steps  today 14 · week 14 · month 114 · year 121')
  expect(await last()).toContain('spend  today $0.75 · week $0.75 · month $1.75 · year $3.75')

  // The other session goes on working: its file changes, and the next look takes it up.
  await world.clock.advance(1_000)
  put(world, 'days/another-session.json', { '2026-10-04': { steps: 1_010, usd: 20.5 } })
  await world.clock.advance(30_000)
  expect(await last()).toContain('steps  today 1,014 · week 1,014 · month 1,014 · year 1,014')
  expect(await last()).toContain('spend  today $20.75')
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
  expect(text).toContain('note the last request carried 60,000 tokens in and 7 out')
  expect(text).toContain('ok   cost: prompts $0.20 + earlier $0.00 + before tracking $4.00 = $4.20; Claude Code reports $4.20')
  expect(text).not.toContain('OFF')

  world.isOffBy = 1_500
  text = (await command($, 'audit')).text
  expect(text).toContain('OFF  context: the categories in use add up to 60,000; Claude Code reports 61,500 in use')
})

test('with no cost reported there is no cost bar and no month bar, and the ledger says so', async ($, on) => {
  engine(on)
  await begin($)
  const ui = await mount($, 120)
  const rows = await rowsOf(ui)
  expect(rows).toHaveLength(3)
  expect(rows.map(textOf).join('\n')).not.toContain('$')
  expect(textOf(rows[2]!)).toBe('steps  today 0 · week 0 · month 0 · year 0')
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
  expect(await ui.find({ type: 'Text', text: '30%' })).toBeDefined()
})
