// Penny Patrol: three meters above the prompt, and a mascot that walks them while the session works.
//
// THE CONTEXT BAR: the window as a stacked bar, one colour per category as /context breaks it down. What
// is in use comes first, then the free space, then the autocompact buffer at the window's end, so the
// free run is the room left before compaction.
//
// THE COST BAR: who spent this session's dollars. Claude Code reports ONE figure, the session's total.
// The ledger looks at it at every turn start, tool call and turn end, and books each rise to whoever was
// acting when it was seen: the main conversation's current prompt, or a subagent (whose spend belongs to
// the prompt that started it). So the entries always add up to the total, to the cent. What was spent
// before the ledger first looked is "before tracking": it cannot be itemised, so it is said, not drawn.
//
// THE LIMIT BARS: what is LEFT of each window the account reports (five hours, the week, a spend limit),
// draining as it is used. An account billed by the API has no such window; it gets the month's spend
// instead, draining a budget when one is set and growing when not.
//
// THE SCENE AND THE READOUT: the bars stand at the left, two free rows over each; every word is at the
// right, a line a row. The free rows are the mascot's: it stands on a bar, and while anything runs (a
// turn, or a background shell or subagent) it takes a step a second, along the first bar, down, back
// along the second, down, along the third, and then the whole way back. It takes the colour of the part
// of the bar under it, and its face says how things are there. Steps are kept by day, so they add up to
// the week (from Sunday), the month and the year, across every session on this machine.
//
// WHAT IS WHOSE: a session's ledger, days and choices are its own (sessions/, days/ under the folder
// below, one file a session, written by that session alone). The limits and the budget are the
// account's: the newest reading any session wrote is the one every session shows.
//
// The host reads on(...) and $.noun.method(...) from source, so they are spelled literally, and helpers
// that take $ are top-level functions.

import type {
  BoxProps,
  ContextCategoryKind,
  ElementConstructor,
  EngineInterface,
  ModelUsage,
  Register,
  RenderElement,
  SessionRateLimit,
  TextProps,
  TurnUsage,
} from 'claude-code'

// A "deferred" row is tool schemas loaded on demand: outside the window, so not in the bar.
type Kind = Exclude<ContextCategoryKind, 'deferred'>
type Segment = { name: string; tokens: number; color: string; kind: Kind }
type Reading = { segments: Segment[]; used: number; window: number; percent: number; model: string; last: ModelUsage | null }
type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number }
// One prompt's spend: the main conversation's while answering it, and each subagent's it started.
type Turn = { seq: number; label: string; main: number; tokens: Tokens; model: string | null; agents: Record<string, number> }
// What is known of a subagent: the prompt it belongs to, what it is, and what it used.
type AgentNote = { home: number; type: string; description: string; tokens: Tokens; model: string | null }
type Ledger = {
  seen: number
  untracked: number
  // Prompts older than the ones kept line by line: still counted, no longer itemised.
  folded: { usd: number; prompts: number }
  steps: number
  nextSeq: number
  turns: Turn[]
  agents: Record<string, AgentNote>
}
// Steps and dollars of one local day, by its date ("2026-10-04").
type Day = { steps: number; usd: number }
type Days = Record<string, Day>
type Limits = { at: number; windows: SessionRateLimit[] }
// The ledger in whole cents that add up to the reported total.
type Bill = {
  total: number
  before: number
  folded: number
  main: number
  agents: number
  rows: Array<{ turn: Turn; amount: number; ids: string[]; shares: number[] }>
}
// `isTight`: this part of a meter is nearly spent (the mascot's face shows it).
type Cell = { glyph: string; color: string | undefined; isDim: boolean; isTight: boolean }
type Part = { name: string; weight: number; glyph: string; color: string; isDim: boolean; isTight?: boolean }
// A limit bar, and what is said of it: at length, or `short` where that does not fit.
type Gauge = { name: string; parts: Part[]; label: string; short: string }
// A piece of text drawn one way, and a line of the readout: its label, then what it says.
type Run = { text: string; color?: string; isDim?: boolean }
type Line = { label: string; runs: Run[] }
// A legend's entry: a part's swatch and what is said of it. The lightest give way first.
type Chip = { glyph: string; color: string | undefined; isDim: boolean; text: string; weight: number }
// A bar of the scene with its lines: the one beside it, those that must stand in the rows right above
// it, and what it has to say in the `rows` rows under it.
type Section = { cells: Cell[]; beside: Line; above: Line[]; below: (rows: number) => Line[] }
type Box = ElementConstructor<BoxProps>
type Text = ElementConstructor<TextProps>

const COMMAND = 'penny-patrol'
const USAGE = `/${COMMAND} shows or hides the bars. /${COMMAND} costs prints the ledger, /${COMMAND} audit checks the figures, /${COMMAND} budget <dollars|off> sets the month's budget.`
const FOLDER = '.penny-patrol'
const MAX_TURNS = 200
const MIN_BAR = 10
const MID_TURN_MS = 10_000
const SAVE_EVERY_STEPS = 15
// How often a session looks at what the others wrote: the limits, then (less often) their days.
const SHARE_EVERY_TICKS = 5
const SCAN_EVERY_TICKS = 30
// A redraw a minute keeps the countdowns moving while nothing else does.
const REDRAW_EVERY_TICKS = 60
// Single-width block characters: they line up in every terminal font.
const GLYPH: Record<Kind, string> = { used: '█', free: '░', buffer: '▒' }
const ORDER: Kind[] = ['used', 'free', 'buffer']
const EMPTY: Cell = { glyph: '░', color: 'inactive', isDim: true, isTight: false }
// The scene takes this share of the band, the readout the rest (to TEXT_MAX cells), GAP between them.
// A line of the readout is a label of LABEL cells, then what it says.
const TRACK_SHARE = 0.4
const TEXT_MAX = 136
const GAP = 2
const LABEL = 9
// The least inner width the scene and its readout are drawn in; narrower, the bars alone.
const FULL_COLUMNS = 58
// The mascot, six cells by two rows; LANES rows over each bar are kept free for it. Its body is four
// cells of colour as BACKGROUND, with what is dark cut out of them by a glyph: its face in the upper row,
// the gaps between four legs in the lower. A background fills its cell whatever the terminal's line
// spacing, so the two rows join; block glyphs alone would leave a seam. Its arms are half blocks at its
// sides, and its inner legs step in and out as it walks.
//
// It takes the colour of the part of the bar under it (the cell under MASCOT_MIDDLE); over the empty
// stretch of a bar, and over the gap between two bars, it wears its own. Its face: asleep while nothing
// runs, happy while it walks, and strained wherever the meter under it is nearly spent (TIGHT_SHARE).
const MASCOT_COLOR = 'claude'
const MASCOT_CELLS = 6
const MASCOT_MIDDLE = 2
const ARM = '▄'
const FACE = { asleep: '-__-', happy: '^__^', strained: '>__<' }
const LEGS = ['▗▗▖▖', '▗▖▗▖']
// A meter is tight with less than this share left: of the room before compaction, of a limit's window,
// of the month's budget. (For the limits that is where their bar turns red.)
const TIGHT_SHARE = 0.2
const LANES = 2
// Background work that keeps the session running after its turn ended.
const RUNNING_KINDS = new Set(['shell', 'subagent', 'workflow'])
const WINDOW_NAME: Record<string, string> = { five_hour: '5h', seven_day: 'week', spend_limit: 'spend' }

// Where the files are kept ('' while the home folder is unknown: then nothing is saved), and this
// session's id, the name of its own files.
let folder = ''
let tag = ''
let startedAt = 0
let reading: Reading | null = null
let isHidden = false
let midTurnReadAt = 0
// Known only once a tool call of this session has reported it.
let effort: string | null = null
let ledger: Ledger | null = null
let days: Days = {}
// The other sessions' days, by their file, as last read.
const others = new Map<string, { mtimeMs: number; days: Days }>()
let limits: Limits | null = null
let budget: number | null = null
// The time as last read from the host, moved on by the tick between reads.
let nowMs = 0
// What makes the mascot walk, and how many steps it has taken since this loaded.
let isMainWorking = false
let background = 0
let ticks = 0
let strides = 0
let unsavedSteps = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the context, cost and limit bars; costs, audit and budget do more',
      argumentHint: '[costs | audit | budget <dollars|off>]',
      immediate: true,
    })
    nowMs = await $.clock.now()
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    folder = home === undefined || home === '' ? '' : `${home}/${FOLDER}`
    await book($, null)
    await catchUp($, true)
    // Subagents already running when this loads (a reload mid-work) are background work too.
    background = (await $.agent.list()).filter(agent => ['pending', 'running', 'waiting'].includes(agent.status)).length

    if (!isHidden) {
      await takeReading($)
    }

    $.clock.every(1000, () => tick($))

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    if (e.changed.includes('rateLimits')) {
      await noteLimits($, e.rateLimits)
    }

    if (!isHidden && e.changed.includes('context')) {
      await takeReading($)
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    // What rose since the last look belongs to the prompt before this one.
    await book($, null)

    if (ledger) {
      ledger.turns.push({ seq: ledger.nextSeq, label: labelOf(e.text), main: 0, tokens: noTokens(), model: null, agents: {} })
      ledger.nextSeq += 1
    }

    isMainWorking = true
    // Its end says what is still running; until then nothing is assumed to be.
    background = 0

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await book($, e.agentId ?? null)

    if (e.agentId === undefined) {
      isMainWorking = false
      const turn = ledger?.turns.at(-1)

      if (turn && e.usage) {
        addUsage(turn.tokens, e.usage)
        turn.model = e.usage.model
      }
    } else if (ledger) {
      const note = noteFor(ledger, e.agentId)

      if (e.usage) {
        addUsage(note.tokens, e.usage)
        note.model = e.usage.model
      }

      if (note.type === '') {
        const agent = (await $.agent.list()).find(candidate => candidate.id === e.agentId)
        note.type = agent?.type ?? 'subagent'
        note.description = agent?.description ?? ''
      }
    }

    await save($)
    $.ui.invalidate('ui.render')

    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    await book($, e.agentId ?? null)

    if (!isHidden && e.agentId === undefined) {
      nowMs = await $.clock.now()

      if (reading === null || nowMs - midTurnReadAt >= MID_TURN_MS) {
        midTurnReadAt = nowMs
        await takeReading($)
      }
    }

    return result
  })

  on('classic.PostToolUse', ($, e, next) => {
    const level = e.effort?.level

    if (e.agent_id === undefined && level !== undefined && level !== effort) {
      effort = level
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('classic.Stop', ($, e, next) => {
    background = stillRunning(e.background_tasks)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    background = stillRunning(e.background_tasks)
    await save($)
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('session.end', ($, e, next) => {
    if (e.reason === 'clear') {
      reading = null
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const [verb = '', value = ''] = e.args.trim().split(/\s+/)

    if (verb === 'costs') {
      await book($, null)

      return { text: ledger ? statement(ledger) : 'No cost is reported for this session.' }
    }

    if (verb === 'audit') {
      await book($, null)
      await takeReading($)

      return { text: audit() }
    }

    if (verb === 'budget') {
      const dollarsAsked = Number(value.replace(/[$,]/g, ''))

      if (value !== 'off' && !(dollarsAsked > 0)) {
        return { text: `The month's budget is ${budget === null ? 'not set' : dollars(budget)}. Set it with /${COMMAND} budget 8000, clear it with /${COMMAND} budget off.` }
      }

      budget = value === 'off' ? null : dollarsAsked
      await keep($, 'settings.json', { budget })
      $.ui.invalidate('ui.render')

      return { text: budget === null ? 'Budget cleared.' : `Budget set: ${dollars(budget)} a month, counted from what this machine's sessions spend.` }
    }

    if (verb !== '') {
      return { text: USAGE }
    }

    isHidden = !isHidden
    await save($)

    if (isHidden) {
      $.ui.invalidate('ui.render')
    } else {
      await takeReading($)
    }

    return { text: isHidden ? 'Penny Patrol hidden.' : 'Penny Patrol shown.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (isHidden || reading === null || e.props.hasSurvey) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)

    return band(Box, Text, reading, e.props.bodyColumns, e.props.maxRows)
  })
}

// Every second: the clock moves, the others' files are looked at now and then, and while anything runs
// the mascot takes a step. Its place follows from the count alone (see spotOf).
function tick($: EngineInterface): void {
  ticks += 1
  nowMs += 1000

  if (ticks % SHARE_EVERY_TICKS === 0) {
    // A look that fails is made again five seconds on.
    void catchUp($, ticks % SCAN_EVERY_TICKS === 0).catch(() => undefined)
  }

  if (!isMainWorking && background === 0) {
    if (!isHidden && ticks % REDRAW_EVERY_TICKS === 0) {
      $.ui.invalidate('ui.render')
    }

    return
  }

  strides += 1
  unsavedSteps += 1
  dayOf(nowMs).steps += 1

  if (ledger) {
    ledger.steps += 1
  }

  if (!isHidden) {
    $.ui.invalidate('ui.render')
  }

  if (unsavedSteps >= SAVE_EVERY_STEPS) {
    // A save that fails is tried again after the next steps; what is in memory is what counts.
    void save($).catch(() => undefined)
  }
}

// "summary" estimates the categories locally, so a reading sends no request.
async function takeReading($: EngineInterface): Promise<void> {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const breakdown = context.breakdown

  if (!breakdown) {
    return
  }

  const segments = breakdown.categories.flatMap(row =>
    row.kind === 'deferred' || row.tokens <= 0
      ? []
      : [{ name: row.name, tokens: row.tokens, color: row.color, kind: row.kind }],
  )
  reading = {
    segments: ORDER.flatMap(kind => segments.filter(segment => segment.kind === kind)),
    used: breakdown.totalTokens,
    window: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
    model: breakdown.model,
    last: breakdown.apiUsage,
  }
  $.ui.invalidate('ui.render')
}

// Reads the session's total and books whatever it rose by since the last look to `agentId` (a subagent)
// or, with none, to the main conversation's current prompt. The plain usage call costs nothing.
async function book($: EngineInterface, agentId: string | null): Promise<void> {
  const usage = await $.session.usage()

  if (usage.startedAt !== startedAt) {
    // The first look at this session, or at the new one /clear began: its own files, if it has any.
    if (startedAt !== 0) {
      await save($)
    }

    startedAt = usage.startedAt
    tag = (await $.session.id()).replace(/[^A-Za-z0-9_-]/g, '_')
    const mine = (await load($, `sessions/${tag}.json`)) as { ledger?: unknown; effort?: unknown; isHidden?: unknown } | undefined
    ledger = isLedger(mine?.ledger) ? mine.ledger : null
    effort = typeof mine?.effort === 'string' ? mine.effort : null
    isHidden = mine?.isHidden === true
    const saved = await load($, `days/${tag}.json`)
    days = isDays(saved) ? saved : {}
  }

  if (usage.rateLimits.length > 0) {
    await noteLimits($, usage.rateLimits)
  }

  const cost = usage.cost

  if (!cost) {
    return
  }

  if (ledger === null || cost.usd < ledger.seen - 0.005) {
    // The first look at this count: nothing spent so far can be itemised.
    ledger = { seen: cost.usd, untracked: cost.usd, folded: { usd: 0, prompts: 0 }, steps: 0, nextSeq: 1, turns: [], agents: {} }
  }

  const rise = cost.usd - ledger.seen

  if (rise <= 0) {
    return
  }

  ledger.seen = cost.usd
  dayOf(nowMs).usd += rise
  let current = ledger.turns.at(-1)

  if (!current) {
    current = { seq: 0, label: '(before the first prompt seen)', main: 0, tokens: noTokens(), model: null, agents: {} }
    ledger.turns.push(current)
  }

  if (agentId === null) {
    current.main += rise
  } else {
    const home = noteFor(ledger, agentId).home
    const turn = ledger.turns.find(candidate => candidate.seq === home) ?? current
    turn.agents[agentId] = (turn.agents[agentId] ?? 0) + rise
  }

  // The oldest prompts fold into one figure so the saved ledger stays small.
  while (ledger.turns.length > MAX_TURNS) {
    const old = ledger.turns.shift()

    if (old) {
      ledger.folded.usd += spendOf(old)
      ledger.folded.prompts += 1

      for (const id of Object.keys(old.agents)) {
        delete ledger.agents[id]
      }
    }
  }

  $.ui.invalidate('ui.render')
}

// The account's windows as a response just reported them: kept, and written for the other sessions.
async function noteLimits($: EngineInterface, windows: readonly SessionRateLimit[]): Promise<void> {
  if (limits !== null && JSON.stringify(limits.windows) === JSON.stringify(windows)) {
    return
  }

  // Stamped with the host's time, not the tick's: the newest stamp is the reading every session shows.
  nowMs = await $.clock.now()
  limits = { at: nowMs, windows: [...windows] }
  await keep($, 'limits.json', limits)
  $.ui.invalidate('ui.render')
}

// What the other sessions wrote: the newest limits and the budget and, when `isScan`, their days (only
// the files that changed since they were last read).
async function catchUp($: EngineInterface, isScan: boolean): Promise<void> {
  if (folder === '') {
    return
  }

  nowMs = await $.clock.now()
  const before = JSON.stringify([limits, budget])
  const seen = await load($, 'limits.json')

  if (isLimits(seen) && (limits === null || seen.at > limits.at)) {
    limits = seen
  }

  let isChanged = false

  if (isScan) {
    const settings = (await load($, 'settings.json')) as { budget?: unknown } | undefined
    budget = typeof settings?.budget === 'number' && settings.budget > 0 ? settings.budget : null
    const entries = await $.fs.list(`${folder}/days`).catch(() => [])

    for (const entry of entries) {
      if (entry.kind !== 'file' || entry.name === `${tag}.json` || others.get(entry.name)?.mtimeMs === entry.mtimeMs) {
        continue
      }

      const theirs = await load($, `days/${entry.name}`)

      if (isDays(theirs)) {
        others.set(entry.name, { mtimeMs: entry.mtimeMs, days: theirs })
        isChanged = true
      }
    }
  }

  if (isChanged || before !== JSON.stringify([limits, budget])) {
    $.ui.invalidate('ui.render')
  }
}

// This session's own two files.
async function save($: EngineInterface): Promise<void> {
  unsavedSteps = 0

  if (tag === '') {
    return
  }

  await keep($, `sessions/${tag}.json`, { ledger, effort, isHidden })
  await keep($, `days/${tag}.json`, days)
}

// A file of the folder, parsed; undefined when it is missing, unreadable or not JSON.
async function load($: EngineInterface, name: string): Promise<unknown> {
  if (folder === '') {
    return undefined
  }

  try {
    return JSON.parse(await $.fs.read(`${folder}/${name}`)) as unknown
  } catch {
    return undefined
  }
}

async function keep($: EngineInterface, name: string, value: unknown): Promise<void> {
  if (folder !== '') {
    await $.fs.write(`${folder}/${name}`, JSON.stringify(value))
  }
}

// A subagent's note, opened in the prompt that is current when it is first seen.
function noteFor(money: Ledger, agentId: string): AgentNote {
  const known = money.agents[agentId]

  if (known) {
    return known
  }

  const note = { home: money.turns.at(-1)?.seq ?? 0, type: '', description: '', tokens: noTokens(), model: null }
  money.agents[agentId] = note

  return note
}

function stillRunning(tasks: ReadonlyArray<{ type: string }> | undefined): number {
  return (tasks ?? []).filter(task => RUNNING_KINDS.has(task.type)).length
}

function labelOf(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()

  if (line === '') {
    return '(continued without a prompt)'
  }

  return line.startsWith('<task-notification') ? '(a background task reported back)' : line.slice(0, 60)
}

// The day `at` falls on, in this session's days.
function dayOf(at: number): Day {
  const key = dateOf(new Date(at))
  const day = days[key] ?? { steps: 0, usd: 0 }
  days[key] = day

  return day
}

function dateOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Steps and dollars since the start of today, of the week (Sunday), of the month and of the year, over
// every session's days on this machine.
function calendar(at: number): Record<'today' | 'week' | 'month' | 'year', Day> {
  const now = new Date(at)
  const today = dateOf(now)
  const from = {
    today,
    week: dateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())),
    month: `${today.slice(0, 7)}-01`,
    year: `${today.slice(0, 4)}-01-01`,
  }
  const sums = { today: { steps: 0, usd: 0 }, week: { steps: 0, usd: 0 }, month: { steps: 0, usd: 0 }, year: { steps: 0, usd: 0 } }

  for (const theirs of [days, ...[...others.values()].map(other => other.days)]) {
    for (const [date, day] of Object.entries(theirs)) {
      for (const span of ['today', 'week', 'month', 'year'] as const) {
        // Dates written year first compare as text.
        if (date >= from[span] && date <= today) {
          sums[span].steps += day.steps
          sums[span].usd += day.usd
        }
      }
    }
  }

  return sums
}

function band(Box: Box, Text: Text, now: Reading, columns: number, maxRows: number): RenderElement {
  // paddingX takes two cells.
  const inner = Math.max(1, columns - 2)
  const money = ledger !== null && ledger.seen > 0 ? ledger : null
  const bill = money ? billOf(money) : null
  const totals = calendar(nowMs)
  const gauges = gaugesOf(totals.month.usd, money !== null)
  const free = now.segments.reduce((sum, segment) => sum + (segment.kind === 'free' ? segment.tokens : 0), 0)
  // The room before compaction is what is in use and what is free; the buffer is not room.
  const isTight = free < (now.used + free) * TIGHT_SHARE
  const context = now.segments.map(segment => ({ ...partOf(segment), isTight }))
  const contextFacts = [`${now.percent}%`, `${short(now.used)} / ${short(now.window)}`, free > 0 ? `${short(free)} free` : '']
  const spend = bill ? spendParts(bill) : []
  const costFacts = money && bill ? [money$(bill.total), promptOf(money, bill)] : []

  if (inner >= FULL_COLUMNS) {
    const room = Math.min(TEXT_MAX, inner - GAP - Math.floor(inner * TRACK_SHARE))
    const track = inner - GAP - room
    // What a line may say after its label.
    const width = room - LABEL
    const sections: Section[] = [{
      cells: cellsOf(context, track),
      beside: lineOf('context', contextFacts, width, false),
      above: [],
      below: rows => {
        // The free run needs no entry: the line beside the bar says what is free. The buffer's is said
        // only where there is room for it.
        const chips = (kind: Kind): Chip[] =>
          now.segments.filter(segment => segment.kind === kind).map(segment => chipOf(partOf(segment), short(segment.tokens)))
        const sent = lineOf('', sentOf(now.last), width, true)
        // A legend that fits on one line leaves the other to the last request.
        const tight = sent.runs.length > 0 && rows > 1
          ? wrapped([...chips('used'), ...chips('buffer')], width, rows - 1) ?? wrapped(chips('used'), width, rows - 1)
          : null

        return tight
          ? [...tight.map(runs => ({ label: '', runs })), sent]
          : legendOf(chips('used'), chips('buffer'), width, rows).map(runs => ({ label: '', runs }))
      },
    }]

    if (money && bill) {
      const before: Chip[] = bill.before > 0
        ? [{ glyph: '', color: undefined, isDim: true, text: `before tracking ${money$(bill.before)}`, weight: bill.before }]
        : []
      sections.push({
        cells: cellsOf(spend, track),
        beside: lineOf('cost', costFacts, width, false),
        above: [],
        below: rows => legendOf(spend.map(part => chipOf(part, money$(part.weight))), before, width, rows).map(runs => ({ label: '', runs })),
      })
    }

    if (gauges.length > 0) {
      // Two gauges have a line each: the first right above the bars, the second beside them. One alone
      // is beside its bar; from the third on they share the second's line.
      const first = gauges.length > 1 ? gauges[0] : undefined
      const rest = first ? gauges.slice(1) : gauges
      const beside: Line = { label: rest[0]?.name ?? '', runs: [] }
      let taken = 0

      for (const gauge of rest) {
        const lead = beside.runs.length === 0 ? '' : `   ${gauge.name} `
        const text = [gauge.label, gauge.short].find(candidate => taken + lead.length + candidate.length <= width)

        if (text === undefined) {
          break
        }

        beside.runs.push(...(lead === '' ? [] : [{ text: lead, isDim: true }]), { text })
        taken += lead.length + text.length
      }

      sections.push({
        cells: stripOf(gauges, track),
        beside,
        above: first ? [{ label: first.name, runs: [{ text: [first.label, first.short].find(candidate => candidate.length <= width) ?? '' }] }] : [],
        below: () => [],
      })
    }

    const header = [
      lineOf('model', [now.model, effort === null ? '' : `${effort} effort`], width, true),
      lineOf('steps', (['today', 'week', 'month', 'year'] as const).map(period => `${period} ${count(totals[period].steps)}`), width, true),
    ]
    const rows = scene(Box, Text, sections, header, track)

    if (rows.length <= maxRows) {
      return Box({ flexDirection: 'column', paddingX: 1, children: rows })
    }
  }

  const bars = [{ parts: context, facts: contextFacts }, ...(money ? [{ parts: spend, facts: costFacts }] : [])]

  return Box({ flexDirection: 'column', paddingX: 1, children: compact(Box, Text, inner, bars, gauges) })
}

// The scene and its readout, row by row: over each bar its two free rows, the mascot in them when it is
// on that bar; at the right of every row, a line. The lines beside the free rows are what the bar above
// still has to say (the model and the steps, over the first), then what must stand right above this one.
function scene(Box: Box, Text: Text, sections: Section[], header: Line[], track: number): RenderElement[] {
  const span = track - MASCOT_CELLS
  const spot = spotOf(strides, sections.length, span)
  const isWalking = isMainWorking || background > 0
  const blank = (cells: number): RenderElement[] => (cells > 0 ? [Text({ children: ' '.repeat(cells) })] : [])
  const rows: RenderElement[] = []
  let waiting = header

  sections.forEach((section, i) => {
    const open = LANES - section.above.length
    const lines = [...Array.from({ length: open }, (_, slot) => waiting[slot]), ...section.above]

    lines.forEach((line, lane) => {
      const left = spot.bar === i
        ? [...blank(spot.at), ...mascotRow(Text, section.cells[spot.at + MASCOT_MIDDLE], lane, isWalking), ...blank(span - spot.at + GAP)]
        : blank(track + GAP)
      rows.push(Box({ flexDirection: 'row', children: [...left, ...(line ? written(Text, line) : [])] }))
    })

    rows.push(Box({ flexDirection: 'row', children: [...runsOf(Text, section.cells), ...blank(GAP), ...written(Text, section.beside)] }))
    const next = sections[i + 1]
    waiting = section.below(next ? LANES - next.above.length : LANES)
  })

  // What the last bar has to say goes under it.
  for (const line of waiting) {
    rows.push(Box({ flexDirection: 'row', children: [...blank(track + GAP), ...written(Text, line)] }))
  }

  return rows
}

// One row of the mascot (0 its face between its arms, 1 its legs), over the cell `under` its middle.
function mascotRow(Text: Text, under: Cell | undefined, row: number, isWalking: boolean): RenderElement[] {
  // A dim cell is the empty stretch of a bar, and a cell with no colour a gap: neither is a part.
  const color = under && under.color !== undefined && !under.isDim ? under.color : MASCOT_COLOR

  if (row === 0) {
    const face = under?.isTight === true ? FACE.strained : isWalking ? FACE.happy : FACE.asleep

    return [Text({ color, children: ARM }), Text({ color, inverse: true, children: face }), Text({ color, children: ARM })]
  }

  return [Text({ children: ' ' }), Text({ color, inverse: true, children: LEGS[isWalking ? strides % 2 : 0] ?? '' }), Text({ children: ' ' })]
}

// Too little room for the scene: the bars alone, each with its figures, and no mascot. A label gives way
// before its bar does, last part first; then the labels take the widest one's width, so the bars are one
// length. The limit bars share a row: each a name, its bar and what is left.
function compact(Box: Box, Text: Text, inner: number, bars: Array<{ parts: Part[]; facts: string[] }>, gauges: Gauge[]): RenderElement[] {
  const aside = (text: string): string => (text === '' ? '' : `${' '.repeat(GAP)}${text}`)
  const labels = bars.map(bar => aside(fit(bar.facts, inner - MIN_BAR - GAP)))
  const labelWidth = Math.max(0, ...labels.map(label => label.length))
  const rows = bars.map((bar, i) =>
    Box({
      flexDirection: 'row',
      children: [
        ...runsOf(Text, cellsOf(bar.parts, inner - labelWidth)),
        ...(labelWidth > 0 ? [Text({ dimColor: true, children: (labels[i] ?? '').padStart(labelWidth) })] : []),
      ],
    }),
  )

  if (gauges.length > 0) {
    const each = Math.floor((inner - (gauges.length - 1) * GAP) / gauges.length)
    rows.push(Box({
      flexDirection: 'row',
      columnGap: GAP,
      children: gauges.map(gauge => {
        const name = `${gauge.name} `
        const label = [gauge.label, gauge.short].map(aside).find(text => each - name.length - text.length >= MIN_BAR) ?? ''

        return Box({
          flexDirection: 'row',
          children: [
            Text({ dimColor: true, children: name }),
            ...runsOf(Text, cellsOf(gauge.parts, Math.max(0, each - name.length - label.length))),
            ...(label === '' ? [] : [Text({ dimColor: true, children: label })]),
          ],
        })
      }),
    }))
  }

  return rows
}

// A bar's parts as cells, by share, each part keeping a cell while there is room. With nothing to show
// yet the bar is empty, not missing.
function cellsOf(parts: Part[], width: number): Cell[] {
  const counts = apportion(parts.map(part => part.weight), width, 1)
  const cells = parts.flatMap((part, i) =>
    Array.from({ length: counts[i] ?? 0 }, (): Cell => ({ glyph: part.glyph, color: part.color, isDim: part.isDim, isTight: part.isTight === true })),
  )

  while (cells.length < width) {
    cells.push(EMPTY)
  }

  return cells
}

// The limit bars on one row of the scene. One alone takes the row. Of several, the first stands before
// its name and the others after theirs, so the row begins and ends on a bar, as the rows over it do.
function stripOf(gauges: Gauge[], width: number): Cell[] {
  const worded = (text: string): Cell[] => [...text].map(glyph => ({ glyph, color: undefined, isDim: true, isTight: false }))
  const names = gauges.map((gauge, i) => (gauges.length === 1 ? '' : i === 0 ? ` ${gauge.name}` : `  ${gauge.name} `))
  const named = Math.floor((width - names.join('').length) / gauges.length)
  // Where the names leave the bars no room, the bars go without them, a cell apart.
  const each = named >= 2 ? named : Math.floor((width - (gauges.length - 1)) / gauges.length)
  const cells = gauges.flatMap((gauge, i) => {
    const bar = cellsOf(gauge.parts, Math.max(0, each))
    const name = worded(named >= 2 ? names[i] ?? '' : i === 0 ? '' : ' ')

    return i === 0 ? [...bar, ...name] : [...name, ...bar]
  })
  // What the division left over goes between the first bar and the rest.
  const first = Math.max(0, each) + (named >= 2 ? (names[0] ?? '').length : 0)
  cells.splice(first, 0, ...worded(' '.repeat(Math.max(0, width - cells.length))))

  return cells.slice(0, Math.max(0, width))
}

// Cells drawn alike, side by side, are one Text.
function runsOf(Text: Text, cells: Cell[]): RenderElement[] {
  const runs: RenderElement[] = []
  let start = 0

  for (let i = 1; i <= cells.length; i += 1) {
    const from = cells[start]
    const to = cells[i]

    if (from && (!to || to.color !== from.color || to.isDim !== from.isDim)) {
      const children = cells.slice(start, i).map(cell => cell.glyph).join('')
      runs.push(Text(from.color === undefined ? { dimColor: from.isDim, children } : { color: from.color, dimColor: from.isDim, children }))
      start = i
    }
  }

  return runs
}

// A line of the readout as drawn: its label, dim, in its column, then its runs. A line never wraps.
function written(Text: Text, line: Line): RenderElement[] {
  return [
    Text({ dimColor: true, children: line.label.slice(0, LABEL - 1).padEnd(LABEL) }),
    ...line.runs.filter(run => run.text !== '').map(run =>
      Text(run.color === undefined
        ? { dimColor: run.isDim === true, wrap: 'truncate-end', children: run.text }
        : { color: run.color, dimColor: run.isDim === true, wrap: 'truncate-end', children: run.text }),
    ),
  ]
}

// A line that says as many of `parts`, from the first, as fit in `width`.
function lineOf(label: string, parts: string[], width: number, isDim: boolean): Line {
  const text = fit(parts, width)

  return { label, runs: text === '' ? [] : [{ text, isDim }] }
}

function chipOf(part: Part, figure: string): Chip {
  return { glyph: part.glyph, color: part.color, isDim: part.isDim, text: `${part.name} ${figure}`, weight: part.weight }
}

// A legend on at most `rows` lines of `width`, its entries in the bar's order, with `extra` after them
// where there is room for all. When the entries themselves do not all fit, the lightest give way and the
// legend ends on how many did.
function legendOf(chips: Chip[], extra: Chip[], width: number, rows: number): Run[][] {
  let kept = chips
  let lines = wrapped([...chips, ...extra], width, rows) ?? wrapped(chips, width, rows)

  while (!lines && kept.length > 0) {
    const lightest = kept.reduce((least, chip) => (chip.weight < least.weight ? chip : least))
    kept = kept.filter(chip => chip !== lightest)
    const more: Chip = { glyph: '', color: undefined, isDim: true, text: `+${chips.length - kept.length}`, weight: 0 }
    // A count of what is not shown, alone, says nothing.
    lines = kept.length > 0 ? wrapped([...kept, more], width, rows) : []
  }

  return lines ?? []
}

// Entries laid out in order on lines of `width`, GAP apart; null when they need more than `rows` lines.
function wrapped(chips: Chip[], width: number, rows: number): Run[][] | null {
  const lines: Run[][] = []
  let taken = 0

  for (const chip of chips) {
    const size = (chip.glyph === '' ? 0 : chip.glyph.length + 1) + chip.text.length
    let line = lines.at(-1)

    if (!line || taken + GAP + size > width) {
      line = []
      lines.push(line)
      taken = 0
    } else {
      line.push({ text: ' '.repeat(GAP) })
      taken += GAP
    }

    if (lines.length > rows || size > width) {
      return null
    }

    if (chip.glyph !== '') {
      line.push({ text: chip.glyph, isDim: chip.isDim, ...(chip.color === undefined ? {} : { color: chip.color }) }, { text: ' ' })
    }

    line.push({ text: chip.text, isDim: true })
    taken += size
  }

  return lines
}

// What the last request carried, as the API counted it: everything sent in (and how much of it was read
// from the prompt cache), and what came out.
function sentOf(last: ModelUsage | null): string[] {
  if (!last) {
    return []
  }

  const sent = last.input_tokens + last.cache_read_input_tokens + last.cache_creation_input_tokens

  return [`last request: in ${short(sent)} (${short(last.cache_read_input_tokens)} cached)`, `out ${short(last.output_tokens)}`]
}

// What the current prompt has cost so far, in the cents the ledger gives it.
function promptOf(money: Ledger, bill: Bill): string {
  const last = money.turns.at(-1)

  return last ? `this prompt ${money$(bill.rows.find(row => row.turn === last)?.amount ?? 0)}` : ''
}

// One category, in the theme colour /context draws it in.
function partOf(segment: Segment): Part {
  return { name: segment.name, weight: segment.tokens, glyph: GLYPH[segment.kind], color: segment.color, isDim: segment.kind === 'free' }
}

// The limit bars. A window the account reports is shown by what is LEFT of it, draining. With no window
// (an account billed by the API) the month's spend stands in: draining the budget when one is set, and
// growing against the next round figure when none is. A set budget shows beside the windows too.
function gaugesOf(monthSpend: number, hasMoney: boolean): Gauge[] {
  const gauges = (limits?.windows ?? []).map((window): Gauge => {
    const left = Math.max(0, Math.min(100, 100 - window.percentUsed))
    const until = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt) - nowMs
    const reset = Number.isNaN(until) ? '' : until > 0 ? ` · resets in ${span(until / 1000)}` : ' · reset due'

    return {
      name: WINDOW_NAME[window.kind] ?? window.kind,
      parts: drain(left, 100 - left),
      label: `${Math.round(left)}% left${reset}`,
      short: `${Math.round(left)}% left`,
    }
  })

  if (budget !== null) {
    const left = Math.max(0, budget - monthSpend)
    gauges.push({
      name: 'month',
      parts: drain(left, budget - left),
      label: `${dollars(left)} left of ${dollars(budget)}`,
      short: `${dollars(left)} left`,
    })
  } else if (gauges.length === 0 && hasMoney) {
    // No ceiling is known: the bar fills toward the next round figure, then starts on the one after.
    const ceiling = roundAbove(monthSpend)
    gauges.push({
      name: 'month',
      parts: [
        { name: 'spent', weight: monthSpend, glyph: '█', color: 'permission', isDim: false },
        { name: 'room', weight: ceiling - monthSpend, glyph: '░', color: 'inactive', isDim: true },
      ].filter(part => part.weight > 0),
      label: `${dollars(monthSpend)} spent · bar full at ${dollars(ceiling)}`,
      short: `${dollars(monthSpend)} spent`,
    })
  }

  return gauges
}

// What is left, then what is gone: green while more than half is left, amber to a fifth, red below.
function drain(left: number, gone: number): Part[] {
  const portion = left + gone > 0 ? left / (left + gone) : 0
  const isTight = portion <= TIGHT_SHARE
  const color = portion > 0.5 ? 'success' : isTight ? 'error' : 'warning'

  return [
    { name: 'left', weight: left, glyph: '█', color, isDim: false, isTight },
    { name: 'gone', weight: gone, glyph: '░', color: 'inactive', isDim: true, isTight },
  ].filter(part => part.weight > 0)
}

// The next figure of the series 1, 2, 5, 10, 20, 50 ... above `amount`.
function roundAbove(amount: number): number {
  let ceiling = 1

  for (let i = 0; ceiling <= amount; i += 1) {
    ceiling *= i % 3 === 1 ? 2.5 : 2
  }

  return ceiling
}

// Each prompt in whole cents, split between the main conversation and its subagents, with what was
// folded and what was spent before tracking: all adding up to the reported total, so no view of the
// ledger is a cent apart from another.
function billOf(money: Ledger): Bill {
  const spent = money.turns.filter(turn => spendOf(turn) > 0)
  const total = Math.round(money.seen * 100)
  const amounts = apportion([...spent.map(spendOf), money.folded.usd, money.untracked], total, 0)
  const rows = spent.map((turn, i) => {
    const ids = Object.keys(turn.agents)
    const amount = amounts[i] ?? 0

    return { turn, amount, ids, shares: apportion([turn.main, ...ids.map(id => turn.agents[id] ?? 0)], amount, 0) }
  })
  const before = amounts.at(-1) ?? 0
  const folded = amounts.at(-2) ?? 0
  const main = rows.reduce((sum, row) => sum + (row.shares[0] ?? 0), 0)

  return { total, before, folded, main, agents: total - before - folded - main, rows }
}

// Who spent what the ledger saw being spent. (The mascot's colour is left to the mascot.)
function spendParts(bill: Bill): Part[] {
  return [
    { name: 'Main', weight: bill.main, glyph: '█', color: 'permission', isDim: false },
    { name: 'Subagents', weight: bill.agents, glyph: '█', color: 'cyan_FOR_SUBAGENTS_ONLY', isDim: false },
    { name: 'Earlier prompts', weight: bill.folded, glyph: '▒', color: 'inactive', isDim: false },
  ].filter(part => part.weight > 0)
}

// The ledger as text: the session's total reconciled to the cent, then every prompt and what it used.
function statement(money: Ledger): string {
  const bill = billOf(money)
  const itemised = bill.total - bill.before - bill.folded
  const lines = bill.rows.flatMap((row, i) => [
    `${String(i + 1).padStart(3)}. ${money$(row.amount).padStart(9)}  ${row.turn.label}`,
    `${' '.repeat(16)}main ${money$(row.shares[0] ?? 0)}${usedBy(row.turn.tokens, row.turn.model)}`,
    ...row.ids.map((id, j) => {
      const note = money.agents[id]
      const what = note && note.description !== '' ? ` "${note.description.slice(0, 50)}"` : ''

      return `${' '.repeat(16)}${note?.type || 'subagent'}${what} ${money$(row.shares[j + 1] ?? 0)}${note ? usedBy(note.tokens, note.model) : ''}`
    }),
  ])
  const most = Math.max(0, ...bill.rows.map(row => row.amount))
  const rate = money.steps > 0 && itemised > 0 ? ` · ${dollars(itemised / 100 / (money.steps / 3600))}/h while working` : ''
  const prompts = bill.rows.length
  const totals = calendar(nowMs)

  return [
    `Session total reported by Claude Code: ${money$(bill.total)}`,
    `  itemised below:   ${money$(itemised)}`,
    ...(money.folded.prompts > 0 ? [`  earlier prompts:  ${money$(bill.folded)}  (${count(money.folded.prompts)} prompts older than the ${MAX_TURNS} kept line by line)`] : []),
    `  before tracking:  ${money$(bill.before)}  (spent before this ledger first looked; cannot be itemised)`,
    `  unaccounted:      ${money$(bill.total - bill.before - bill.folded - bill.rows.reduce((sum, row) => sum + row.amount, 0))}`,
    `  working time:     ${stepsOf(money.steps)} (${span(money.steps)})${rate}`,
    `  prompts:          ${prompts}${prompts > 0 ? ` · average ${money$(Math.round(itemised / prompts))} · most expensive ${money$(most)}` : ''}`,
    `  this machine:     today ${dollars(totals.today.usd)} · week ${dollars(totals.week.usd)} · month ${dollars(totals.month.usd)} · year ${dollars(totals.year.usd)}`,
    '',
    ...lines,
  ].join('\n')
}

// The figures checked against each other: what must agree, and whether it does.
function audit(): string {
  const lines: string[] = []
  const check = (isRight: boolean, what: string): void => {
    lines.push(`${isRight ? 'ok  ' : 'OFF '} ${what}`)
  }

  if (reading) {
    const inUse = reading.segments.filter(segment => segment.kind === 'used').reduce((sum, segment) => sum + segment.tokens, 0)
    const all = reading.segments.reduce((sum, segment) => sum + segment.tokens, 0)
    check(inUse === reading.used, `context: the categories in use add up to ${count(inUse)}; Claude Code reports ${count(reading.used)} in use`)
    // These two are Claude Code's own rounding, so a hair's difference is not a fault of the bar's.
    check(Math.abs(all - reading.window) <= reading.window / 1000, `context: in use, free and buffer add up to ${count(all)}; the window is ${count(reading.window)}`)
    const filled = (reading.used / reading.window) * 100
    check([Math.floor(filled), Math.round(filled)].includes(reading.percent), `context: ${count(reading.used)} of ${count(reading.window)} is ${reading.percent}%`)

    if (reading.last) {
      const sent = reading.last.input_tokens + reading.last.cache_read_input_tokens + reading.last.cache_creation_input_tokens
      lines.push(`note the last request sent ${count(sent)} tokens in (${count(reading.last.input_tokens)} new, ${count(reading.last.cache_read_input_tokens)} read from the cache, ${count(reading.last.cache_creation_input_tokens)} written to it) and got ${count(reading.last.output_tokens)} out; the bar's total is Claude Code's estimate for the next one`)
    }
  } else {
    lines.push('note no reading of the context window yet')
  }

  if (ledger) {
    const bill = billOf(ledger)
    const listed = bill.rows.reduce((sum, row) => sum + row.amount, 0)
    check(listed + bill.folded + bill.before === bill.total, `cost: prompts ${money$(listed)} + earlier ${money$(bill.folded)} + before tracking ${money$(bill.before)} = ${money$(listed + bill.folded + bill.before)}; Claude Code reports ${money$(bill.total)}`)
    check(bill.main + bill.agents === listed, `cost: main ${money$(bill.main)} + subagents ${money$(bill.agents)} = the prompts' ${money$(listed)}`)
    const walked = Object.values(days).reduce((sum, day) => sum + day.steps, 0)
    check(walked >= ledger.steps, `steps: this session's days hold ${count(walked)}; its ledger counts ${count(ledger.steps)}`)
  } else {
    lines.push('note no cost is reported for this session')
  }

  lines.push(limits ? `note limits as read ${span(Math.max(0, nowMs - limits.at) / 1000)} ago by a session on this machine` : 'note no limit window is reported for this account')

  return lines.join('\n')
}

// What a turn or a subagent used, as the API reported it: the justification for its spend.
function usedBy(tokens: Tokens, model: string | null): string {
  const read = tokens.input + tokens.cacheRead + tokens.cacheWrite

  if (read + tokens.output === 0) {
    return ''
  }

  const cached = read > 0 ? ` (${Math.round((tokens.cacheRead / read) * 100)}% of input from cache)` : ''

  return ` · ${model ?? 'model unknown'} · in ${short(tokens.input)}, out ${short(tokens.output)}, cache read ${short(tokens.cacheRead)}, cache write ${short(tokens.cacheWrite)}${cached}`
}

// The longest run of `parts`, from the first, that fits in `room`.
function fit(parts: string[], room: number): string {
  const kept = parts.filter(part => part !== '')

  for (let size = kept.length; size > 0; size -= 1) {
    const text = kept.slice(0, size).join(' · ')

    if (text.length <= room) {
      return text
    }
  }

  return ''
}

// Where the mascot stands after `steps` steps: which bar, and how far along it. It walks the first bar
// left to right, steps down, walks the second right to left, and so on; from the end of the last it
// walks the whole way back. A cell or a row a step.
function spotOf(steps: number, bars: number, span: number): { bar: number; at: number } {
  const stops = Math.max(0, span) + 1
  const index = placeOf(steps, bars * stops - 1)
  const bar = Math.floor(index / stops)
  const along = index % stops

  return { bar, at: bar % 2 === 0 ? along : stops - 1 - along }
}

// Where `steps` steps lead on a track of `track` cells walked out and back, a cell a step.
function placeOf(steps: number, track: number): number {
  if (track <= 0) {
    return 0
  }

  const along = steps % (track * 2)

  return along <= track ? along : track * 2 - along
}

// Whole units for each weight, adding up to `total`: `least` for each while there is room (a bar keeps a
// small part visible), then by share, the largest remainders taking what rounding left over.
function apportion(weights: number[], total: number, least: 0 | 1): number[] {
  const sum = weights.reduce((all, weight) => all + weight, 0)

  if (sum <= 0 || total <= 0) {
    return weights.map(() => 0)
  }

  const base = total >= weights.length ? least : 0
  const spare = total - base * weights.length
  const shares = weights.map(weight => (weight / sum) * spare)
  const units = shares.map(share => base + Math.floor(share))
  let left = total - units.reduce((all, unit) => all + unit, 0)
  const byRemainder = shares
    .map((share, i) => ({ remainder: share - Math.floor(share), i }))
    .sort((a, b) => b.remainder - a.remainder)

  for (const { i } of byRemainder) {
    if (left === 0) {
      break
    }

    units[i] = (units[i] ?? 0) + 1
    left -= 1
  }

  return units
}

function spendOf(turn: Turn): number {
  return Object.values(turn.agents).reduce((sum, usd) => sum + usd, turn.main)
}

function noTokens(): Tokens {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function addUsage(tokens: Tokens, usage: TurnUsage): void {
  tokens.input += usage.input_tokens
  tokens.output += usage.output_tokens
  tokens.cacheRead += usage.cache_read_input_tokens
  tokens.cacheWrite += usage.cache_creation_input_tokens
}

function isLedger(value: unknown): value is Ledger {
  const v = value as Partial<Ledger> | null | undefined

  return typeof v === 'object' && v !== null
    && typeof v.seen === 'number' && typeof v.untracked === 'number' && typeof v.steps === 'number'
    && typeof v.nextSeq === 'number' && Array.isArray(v.turns) && typeof v.agents === 'object' && v.agents !== null
    && typeof v.folded === 'object' && v.folded !== null
}

function isDays(value: unknown): value is Days {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(day => typeof (day as Day | null)?.steps === 'number' && typeof (day as Day).usd === 'number')
}

function isLimits(value: unknown): value is Limits {
  const v = value as Partial<Limits> | null | undefined

  return typeof v === 'object' && v !== null && typeof v.at === 'number' && Array.isArray(v.windows)
}

// 1234.5 -> "$1,234.50".
function dollars(usd: number): string {
  return money$(Math.round(usd * 100))
}

function money$(cents: number): string {
  const [whole = '0', part = '00'] = (Math.abs(cents) / 100).toFixed(2).split('.')

  return `${cents < 0 ? '-' : ''}$${count(Number(whole))}.${part}`
}

// 3412 -> "3,412".
function count(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function stepsOf(steps: number): string {
  return `${count(steps)} ${steps === 1 ? 'step' : 'steps'}`
}

// 59 -> "59s", 3720 -> "1h 2m", 277200 -> "3d 5h".
function span(seconds: number): string {
  const minutes = Math.floor(seconds / 60)

  if (minutes < 1) {
    return `${Math.floor(seconds)}s`
  }

  if (minutes < 60) {
    return `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)

  return hours < 24 ? `${hours}h ${minutes % 60}m` : `${Math.floor(hours / 24)}d ${hours % 24}h`
}

// 1234 -> "1.2k", 200000 -> "200k", 1000000 -> "1M".
function short(n: number): string {
  if (n < 1_000) {
    return String(n)
  }

  const [value, unit] = n < 999_950 ? [n / 1_000, 'k'] : [n / 1_000_000, 'M']

  return `${value.toFixed(1).replace(/\.0$/, '')}${unit}`
}
