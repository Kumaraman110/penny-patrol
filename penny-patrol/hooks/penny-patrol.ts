// Penny Patrol: meters above the prompt, a mascot that walks them while the session works, and under
// them a line with something worth a glance.
//
// THE CONTEXT BAR: the room there is before Claude Code compacts, as a stacked bar: what is in use, one
// colour per category as /context breaks it down, then what is free. (The autocompact buffer at the
// window's end is no room, and is not drawn: the bar is full when compaction is due.)
//
// THE COST BAR: who spent this session's dollars. Claude Code reports ONE figure, the session's total.
// The ledger looks at it at every turn start, tool call and turn end, and books each rise to whoever was
// acting when it was seen: the main conversation's current prompt, or a subagent (whose spend belongs to
// the prompt that started it). So the entries always add up to the total, to the cent. What was spent
// before the ledger first looked is "before tracking": it cannot be itemised, so it is said, not drawn.
// Where the account has limit windows, the band's cost is what was spent in each of them and in the
// plan's month, each beginning again when its own does; the bar is the plan's month. The whole session
// stays in the ledger.
//
// THE LIMIT BARS: what is LEFT of each window the account reports (five hours, the week, a spend limit),
// draining as it is used: a bar each, with what it says written in the bar. An account billed by the API
// has no such window; it gets the month's spend instead, draining a budget when one is set and growing
// when not.
//
// THE SCENE AND THE READOUT: the bars stand at the left, one under another, two free rows over each: a
// limit window first, then the context and the cost, then the other limits. Beside each is a line: the
// model beside the first limit, the steps beside the next, and what the context and cost bars have to
// say beside and under them. The free rows are the mascot's: it stands on a bar, and while anything runs
// (a turn, or a background shell or subagent) it takes a step a second, along the first bar, down, back
// along the second, down, and so to the last, and then the whole way back. It takes the colour of the
// part of the bar under it, and its face says how things are there.
// Steps are kept by day, so they add up to the week (from Sunday), the month and the year: this session's
// on the band, every session's on this machine in the ledger.
//
// THE LINE: one row under the bars, another every four minutes of work. By turns it says something about AI (a
// tip, a fact, what is new), a joke, a piece of good news; and every five to ten prompts, a suggestion
// drawn from this session's own figures, which says what taking it would move, and says so again when it
// has moved. What the line says comes with the mod and, unless told otherwise (/penny-patrol lines), from
// a handful of public feeds read every hour and kept in the folder below: of a story, the gist its own
// summary gives and its link, never its headline. What is read from a feed is only ever drawn: none of
// it reaches the model.
//
// WHAT IS WHOSE: a session's ledger, days and choices are its own (sessions/, days/ under the folder
// below, one file a session, written by that session alone), and so is everything the band says of the
// model, the steps, the context and the cost. The limits and the budget are the account's: the newest
// reading any session wrote is the one every session shows. What the sessions on this machine add up to
// (steps, dollars) is the ledger's to say.
//
// The host reads on(...) and $.noun.method(...) from source, so they are spelled literally, and helpers
// that take $ are top-level functions.

import type {
  BoxProps,
  ContextCategoryKind,
  ElementConstructor,
  EngineInterface,
  LinkProps,
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
// What a kind of thing weighs in every request, and the heaviest one of its kind.
type Load = { tokens: number; top: string; topTokens: number }
type Reading = { segments: Segment[]; used: number; window: number; percent: number; model: string; last: ModelUsage | null; memory: Load; mcp: Load }
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
  // All that the main conversation, and all that its subagents, were seen spending, whatever was folded
  // since. (A ledger kept before this was counted has it worked out: see spentOf.)
  spent?: { main: number; agents: number }
  // The plan's windows as this session met them, by their kind.
  marks?: Record<string, Mark>
}
// What the session had spent when it met a window of the plan (in all, and by the main conversation and
// by its subagents): what it spends from there is that window's. `resetsAt` (null with none told, or once
// it has passed) and `used` tell the window from the one after it.
type Mark = { resetsAt: string | null; used: number; usd: number; main: number; agents: number }
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
// `isTight`: this part of a meter is nearly spent (the mascot's face shows it). `isWord`: its glyph is a
// character of what is written in the bar.
type Cell = { glyph: string; color: string | undefined; isDim: boolean; isTight: boolean; isWord?: boolean }
type Part = { name: string; weight: number; glyph: string; color: string; isDim: boolean; isTight?: boolean }
// A limit bar, and what is written in it: its title, then what is left, at length or `short` where that
// does not fit.
// `isWindow`: a window the account reports (five hours, the week), not the month's spend.
type Gauge = { name: string; title: string; parts: Part[]; label: string; short: string; isWindow: boolean }
// A piece of text drawn one way, and a line of the readout: its label, then what it says.
type Run = { text: string; color?: string; isDim?: boolean }
type Line = { label: string; runs: Run[] }
// A legend's entry: a part's swatch and what is said of it. The lightest give way first.
type Chip = { glyph: string; color: string | undefined; isDim: boolean; text: string; weight: number }
// A bar of the scene with its lines: the one beside it, those that must stand in the rows right above
// it, and what it has to say in the `rows` rows under it. `smiles`: the mascot's own for this bar.
// `isLimit`: a limit bar. `isLow`: drawn with no free rows over it (the mascot does not come there).
type Section = { cells: Cell[]; beside: Line; above: Line[]; below: (rows: number) => Line[]; smiles?: string[]; isLimit?: boolean; isLow?: boolean }
type Box = ElementConstructor<BoxProps>
type Text = ElementConstructor<TextProps>
type Link = ElementConstructor<LinkProps>
// The line under the bars. A note is something it says: about AI, a joke, good news, or a suggestion for
// the person at the prompt; `href` is where it can be read in full. The first three are said by turns.
type Topic = 'ai' | 'joke' | 'news' | 'you'
type Pile = Exclude<Topic, 'you'>
type Note = { topic: Topic; text: string; href?: string }
// Where the line reads from: the feeds too, what came with the mod alone, or nowhere (no line).
type LineMode = 'live' | 'offline' | 'off'
// What the feeds gave, and when.
type Fresh = { at: number; notes: Note[] }
type Feed = { url: (pick: () => number) => string; headers?: Record<string, string>; most: number; read: (body: string) => Note[] }
// A prompt of this session as the suggestions see it: never its words, only its size and how it went.
// `nth` counts this session's prompts; `seq` is the ledger's number for it.
type Asked = { nth: number; seq: number; words: number; chars: number; gapMs: number; isAborted: boolean }
// A suggestion; `weight` is how much of its kind a turn's end found (the more of it, the more worth
// saying), and `watch` the figure that taking it would move, as it stands.
type Tip = { id: string; text: string; weight?: number; watch?: { figure: string; was: number } }
// A figure a suggestion was about, as it stood when the suggestion was made: at the time `at`, at this
// session's `nth` prompt, the ledger's `seq`, with `usd` spent in all and `agents` of it by subagents.
type Watch = { figure: string; was: number; at: number; nth: number; seq: number; usd: number; agents: number }

const COMMAND = 'penny-patrol'
const USAGE = `/${COMMAND} shows or hides the bars. /${COMMAND} costs prints the ledger, /${COMMAND} audit checks the figures, /${COMMAND} budget <dollars|off> sets the month's budget, /${COMMAND} plan <day|off> says which day of the month your plan renews on, /${COMMAND} lines <live|offline|off> says where the line under the bars reads from.`
const FOLDER = '.penny-patrol'
const MAX_TURNS = 200
const MIN_BAR = 10
const MID_TURN_MS = 10_000
const SAVE_EVERY_STEPS = 15
// How often a session looks at what the others wrote: the limits, then (less often) their days.
const SHARE_EVERY_TICKS = 5
const SCAN_EVERY_TICKS = 30
// A window of the plan has begun again when it ends this much later than the one before it or, where no
// end is told, when this many points less of it are used.
const RENEWED_MS = 30 * 60_000
const RENEWED_POINTS = 1
// A redraw a minute keeps the countdowns moving while nothing else does.
const REDRAW_EVERY_TICKS = 60
// Single-width block characters: they line up in every terminal font. A bar's cells are drawn as
// BACKGROUND (see runsOf), so these are what a copy of the band carries, and only the shade shows.
const GLYPH: Record<Kind, string> = { used: '█', free: '░', buffer: '▒' }
const SHADE = '▒'
// What is free or gone in a bar is black, and the words over it white, whatever the theme: a theme's own
// quiet colours are light in a light theme, and the terminal under it may be dark. Words cut out of a
// part take the theme's colour for text on a colour.
const TRACK = '#000000'
const TRACK_WORD = '#ffffff'
const WORD = 'inverseText'
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
// stretch of a bar it wears its own, and so it does where the bar over its head is that same colour (two
// limits both in the green), or it would not be told from that bar. Its face: asleep while nothing runs,
// strained wherever the meter
// under it is nearly spent (TIGHT_SHARE), and otherwise, while it walks, a smile: another one every
// SMILE_STEPS steps, with a wink for a step in the middle of every other. A bar may add a smile of its
// own to those (over the cost bar, one with dollars in its eyes).
const MASCOT_COLOR = 'claude'
const MASCOT_CELLS = 6
const MASCOT_MIDDLE = 2
const ARM = '▄'
const FACE = { asleep: '-__-', strained: '>__<' }
const SMILES = ['^__^', '^uu^', 'n__n', '^ww^', '^oo^', '*__*']
const WINKS = ['^__~', '~__^']
const COST_SMILES = ['$__$']
const SMILE_STEPS = 8
const LEGS = ['▗▗▖▖', '▗▖▗▖']
// A meter is tight with less than this share left: of the room before compaction, of a limit's window,
// of the month's budget. (For the limits that is where their bar turns red.)
const TIGHT_SHARE = 0.2
const LANES = 2
// Background work that keeps the session running after its turn ended.
const RUNNING_KINDS = new Set(['shell', 'subagent', 'workflow'])
const WINDOW_NAME: Record<string, string> = { five_hour: '5h', seven_day: 'Week', spend_limit: 'Spend' }
// The plan's month among a ledger's marks: no window the account reports has a name like it.
const PLAN = '@plan'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The line says something else every LINE_STEPS steps of the mascot's (four minutes of work: while nothing
// runs it stays as it is), and a suggestion holds it that long. A note, the gist of a
// story (and the least of one worth showing) and a link have their lengths; TOLD_KEPT is how many notes a
// session remembers having said. The feeds are read again when what they gave is REFRESH_MS old (a read
// that gave nothing is tried again after RETRY_MS); a session looks whether it is time every
// FRESHEN_EVERY_TICKS, and first FIRST_READ_MS after it starts. What is kept of a read says in which
// FORMAT: one kept otherwise is read anew.
const LINE_STEPS = 240
const NOTE_MIN = 12
const NOTE_MAX = 170
const GIST_MAX = 150
const GIST_LEAST = 48
const LINK_MAX = 120
const TOLD_KEPT = 600
const REFRESH_MS = 3_600_000
const RETRY_MS = 30 * 60_000
const FRESHEN_EVERY_TICKS = 600
const FIRST_READ_MS = 4_000
const FORMAT = 2
// A suggestion comes after COACH_LEAST prompts and up to COACH_SPREAD more, from what the last ASKED_KEPT
// were like. A break of COLD_GAP_MS is long enough for a prompt cache to have gone cold. What a suggestion
// was about is watched for WATCH_PROMPTS prompts, to say so when it has moved. A limit's pace is taken
// over the last TRAIL_MS of its readings (TRAIL_KEPT of them are kept), once they span PACE_MIN_MS.
const COACH_LEAST = 5
const COACH_SPREAD = 6
const ASKED_KEPT = 12
const COLD_GAP_MS = 5 * 60_000
const WATCH_PROMPTS = 40
// How the line begins when it says that what a suggestion was about has moved.
const SHOWN = 'It shows: '
const TRAIL_MS = 3_600_000
const TRAIL_KEPT = 400
const PACE_MIN_MS = 15 * 60_000
// The kinds of note the line says by turns.
const ROUND: Pile[] = ['ai', 'joke', 'news']
const TOPIC: Record<Topic, { label: string; color: string }> = {
  ai: { label: 'AI', color: 'permission' },
  joke: { label: 'Joke', color: 'claude' },
  news: { label: 'Good news', color: 'success' },
  you: { label: 'For you', color: 'warning' },
}
const INTRO = `This line also reads a few public feeds, every hour, for fresh jokes, AI news and good news. /${COMMAND} lines offline keeps it to what came with the mod.`
const CHANGELOG_PAGE = 'https://code.claude.com/docs/en/changelog'
// A story that is grim is no one's good news, one about politics is not for a line everyone at the desk
// reads, and a feed's notes about itself are not news. Changelog entries about the plumbing are left to
// those who need them.
const HEATED = /\b(trump|biden|elections?|senat(e|ors?)|congress\w*|democrat\w*|republican\w*|impeach\w*|white house|administration|lawmakers?|politic\w*)\b/i
const GRIM = /\b(dead|deaths?|dies|died|dying|kill(s|ed|ing|er)?|wars?|shoot(s|ing)?|shot|attack(s|ed)?|suicides?|murder(s|ed)?|abuse[ds]?|rape[ds]?|terror\w*|bomb(s|ed|ing)?|genocide|hostages?|tragedy|tragic|fatal\w*|victims?|crash(es|ed)?|disasters?|lawsuits?|sue[ds]?|quits?|fired|layoffs?|scams?|fraud|broken|sad|risks?|ban(s|ned)?|leak(s|ed)?|breach(es|ed)?|hack(s|ed)?|worst|fail(s|ed|ure)?|wip(e[sd]?|ing) out|doom\w*|extinct\w*|threat\w*|danger\w*|rogue|fear\w*|warn\w*|cris[ei]s|collaps\w*|bubble|backlash|outrage\w*|harm\w*|toxic|addict\w*|surveillance|spy(ing)?|stole|steal(s|ing)?|theft|plagiar\w*|misinformation|deepfakes?|crackdowns?|arrest(s|ed)?|smuggl\w*|antitrust|slammed|harass\w*|resign\w*|slop|deadly|assault\w*|earthquakes?|tsunamis?|hurricanes?|famine|sliced|severed|amputat\w*)\b/i
const ABOUT_ITSELF = /good news in history|good news this week|podcast|transcript|newsletter|roundup|webinar|what we.re reading|^gallery|quiz|sponsor|subscribe|sign up|giveaway|horoscope|astrology|crossword|techcrunch disrupt|startup battlefield|register now|save up to/i
const PLUMBING = /\$\.|plugin|\bmods?\b|opentelemetry|managed setting|environment variable|\bsdk\b|\.mcpb|bedrock|vertex|foundry/i
// Jokes at the expense of what people are, believe or suffer are not for a line everyone at the desk reads.
const NOT_FUNNY = /\b(yo mama|your mom|blind|deaf|cripple\w*|wheelchair|retard\w*|autis\w*|god|jesus|christ|atheis\w*|religio\w*|pope|priest|nun|muslim|islam\w*|christian\w*|jew\w*|bible|sex\w*|bra|boobs?|naked|nude|gay|lesbian|suicide|cancer|rape\w*|nazi\w*|hitler|slave\w*|race|racis\w*)\b/i
const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', mdash: ' - ', ndash: ' - ', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' }
// What cannot stand for its story. A sentence that opens like NOT_A_GIST, or says anything like SELF, is
// about the page or the outlet; one that ends like DANGLES points at something it does not say; one that
// opens
// like LEANS leans on the headline or (LEANS_LATER, for any but the first) on the sentence before it; one
// that opens like SCENE only sets a scene, unless there is a figure in it; and one that its feed cut
// off, when it opens like SUBORDINATE or is shorter than CUT_SHORT, may not have got to its point.
const NOT_A_GIST = /^(welcome|today,? i|sign up|learn how|register|watch|here are|here's what|subscribe|listen|episode|this week|in this|join us|read more|click|photo|image|credit|tell us|meet the|the full |on equity|we discuss|your weekly|believe it or not)/i
const SELF = /\b(sponsored by|supported by|our (newsletter|podcast|sponsors?)|sign up (for|to)|subscribe to)\b/i
const DANGLES = /\b(on|of|for|with|about|to|at) (it|them|this|that)[.]$/i
const LEANS = /^(this|that|these|those|it|its|it's|they|he|she|such|so much for|here|we|we're|i|our|my|the (trio|pair|duo|group|couple|team|two|three|four))\b/i
// A later sentence whose first words have an "it" or a "them" in them is about something said before.
const POINTS_BACK = /^(\S+ ){1,3}(it|them)\b/i
// A sentence its feed cut off this short has not got anywhere.
const CUT_SHORT = 100
const LEANS_LATER = /^(the|but|and|so|their|his|her|new|one|now|instead|then|today|meanwhile|however|still|also|most importantly|little did)\b/i
const SCENE = /^(think about|imagine|picture|there's|there (is|are|was|were)|every |if you|have you|we all|you |let's|once upon|sometimes|for (many|most|years|decades)|from [^.]{3,60}? comes )/i
const SUBORDINATE = /^(after|as|when|while|although|though|since|just after|before|during|following|despite|because)\b/i
// A stop after one of these ends no sentence.
const ABBREVIATED = /^(?:[A-Za-z]|Mr|Mrs|Ms|Dr|Prof|Sen|Rep|Gov|Lt|Gen|Col|Sgt|St|Jr|Sr|vs|etc|Inc|Corp|Co|Ltd|No|U[.]S|U[.]K|E[.]U|a[.]m|p[.]m|e[.]g|i[.]e)$/
const FEEDS: Feed[] = [
  { url: () => 'https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md', headers: { Range: 'bytes=0-60000' }, most: 8, read: newInClaudeCode },
  { url: () => 'https://the-decoder.com/feed/', most: 10, read: body => stories('ai', 'the-decoder.com', false, body) },
  { url: () => 'https://techcrunch.com/category/artificial-intelligence/feed/', most: 8, read: body => stories('ai', 'techcrunch.com', false, body) },
  { url: () => 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', most: 8, read: body => stories('ai', 'theverge.com', true, body) },
  { url: pick => `https://icanhazdadjoke.com/search?limit=30&page=${1 + Math.floor(pick() * 20)}`, headers: { Accept: 'application/json' }, most: 30, read: dadJokes },
  { url: () => 'https://v2.jokeapi.dev/joke/Programming?safe-mode&amount=10', most: 10, read: codeJokes },
  // Good news is anything that does some good, big or small: the outlets' front pages, and the sections
  // where people, animals and children have theirs.
  { url: () => 'https://www.positive.news/feed/', most: 10, read: body => stories('news', 'positive.news', false, body) },
  { url: () => 'https://www.goodnewsnetwork.org/feed/', most: 16, read: body => stories('news', 'goodnewsnetwork.org', true, body) },
  { url: () => 'https://www.goodnewsnetwork.org/category/news/heroes/feed/', most: 8, read: body => stories('news', 'goodnewsnetwork.org', true, body) },
  { url: () => 'https://www.goodnewsnetwork.org/category/news/animals/feed/', most: 8, read: body => stories('news', 'goodnewsnetwork.org', true, body) },
  { url: () => 'https://www.goodnewsnetwork.org/category/news/inspiring/feed/', most: 8, read: body => stories('news', 'goodnewsnetwork.org', true, body) },
  { url: () => 'https://www.optimistdaily.com/feed/', most: 8, read: body => stories('news', 'optimistdaily.com', true, body) },
  { url: () => 'https://www.goodgoodgood.co/articles/rss.xml', most: 12, read: body => stories('news', 'goodgoodgood.co', false, body) },
]
// What comes with the mod. The commands and keys named here were checked against Claude Code 2.1.289.
const AI_NOTES = [
  '/context shows what is filling the window, category by category, as a coloured grid.',
  '/compact takes instructions: "/compact keep the API decisions" tells the summary what to hold on to.',
  '/btw asks a quick side question without interrupting the main conversation.',
  '/memory opens your CLAUDE.md files: what is written there is read at the start of every session.',
  '/rewind goes back to an earlier point of the conversation when a turn went the wrong way.',
  '/resume picks a previous conversation up where it stopped.',
  '/export saves the conversation to a file or the clipboard: handy for a write-up or a bug report.',
  '/usage shows the session\'s cost, your plan\'s usage and your activity.',
  '/effort sets how hard the model thinks: lower for routine edits, higher for the hard problem.',
  '/model switches model mid-session: a lighter one does routine edits for a fraction of the cost.',
  '/init writes a CLAUDE.md for a codebase: its build commands, layout and house rules in one place.',
  '/add-dir gives the session a second working directory without a restart.',
  '/mcp lists the MCP servers connected to the session: each one\'s tools are part of every request.',
  'Shift+Tab cycles the permission modes. Plan mode agrees the approach before a single edit is made.',
  'Start a line with ! to run a shell command yourself: its output lands in the conversation.',
  'Type @ and a path to point Claude at a file: it reads that, not the whole tree.',
  'Paste a screenshot straight into the prompt: an error dialog or a mock-up beats describing it.',
  'claude -p "question" answers once and exits: pipe a log in, get the answer out.',
  'A subagent works in a context window of its own: right for a wide search whose output you need not keep.',
  'A hook can run your script before or after any tool call: format on every edit, stop a risky command.',
  `/${COMMAND} costs lists every prompt of this session and what it cost, to the cent.`,
  `/${COMMAND} budget 50 sets a budget for the month and adds a bar that drains against it.`,
  'Every request sends the whole conversation again: that is why message 50 costs more than message 5.',
  'Input read from the prompt cache costs about a tenth of fresh input. Back-to-back prompts keep it warm.',
  'A token is about three quarters of an English word: 1,000 tokens is roughly 750 words.',
  'Code and languages other than English take more tokens a word than plain English does.',
  'Output tokens cost several times what input tokens do: ask for the diff, not the whole file.',
  'Put the long document first and the question last: models answer better when the ask follows the material.',
  'Two or three examples of what you want often beat a paragraph describing it.',
  'Say what done looks like. "Tests pass and no new warnings" gives the model something to check itself against.',
  'On anything big, ask for the plan before the code: a wrong plan is cheaper to fix than a wrong diff.',
  'When an answer matters, ask the model to quote the lines it relied on: no quote, no claim.',
  'Say what may not be touched as well as what to change: a constraint prevents the helpful extra.',
  'The transformer was introduced in 2017, in a paper called "Attention Is All You Need".',
  'The phrase "artificial intelligence" was coined for a summer workshop at Dartmouth in 1956.',
  'ELIZA, a 1966 chatbot made of pattern matching, had people sure it understood them: the ELIZA effect.',
  'GPT stands for generative pre-trained transformer.',
  'RAG, retrieval-augmented generation: look it up first, then let the model write with the sources in front of it.',
  'Temperature trades repeatability for variety: low for extraction, higher for brainstorming.',
  'A model knows nothing after its training cut-off: for anything recent, give it the page or let it search.',
  'A language model predicts the next token. Everything else, from poems to pull requests, is that, repeated.',
  'The context window is all the model has to work with in a request: what is not in it does not exist for it.',
]
const JOKES = [
  'Before AI I sent the email. Now I paste it into Copilot, paste that into Outlook, and the receiver hits Summarise to read what I first typed into Copilot.',
  'I ask AI to turn three bullets into an email. You ask AI to turn my email into three bullets. Somewhere a data centre boils a lake over three bullets.',
  'My standup: yesterday I prompted, today I will prompt, blocker: rate limit.',
  'We replaced the meeting with an AI summary. Now nobody reads the summary of the meeting nobody went to.',
  'I told the AI to act like a senior engineer. It said "it depends" and asked who owns the roadmap.',
  'The model is 99% accurate. The other 1% is saved for the demo.',
  'Prompt engineering: saying please to a matrix multiplication, and meaning it.',
  'My code has no bugs. It has emergent behaviour.',
  'AI wrote my tests. They all pass. They check that true is true, but they all pass.',
  '"It works on my machine" has been upgraded to "it worked in my chat".',
  'I asked for a one-line fix. The agent refactored the module, renamed the variables and offered to write a blog post about it.',
  '"You\'re absolutely right!" An AI, seconds before doing exactly the same thing again.',
  'Vibe coding: the code runs, and neither the human nor the model in the room knows why.',
  'An LLM never forgets. Except everything you said before message 40.',
  'Our AI strategy has three pillars: a chatbot, a second chatbot, and a slide that says "agents".',
  'It passed the bar exam and the medical boards. Then someone asked how many r\'s there are in strawberry.',
  'Token limit reached. Please insert coin to continue thinking.',
  'The agent says all tests pass. Three were skipped, two were deleted, and one now tests the agent\'s optimism.',
  'I asked AI to make my email more professional. It added "I hope this finds you well" and removed the point.',
  'AI meeting notes. Decisions: none. Action items: none. Duration: 90 minutes. Finally, an honest summary.',
  'My manager asked whether AI could do my job. I asked the AI. It said it needed more context. So do I.',
  'When the model is wrong it is a hallucination. When I am wrong it is a hypothesis.',
  'I have a joke about context windows, but it was too long, so here is a summ',
  '"Just one more prompt" is the new "just one more episode".',
  'An agent is an intern with root access, endless confidence and no fear of a Friday deploy.',
  'I asked for a regex. Now I have two problems and a very polite explanation of both.',
  'My rubber duck was replaced by an LLM. The duck never billed me by the token.',
  'Pair programming with AI: a partner who has read everything and remembers nothing you just said.',
  'In 2010 autocomplete finished my word. Now it finishes my sprint, opens the PR and asks me to approve my own replacement.',
  'The AI apologised fourteen times today. That is more than my last three managers put together.',
  'Nobody says "I don\'t know" any more. We say "let me ask Claude" and wait with a thoughtful face.',
  'My LinkedIn feed: a human posts an AI\'s thoughts on leadership, and an AI comments "Great insights!" for the other humans.',
  'Interviewer: where do you see yourself in five years? Me: still waiting for the agent to finish "one last step".',
  'I gave the AI my whole codebase for context. It read it, sighed in JSON, and suggested a rewrite in Rust.',
  'AI will not replace you. A person using AI will. Then an agent using that person. It is recursion all the way to the invoice.',
  'My prompt was four words. The answer was nine hundred. I call it leverage. Finance calls it output tokens.',
  'The spec said "make it pop". Even the model asked for acceptance criteria.',
  'Autonomous agent, day one: done in five minutes. Day two: four hours explaining to it what it did on day one.',
  'Someone asked the chatbot to be brief. It said "Certainly! Here is a brief answer:" and wrote six paragraphs.',
  'I do not have imposter syndrome. One model writes my code and another approves it. I am the imposter.',
  'I told my computer I needed a break. It froze.',
  'There are 10 kinds of people: those who read binary and those who do not.',
  'I would tell you a UDP joke, but you might not get it.',
  'A SQL query walks into a bar, goes up to two tables and asks: may I join you?',
  'Why do programmers mix up Halloween and Christmas? Because Oct 31 is Dec 25.',
  'My boss told me to have a good day, so I went home.',
  'Parallel lines have so much in common. It is a shame they will never meet.',
  'The early bird gets the worm, but the second mouse gets the cheese.',
]

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
// The day of the month the plan renews on, once told (the machine's, in settings.json): until then the
// plan's month is the calendar's.
let planDay: number | null = null
// The time as last read from the host, moved on by the tick between reads.
let nowMs = 0
// What makes the mascot walk, and how many steps it has taken since this loaded.
let isMainWorking = false
let background = 0
let ticks = 0
let strides = 0
let unsavedSteps = 0
// The line: where it reads from and whether its feeds have been owned up to (both the machine's, in
// settings.json), what the feeds last gave and when they were last asked. `deck` is what this session has
// to say, kind by kind, in its own order; `told`, what it has said; `shown`, what it says this turn. A
// turn is LINE_STEPS of the mascot's steps long, counted from the step `lineFrom`; a pinned note holds
// the line until the step `until`.
let lineMode: LineMode = 'live'
let isIntroduced = false
let fresh: Fresh | null = null
let triedAt = 0
let deck: Record<Pile, Note[]> = { ai: [], joke: [], news: [] }
let told: string[] = []
let shown: { turn: number; note: Note } | null = null
let lineFrom = 0
let pinned: { note: Note; until: number } | null = null
// The suggestions: this session's own dice, its prompts as they see them (newest last), when the last
// turn ended, and the prompt the next suggestion is due at. `said` are the ones made since all there was
// to say had been said; `noted`, what a turn's end found worth saying once.
let seed = 1
let chance = seeded(1)
let asked: Asked[] = []
let prompts = 0
let endedAt = 0
let coachAt = COACH_LEAST
let said: string[] = []
let noted: Tip[] = []
// What the suggestions made were about, watched to say when it has moved; and how far each limit window
// was used, reading by reading, for the pace it is going at.
let watches: Watch[] = []
let trail: Record<string, Array<{ at: number; used: number }>> = {}
// What has made the conversation shorter since a suggestion about the context was last made: /compact,
// the engine's own compaction, or /clear. Null while nothing has: the figure moving by itself shows nothing.
let eased: string | null = null

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the context, cost and limit bars; costs, audit, budget, plan and lines do more',
      argumentHint: '[costs | audit | budget <dollars|off> | plan <day|off> | lines <live|offline|off>]',
      immediate: true,
    })
    nowMs = await $.clock.now()
    const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
    folder = home === undefined || home === '' ? '' : `${home}/${FOLDER}`
    await book($, null)
    await catchUp($, true)
    await recall($)

    // Said once on a machine, the first time the line is live: that it reads the web, and how to stop it.
    if (lineMode === 'live' && !isIntroduced && folder !== '') {
      isIntroduced = true
      hold({ topic: 'you', text: INTRO })
      await settle($)
    }

    // Subagents already running when this loads (a reload mid-work) are background work too.
    background = (await $.agent.list()).filter(agent => ['pending', 'running', 'waiting'].includes(agent.status)).length

    if (!isHidden) {
      await takeReading($)
    }

    $.clock.every(1000, () => tick($))
    // The feeds are read in the background, once the session is up.
    $.clock.after(FIRST_READ_MS, () => {
      void freshen($).catch(() => undefined)
    })

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
    noteAsk(e.text, ledger ? ledger.nextSeq - 1 : 0)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await book($, e.agentId ?? null)

    if (e.agentId === undefined) {
      isMainWorking = false
      endedAt = nowMs
      const ask = asked.at(-1)

      if (ask && e.reason === 'aborted') {
        ask.isAborted = true
      }

      const turn = ledger?.turns.at(-1)

      if (turn && e.usage) {
        addUsage(turn.tokens, e.usage)
        turn.model = e.usage.model
      }

      noteTurn()
      prove()
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
      eased = watches.some(watch => watch.figure === 'context') ? '/clear' : null
      $.ui.invalidate('ui.render')
    }

    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    const result = await next(e)

    // The main conversation made shorter (not a subagent's, and not a compaction only worked out ahead).
    if (e.agentId === undefined && e.trigger !== 'precompute' && result.skip === undefined) {
      eased = e.trigger === 'manual' ? '/compact' : 'compaction'
    }

    return result
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
      await settle($)
      $.ui.invalidate('ui.render')

      return { text: budget === null ? 'Budget cleared.' : `Budget set: ${dollars(budget)} a month, counted from what this machine's sessions spend.` }
    }

    if (verb === 'plan') {
      const day = Number(value)

      if (value !== '' && value !== 'off' && !(Number.isInteger(day) && day >= 1 && day <= 31)) {
        return { text: `Say the day of the month your plan renews on, 1 to 31: /${COMMAND} plan 14. /${COMMAND} plan off counts from the 1st.` }
      }

      if (value !== '') {
        planDay = value === 'off' ? null : day
        await settle($)
        markWindows()
        await save($)
        $.ui.invalidate('ui.render')
      }

      const { from, to } = planOf(nowMs)
      const month = `Its month now running began on ${dayMonth(from)} and ends on ${dayMonth(to)}.`

      return { text: planDay === null
        ? `The plan's month is counted from the 1st: the day your plan renews on is not set. ${month} Set it with /${COMMAND} plan 14.`
        : `Your plan renews on the ${ordinal(planDay)}. ${month} /${COMMAND} plan off counts from the 1st.` }
    }

    if (verb === 'lines') {
      if (value === 'live' || value === 'offline' || value === 'off') {
        lineMode = value
        isIntroduced = true
        await settle($)

        if (value === 'live') {
          triedAt = 0
          await freshen($)
        }

        shown = null
        shuffle()
        $.ui.invalidate('ui.render')
      }

      return { text: linesSaid(value !== '' && value !== lineMode) }
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

    const { Box, Text, Link } = $.ui.resolve(e)

    return band(Box, Text, Link, reading, e.props.bodyColumns, e.props.maxRows, e.surface === 'terminal')
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

  if (ticks % FRESHEN_EVERY_TICKS === 0) {
    void freshen($).catch(() => undefined)
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
  // An MCP tool weighs with its server, and only while its schema is in the window.
  const servers = new Map<string, number>()

  for (const tool of breakdown.mcpTools) {
    if (tool.isLoaded) {
      servers.set(tool.serverName, (servers.get(tool.serverName) ?? 0) + tool.tokens)
    }
  }

  reading = {
    segments: ORDER.flatMap(kind => segments.filter(segment => segment.kind === kind)),
    used: breakdown.totalTokens,
    window: breakdown.rawMaxTokens,
    percent: breakdown.percentage,
    model: breakdown.model,
    last: breakdown.apiUsage,
    memory: loadOf(breakdown.memoryFiles.map(file => ({ name: file.path.split(/[\\/]/).at(-1) ?? file.path, tokens: file.tokens }))),
    mcp: loadOf([...servers].map(([name, tokens]) => ({ name, tokens }))),
  }
  prove()
  // What made the conversation shorter has had its reading: a later one is not its doing.
  eased = null
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
    // Its own dice, so no two sessions say the same things in the same order; and a clean slate for the
    // suggestions, which are about this conversation alone.
    seed = seedOf(tag, startedAt)
    chance = seeded(seed + 1)
    asked = []
    prompts = 0
    endedAt = 0
    said = []
    noted = []
    // What a suggestion said of the context is still to be shown when /clear was the answer to it; and
    // what the line has just shown of it stays its four minutes.
    watches = watches.filter(watch => watch.figure === 'context').map(watch => ({ ...watch, nth: 0, seq: 0 }))
    eased = watches.length > 0 ? '/clear' : null
    pinned = pinned !== null && pinned.note.text.startsWith(SHOWN) ? pinned : null
    told = []
    shown = null
    lineFrom = strides
    coachAt = COACH_LEAST + Math.floor(chance() * COACH_SPREAD)
    shuffle()
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
    ledger = { seen: cost.usd, untracked: cost.usd, folded: { usd: 0, prompts: 0 }, steps: 0, nextSeq: 1, turns: [], agents: {}, spent: { main: 0, agents: 0 } }
  }

  // Before the rise is booked: a window met in this look begins at what was spent until now.
  markWindows()
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

  const spent = spentOf(ledger)

  if (agentId === null) {
    current.main += rise
    spent.main += rise
  } else {
    const home = noteFor(ledger, agentId).home
    const turn = ledger.turns.find(candidate => candidate.seq === home) ?? current
    turn.agents[agentId] = (turn.agents[agentId] ?? 0) + rise
    spent.agents += rise
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
  noteTrail()
  markWindows()
  await keep($, 'limits.json', limits)
  prove()
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
    noteTrail()
  }

  let isChanged = false

  if (isScan) {
    const settings = (await load($, 'settings.json')) as { budget?: unknown; lines?: unknown; isIntroduced?: unknown; plan?: unknown } | undefined
    budget = typeof settings?.budget === 'number' && settings.budget > 0 ? settings.budget : null
    const day = typeof settings?.plan === 'number' && Number.isInteger(settings.plan) && settings.plan >= 1 && settings.plan <= 31 ? settings.plan : null
    isChanged = day !== planDay
    planDay = day
    isIntroduced = isIntroduced || settings?.isIntroduced === true
    const mode = settings?.lines === 'offline' || settings?.lines === 'off' ? settings.lines : 'live'

    if (mode !== lineMode) {
      lineMode = mode
      shown = null
      shuffle()
      isChanged = true
    }
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

  // A window that has run out begins again there and then.
  const isMarked = markWindows()

  if (isMarked || isChanged || before !== JSON.stringify([limits, budget])) {
    $.ui.invalidate('ui.render')
  }
}

// What the machine's sessions share of their choices: the budget and where the line reads from.
async function settle($: EngineInterface): Promise<void> {
  await keep($, 'settings.json', { budget, lines: lineMode, isIntroduced, ...(planDay === null ? {} : { plan: planDay }) })
}

// What the feeds gave, as a session last kept it: taken when it is newer than what is known.
async function recall($: EngineInterface): Promise<void> {
  const kept = freshOf(await load($, 'lines.json'))

  if (kept !== null && (fresh === null || kept.at > fresh.at)) {
    fresh = kept
    shuffle()
    $.ui.invalidate('ui.render')
  }
}

// Reads the feeds when what they last gave is old (to any session: the file is looked at first), each
// through the host, which may refuse (an organization's policy, no network): a feed that gives nothing is
// left for the next time. What they give is kept for every session of this machine.
async function freshen($: EngineInterface): Promise<void> {
  if (lineMode !== 'live' || folder === '') {
    return
  }

  nowMs = await $.clock.now()
  await recall($)

  if ((fresh !== null && nowMs - fresh.at < REFRESH_MS) || (triedAt !== 0 && nowMs - triedAt < RETRY_MS)) {
    return
  }

  triedAt = nowMs
  const notes: Note[] = []
  // Which page of a feed that has pages: another each time, and no business of the suggestions' dice.
  const pick = seeded(Math.floor(nowMs / 1000))

  for (const feed of FEEDS) {
    try {
      const response = await $.http.fetch(feed.url(pick), feed.headers ? { headers: feed.headers } : {})

      if (response.ok) {
        notes.push(...feed.read(response.text).slice(0, feed.most))
      }
    } catch {
      // This feed another time.
    }
  }

  if (notes.length === 0) {
    return
  }

  // A story two feeds gave is one story.
  const unique = notes.filter((note, i) => notes.findIndex(other => other.text === note.text) === i)
  fresh = { at: nowMs, notes: unique }
  await keep($, 'lines.json', { format: FORMAT, ...fresh })
  shuffle()
  $.ui.invalidate('ui.render')
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

// All that the main conversation and its subagents were seen spending. A ledger kept before this was
// counted has it worked out from its prompts, what was folded counting as the main conversation's.
function spentOf(money: Ledger): { main: number; agents: number } {
  const spent = money.spent ?? {
    main: money.turns.reduce((sum, turn) => sum + turn.main, money.folded.usd),
    agents: money.turns.reduce((sum, turn) => sum + Object.values(turn.agents).reduce((all, usd) => all + usd, 0), 0),
  }
  money.spent = spent

  return spent
}

// Marks, for each window of the plan, where this session's spending stood when it met the window as it
// now is: one it has not seen before, one that has begun again (it ends later than it did or, where no
// end is told, less of it is used), and one whose end has passed, which begins again there and then,
// before the next is reported. With them, the plan's own month (see planMark). True when a mark was set.
function markWindows(): boolean {
  if (ledger === null || limits === null) {
    return false
  }

  const marks = ledger.marks ?? {}
  const spent = spentOf(ledger)
  let isMarked = false

  for (const window of limits.windows) {
    const mark = marks[window.kind]
    const ends = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt)
    const ended = mark === undefined || mark.resetsAt === null ? NaN : Date.parse(mark.resetsAt)
    const isOver = !Number.isNaN(ends) && nowMs >= ends
    const isRenewed = mark === undefined
      || (isOver && mark.resetsAt === window.resetsAt)
      || (!isOver && (Number.isNaN(ends) || Number.isNaN(ended) ? window.percentUsed < mark.used - RENEWED_POINTS : ends - ended > RENEWED_MS))

    marks[window.kind] = isRenewed
      ? { resetsAt: isOver ? null : window.resetsAt ?? null, used: window.percentUsed, usd: ledger.seen, main: spent.main, agents: spent.agents }
      : { ...mark, used: window.percentUsed, resetsAt: isOver ? mark.resetsAt : window.resetsAt ?? mark.resetsAt }
    isMarked = isMarked || isRenewed
  }

  if (limits.windows.length > 0) {
    const { from, to } = planOf(nowMs)
    const ends = to.toISOString()
    const mark = marks[PLAN]

    // A month first met, one that has run out and begun again, and one that changed because another day
    // was said: each is worked out from the session's days, which a month begins and ends with.
    if (mark === undefined || mark.resetsAt !== ends) {
      marks[PLAN] = planMark(ledger, from, ends)
      isMarked = true
    }
  }

  ledger.marks = marks

  return isMarked
}

// The plan's month now running: from the day of the month the plan renews on, at midnight, to that day
// of the next month. A day the month does not have is its last. With no day told, the calendar's month.
function planOf(at: number): { from: Date; to: Date } {
  const day = planDay ?? 1
  const now = new Date(at)
  const on = (monthsOn: number): Date => {
    const first = new Date(now.getFullYear(), now.getMonth() + monthsOn, 1)

    return new Date(first.getFullYear(), first.getMonth(), Math.min(day, new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()))
  }

  return on(0).getTime() <= at ? { from: on(0), to: on(1) } : { from: on(-1), to: on(0) }
}

// Where this session's spending stood when the plan's month began, worked out from its days, which are
// whole days as the month's are: all it was seen spending is the month's when its first day is in it;
// else what its days since then add up to, split between the main conversation and its subagents as
// all of it is (which of the two spent it before the month began is not kept).
function planMark(money: Ledger, from: Date, ends: string): Mark {
  const start = dateOf(from)
  const spent = spentOf(money)
  const tracked = spent.main + spent.agents
  const dates = Object.keys(days).filter(date => (days[date]?.usd ?? 0) > 0)
  const since = dates.every(date => date >= start)
    ? tracked
    : Math.min(tracked, dates.filter(date => date >= start).reduce((sum, date) => sum + (days[date]?.usd ?? 0), 0))
  const earlier = tracked > 0 ? (tracked - since) / tracked : 0

  return { resetsAt: ends, used: 0, usd: money.seen - since, main: spent.main * earlier, agents: spent.agents * earlier }
}

// 14 -> "14th".
function ordinal(n: number): string {
  const unit = n % 10

  return `${n}${n >= 11 && n <= 13 ? 'th' : unit === 1 ? 'st' : unit === 2 ? 'nd' : unit === 3 ? 'rd' : 'th'}`
}

// A day as the ledger says it: "5 Oct".
function dayMonth(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()] ?? ''}`
}

// What the session was seen spending in each window of the plan it has a mark for, and last in the
// plan's month, in whole cents: in all, and by the main conversation and by its subagents, which add up
// to it.
function periodsOf(money: Ledger): Array<{ name: string; total: number; main: number; agents: number; isPlan: boolean }> {
  const spent = spentOf(money)
  const kinds = [...(limits?.windows ?? []).map(window => window.kind), ...((limits?.windows.length ?? 0) > 0 ? [PLAN] : [])]

  return kinds.flatMap(kind => {
    const mark = money.marks?.[kind]

    if (!mark) {
      return []
    }

    const total = Math.max(0, Math.round((money.seen - mark.usd) * 100))
    const [main = 0, agents = 0] = apportion([Math.max(0, spent.main - mark.main), Math.max(0, spent.agents - mark.agents)], total, 0)

    return [{ name: kind === PLAN ? 'Plan' : WINDOW_NAME[kind] ?? capital(kind.replace(/_/g, ' ')), total, main, agents, isPlan: kind === PLAN }]
  })
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
// the days given: this session's alone, or every session's on this machine (see everyDays).
function calendar(at: number, sources: Days[]): Record<'today' | 'week' | 'month' | 'year', Day> {
  const now = new Date(at)
  const today = dateOf(now)
  const from = {
    today,
    week: dateOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay())),
    month: `${today.slice(0, 7)}-01`,
    year: `${today.slice(0, 4)}-01-01`,
  }
  const sums = { today: { steps: 0, usd: 0 }, week: { steps: 0, usd: 0 }, month: { steps: 0, usd: 0 }, year: { steps: 0, usd: 0 } }

  for (const theirs of sources) {
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

// This session's days and the other sessions', as last read.
function everyDays(): Days[] {
  return [days, ...[...others.values()].map(other => other.days)]
}

function band(Box: Box, Text: Text, Link: Link, now: Reading, columns: number, maxRows: number, isTerminal: boolean): RenderElement {
  // paddingX takes two cells.
  const inner = Math.max(1, columns - 2)
  const money = ledger !== null && ledger.seen > 0 ? ledger : null
  const bill = money ? billOf(money) : null
  // The steps are this session's own; the month's spend is every session's, as the budget is.
  const mine = calendar(nowMs, [days])
  const gauges = gaugesOf(calendar(nowMs, everyDays()).month.usd, money !== null)
  const free = now.segments.reduce((sum, segment) => sum + (segment.kind === 'free' ? segment.tokens : 0), 0)
  // The bar is the room there is before compaction: what is in use, then what is free. The buffer is no
  // room, and no part of the bar.
  const isTight = free < (now.used + free) * TIGHT_SHARE
  const context = now.segments.filter(segment => segment.kind !== 'buffer').map(segment => ({ ...partOf(segment), isTight }))
  const contextFacts = [`${now.percent}%`, `${short(now.used)} / ${short(now.window)}`, free > 0 ? `${short(free)} free` : '']
  // With the plan's windows known, the cost is what was spent in each of them and in the plan's month,
  // each beginning again when its own does; the bar is the month's. The whole session is the ledger's
  // to say.
  const periods = money ? periodsOf(money) : []
  const period = periods.find(each => each.isPlan) ?? periods[0]
  const split = bill ? spendParts(period ? { main: period.main, agents: period.agents, folded: 0 } : bill) : []
  // A part that spent nothing has no cell of the bar, but its entry under it.
  const spend = split.filter(part => part.weight > 0)
  const costFacts = money && bill
    ? [...(period ? periods.map(each => `${each.name} ${money$(each.total)}`) : [money$(bill.total)]), promptOf(money, bill)]
    : []

  if (inner >= FULL_COLUMNS) {
    const room = Math.min(TEXT_MAX, inner - GAP - Math.floor(inner * TRACK_SHARE))
    const track = inner - GAP - room
    // What a line may say after its label.
    const width = room - LABEL
    const model = lineOf('Model', [now.model, effort === null ? '' : `${capital(effort)} effort`], width, true)
    const steps = lineOf('Steps', (['today', 'week', 'month', 'year'] as const).map(period => `${capital(period)} ${count(mine[period].steps)}`), width, true)
    const contextBar: Section = {
      cells: cellsOf(context, track),
      beside: lineOf('Context', contextFacts, width, false),
      above: [],
      below: rows => {
        // The free run needs no entry: the line beside the bar says what is free.
        const chips = now.segments.filter(segment => segment.kind === 'used').map(segment => chipOf(partOf(segment), short(segment.tokens)))
        const sent = lineOf('', sentOf(now.last), width, true)
        // A legend that fits on one line leaves the other to the last request.
        const tight = sent.runs.length > 0 && rows > 1 ? wrapped(chips, width, rows - 1) : null

        return tight
          ? [...tight.map(runs => ({ label: '', runs })), sent]
          : legendOf(chips, [], width, rows).map(runs => ({ label: '', runs }))
      },
    }
    // What was spent before tracking is no window's.
    const before: Chip[] = bill && bill.before > 0 && !period
      ? [{ glyph: '', color: undefined, isDim: true, text: `Before tracking ${money$(bill.before)}`, weight: bill.before }]
      : []
    const costBar: Section[] = money && bill
      ? [{
          cells: cellsOf(spend, track),
          beside: lineOf('Cost', costFacts, width, false),
          above: [],
          below: rows => legendOf(split.map(part => chipOf(part, money$(part.weight))), before, width, rows).map(runs => ({ label: '', runs })),
          smiles: COST_SMILES,
        }]
      : []
    // A limit bar says what it has to say itself, so the line beside it is another's. The first limit
    // window stands first, the model beside it; the other limits stand last, the steps beside the first
    // of them (with one window alone, under it). With no window the model and the steps stand over the
    // first bar.
    const first = gauges.find(gauge => gauge.isWindow)
    const rest = gauges.filter(gauge => gauge !== first)
    const limit = (gauge: Gauge, beside: Line, under: Line[]): Section =>
      ({ cells: wordedCells(gauge, track), beside, above: [], below: () => under, isLimit: true })
    const sections: Section[] = [
      ...(first ? [limit(first, model, rest.length > 0 ? [] : [steps])] : []),
      contextBar,
      ...costBar,
      ...rest.map((gauge, i) => limit(gauge, first && i === 0 ? steps : { label: '', runs: [] }, [])),
    ]
    const header = first ? [] : [model, steps]
    const line = lineRow(Box, Text, Link, inner, isTerminal)

    // With fewer rows than all of it needs, the line gives way first; then the limit bars give up the free
    // rows over them, and the mascot keeps to the other bars; only then does the scene.
    for (const isLow of gauges.length > 0 ? [false, true] : [false]) {
      const rows = scene(Box, Text, isLow ? sections.map(section => (section.isLimit === true ? { ...section, isLow: true } : section)) : sections, header, track)

      for (const children of line ? [[...rows, line], rows] : [rows]) {
        if (children.length <= maxRows) {
          return Box({ flexDirection: 'column', paddingX: 1, children })
        }
      }
    }
  }

  const bars = [{ parts: context, facts: contextFacts }, ...(money ? [{ parts: spend, facts: costFacts }] : [])]

  return Box({ flexDirection: 'column', paddingX: 1, children: compact(Box, Text, inner, bars, gauges) })
}

// The scene and its readout, row by row: over each bar its two free rows, the mascot in them when it is
// on that bar; at the right of every row, a line. The lines beside the free rows are what the bar above
// still has to say (or, over the first bar, `header`), then what must stand right above this one. A bar
// drawn low has no free rows over it: the mascot does not come there, and beside it stands its own line
// or, when it has none, the next the bars above still have to say.
function scene(Box: Box, Text: Text, sections: Section[], header: Line[], track: number): RenderElement[] {
  const span = track - MASCOT_CELLS
  const walked = sections.filter(section => section.isLow !== true)
  const spot = spotOf(strides, walked.length, span)
  const on = walked[spot.bar]
  const isWalking = isMainWorking || background > 0
  const blank = (cells: number): RenderElement[] => (cells > 0 ? [Text({ children: ' '.repeat(cells) })] : [])
  const hasLine = (section: Section): boolean => section.beside.label !== '' || section.beside.runs.length > 0
  const rows: RenderElement[] = []
  let waiting = header

  sections.forEach((section, i) => {
    if (section.isLow === true) {
      const line = hasLine(section) ? section.beside : waiting[0]
      // What it has to say under it waits for the next free rows, after what waits already.
      waiting = [...(hasLine(section) ? waiting : waiting.slice(1)), ...section.below(LANES)]
      rows.push(Box({ flexDirection: 'row', children: [...runsOf(Text, section.cells), ...blank(GAP), ...(line ? written(Text, line) : [])] }))

      return
    }

    const open = LANES - section.above.length
    const lines = [...Array.from({ length: open }, (_, slot) => waiting[slot]), ...section.above]

    // The cells of the bar above that the mascot's head would stand right under: all of it but its arms.
    const overhead = sections[i - 1]?.cells.slice(spot.at + 1, spot.at + MASCOT_CELLS - 1) ?? []

    lines.forEach((line, lane) => {
      const left = section === on
        ? [...blank(spot.at), ...mascotRow(Text, section.cells[spot.at + MASCOT_MIDDLE], overhead, lane, isWalking, section.smiles ?? []), ...blank(span - spot.at + GAP)]
        : blank(track + GAP)
      rows.push(Box({ flexDirection: 'row', children: [...left, ...(line ? written(Text, line) : [])] }))
    })

    rows.push(Box({ flexDirection: 'row', children: [...runsOf(Text, section.cells), ...blank(GAP), ...written(Text, section.beside)] }))
    // What it still has to say has the free rows over the next bar; under a run of low bars, a row for
    // each of them that has no line of its own.
    const next = sections[i + 1]
    const after = sections.slice(i + 1)
    const lows = after.findIndex(later => later.isLow !== true)
    const beside = after.slice(0, lows < 0 ? after.length : lows).filter(later => !hasLine(later)).length
    waiting = section.below(!next ? LANES : next.isLow === true ? beside : LANES - next.above.length)
  })

  // What the last bar has to say goes under it.
  for (const line of waiting) {
    rows.push(Box({ flexDirection: 'row', children: [...blank(track + GAP), ...written(Text, line)] }))
  }

  return rows
}

// One row of the mascot (0 its face between its arms, 1 its legs), over the cell `under` its middle and
// with the cells `overhead` right over its head. `smiles` are the ones of the bar it is on.
function mascotRow(Text: Text, under: Cell | undefined, overhead: Cell[], row: number, isWalking: boolean, smiles: string[]): RenderElement[] {
  // A dim cell is the empty stretch of a bar: no part of anything.
  const part = under && under.color !== undefined && !under.isDim ? under.color : MASCOT_COLOR
  // Its head touches the bar above. A solid part of that bar in the colour it would take is the one thing
  // it must not look like.
  const color = overhead.some(cell => !cell.isDim && cell.glyph !== SHADE && cell.color === part) ? MASCOT_COLOR : part

  if (row === 0) {
    const face = under?.isTight === true ? FACE.strained : isWalking ? smileOf(strides, smiles) : FACE.asleep

    return [Text({ color, children: ARM }), Text({ color, inverse: true, children: face }), Text({ color, children: ARM })]
  }

  return [Text({ children: ' ' }), Text({ color, inverse: true, children: LEGS[isWalking ? strides % 2 : 0] ?? '' }), Text({ children: ' ' })]
}

// The smile after `steps` steps: each is worn for SMILE_STEPS steps, and every other one winks for a step
// halfway through.
function smileOf(steps: number, own: string[]): string {
  const turn = Math.floor(steps / SMILE_STEPS)
  const smiles = [...SMILES, ...own]

  if (turn % 2 === 1 && steps % SMILE_STEPS === SMILE_STEPS / 2) {
    return WINKS[Math.floor(turn / 2) % WINKS.length] ?? ''
  }

  return smiles[turn % smiles.length] ?? ''
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

// The line as drawn: what kind of note it is, in that kind's colour, a space, and the note right after
// it; then, of a story, its link, whole. Null with no line to draw: it is off, or nothing fits.
function lineRow(Box: Box, Text: Text, Link: Link, inner: number, isTerminal: boolean): RenderElement | null {
  const note = lineMode === 'off' ? null : noteAt(inner)

  if (note === null) {
    return null
  }

  const topic = TOPIC[note.topic]
  const text = fitted(note, inner)

  return Box({
    flexDirection: 'row',
    children: [
      Text({ color: topic.color, bold: true, children: `${topic.label} ` }),
      // A note that holds the line is said even where it does not fit: it ends where the band does.
      Text({ wrap: 'truncate-end', children: text ?? note.text }),
      // A terminal makes a link of an address it is shown; elsewhere it has to be given one.
      ...(note.href === undefined || text === null
        ? []
        : [Text({ children: ' ' }), isTerminal ? Text({ dimColor: true, children: note.href }) : Link({ href: note.href })]),
    ],
  })
}

// A note as it fits a line of `inner` cells after its label: whole; or, a story, its gist cut short to
// leave its link whole. Null when it does not fit.
function fitted(note: Note, inner: number): string | null {
  const room = inner - TOPIC[note.topic].label.length - 1 - (note.href === undefined ? 0 : note.href.length + 1)

  if (note.text.length <= room) {
    return note.text
  }

  return note.href !== undefined && room >= GIST_LEAST ? cut(note.text, room) : null
}

// A text at most `most` long: whole, or cut and marked as cut: at the end of a clause when one ends in
// the last quarter of the room, else at the end of a word, so that as much as can be is kept.
function cut(text: string, most: number): string {
  if (text.length <= most) {
    return text
  }

  const head = text.slice(0, most - 3)
  const clause = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '), head.lastIndexOf(' - '))
  const end = clause >= most * 0.75 ? clause : head.lastIndexOf(' ')

  return `${head.slice(0, end > 0 ? end : head.length).replace(/[ ,;:.-]+$/, '')}...`
}

// What the line says now: a note that holds it; else this turn's, which is the next of its kind (about
// AI, a joke, good news, by turns) that fits a line of `inner` cells and has not been said. A kind all
// said starts again; one with nothing that fits gives its turn to the next.
function noteAt(inner: number): Note | null {
  if (pinned !== null && strides < pinned.until) {
    return pinned.note
  }

  const turn = turnOf()

  if (shown !== null && shown.turn === turn && fitted(shown.note, inner) !== null) {
    return shown.note
  }

  for (let i = 0; i < ROUND.length; i += 1) {
    const kind = ROUND[(turn + i) % ROUND.length]
    const fitting = (kind === undefined ? [] : deck[kind]).filter(candidate => fitted(candidate, inner) !== null)
    const note = fitting.find(candidate => !told.includes(candidate.text)) ?? fitting[0]

    if (note) {
      if (told.includes(note.text)) {
        told = told.filter(text => !fitting.some(candidate => candidate.text === text))
      }

      told = [...told, note.text].slice(-TOLD_KEPT)
      shown = { turn, note }

      return note
    }
  }

  return null
}

// Which turn of the line it is: another every LINE_STEPS steps, so only while something runs.
function turnOf(): number {
  return Math.max(0, Math.floor((strides - lineFrom) / LINE_STEPS))
}

// A note that holds the line for a turn of its own: the turns after it begin when it ends.
function hold(note: Note): void {
  const turn = turnOf()
  pinned = { note, until: strides + LINE_STEPS }
  lineFrom = pinned.until - (turn + 1) * LINE_STEPS
}

// What this session has to say, kind by kind: what the feeds gave and what came with the mod, each
// shuffled with the session's own dice, then one of the one and one of the other by turns, so that what
// is fresh is not kept for last.
function shuffle(): void {
  const pick = seeded(seed)
  const mixed = (notes: Note[]): Note[] => {
    const pile = [...notes]

    for (let i = pile.length - 1; i > 0; i -= 1) {
      const j = Math.floor(pick() * (i + 1))
      const moved = pile[i]
      const other = pile[j]

      if (moved && other) {
        pile[i] = other
        pile[j] = moved
      }
    }

    return pile
  }
  const read = lineMode === 'live' ? fresh?.notes ?? [] : []
  const own: Record<Pile, Note[]> = {
    ai: AI_NOTES.map((text): Note => ({ topic: 'ai', text })),
    joke: JOKES.map((text): Note => ({ topic: 'joke', text })),
    news: [],
  }
  const dealt = (kind: Pile): Note[] => {
    const theirs = mixed(read.filter(note => note.topic === kind))
    const mine = mixed(own[kind])

    return Array.from({ length: Math.max(theirs.length, mine.length) }, (_, i) => [theirs[i], mine[i]]).flat().filter((note): note is Note => note !== undefined)
  }

  deck = { ai: dealt('ai'), joke: dealt('joke'), news: dealt('news') }
}

// What `/penny-patrol lines` answers: where the line reads from now, and how to have it otherwise.
function linesSaid(isUnknown: boolean): string {
  const feeds = [...new Set(FEEDS.map(feed => /^https:\/\/([^/]+)/.exec(feed.url(() => 0))?.[1] ?? ''))].join(', ')
  const now = lineMode === 'off'
    ? 'The line under the bars is off.'
    : lineMode === 'offline'
      ? 'The line under the bars says only what came with the mod; nothing is read from the web.'
      : `The line under the bars is live: what came with the mod, and ${fresh === null ? 'nothing read from the feeds yet' : `${count(fresh.notes.length)} notes read from the feeds ${span(Math.max(0, nowMs - fresh.at) / 1000)} ago`}. It says something else every ${LINE_STEPS / 60} minutes of work; the feeds are read again every ${REFRESH_MS / 60_000} minutes.`

  return [
    ...(isUnknown ? ['Say live, offline or off.'] : []),
    now,
    `/${COMMAND} lines live reads the feeds too (${feeds}), /${COMMAND} lines offline keeps to what came with the mod, /${COMMAND} lines off hides the line.`,
  ].join('\n')
}

// A prompt as the suggestions see it, and, when one is due, the suggestion: the first of what the
// figures say that has not been said; when all of it has, the round begins again. The figure it is about
// is watched from then on (see prove).
function noteAsk(text: string, seq: number): void {
  const prompt = text.trim()

  if (prompt === '' || prompt.startsWith('<task-notification')) {
    return
  }

  prompts += 1
  asked = [...asked, { nth: prompts, seq, words: prompt.split(/\s+/).length, chars: prompt.length, gapMs: endedAt === 0 ? 0 : Math.max(0, nowMs - endedAt), isAborted: false }].slice(-ASKED_KEPT)
  watches = watches.filter(watch => prompts - watch.nth <= WATCH_PROMPTS)

  if (lineMode === 'off' || prompts < coachAt) {
    return
  }

  const tips = adviceOf()
  const unsaid = tips.find(candidate => !said.includes(candidate.id))
  const tip = unsaid ?? tips[0]

  if (tip) {
    said = unsaid ? [...said, tip.id] : [tip.id]
    // What a turn's end noted is said once.
    noted = noted.filter(found => found.id !== tip.id)
    hold({ topic: 'you', text: tip.text })

    if (tip.watch) {
      const { figure, was } = tip.watch
      watches = [...watches.filter(watch => watch.figure !== figure), { figure, was, at: nowMs, nth: prompts, seq, usd: ledger?.seen ?? 0, agents: ledger ? spentOf(ledger).agents : 0 }]
      // From here on it is this suggestion that a shorter conversation would answer.
      eased = figure === 'context' ? null : eased
    }
  }

  coachAt = prompts + COACH_LEAST + Math.floor(chance() * COACH_SPREAD)
}

// What the turn that just ended is worth a word about, kept until a suggestion is due: a prompt that
// cost several times what this session's usually do, and one that, after a break, wrote the whole
// conversation to the prompt cache again.
function noteTurn(): void {
  const ask = asked.at(-1)
  const turn = ledger?.turns.at(-1)

  if (!ledger || !ask || !turn || turn.seq !== ask.seq) {
    return
  }

  const found: Tip[] = []
  const rows = ledger.seen > 0 ? billOf(ledger).rows : []
  const row = rows.find(candidate => candidate.turn === turn)
  const others = rows.filter(candidate => candidate.turn !== turn)
  const usual = others.reduce((sum, other) => sum + other.amount, 0) / Math.max(1, others.length)

  if (row && others.length >= 3 && row.amount >= 100 && row.amount >= usual * 3) {
    found.push({
      id: 'dear',
      weight: row.amount,
      text: `One prompt cost ${money$(row.amount)}, ${Math.round(row.amount / Math.max(1, usual))} times this session's usual ${money$(Math.round(usual))}. Point Claude at the files and lines that matter, not the whole tree.`,
      watch: { figure: 'dear', was: row.amount },
    })
  }

  const recached = turn.tokens.cacheWrite

  if (reading && ask.gapMs >= COLD_GAP_MS && recached >= 30_000 && recached >= reading.used * 0.6) {
    found.push({
      id: 'cold',
      weight: recached,
      text: `After a ${span(ask.gapMs / 1000)} break, one prompt wrote ${short(recached)} tokens to the prompt cache again${row && row.amount > 0 ? ` and cost ${money$(row.amount)}` : ''}. /compact before you step away: the way back writes only what is left.`,
      watch: { figure: 'cold', was: recached },
    })
  }

  for (const tip of found) {
    // Of two of a kind not yet said, the weightier is the one to say.
    if ((noted.find(old => old.id === tip.id)?.weight ?? 0) <= (tip.weight ?? 0)) {
      noted = [...noted.filter(old => old.id !== tip.id), tip]
      said = said.filter(id => id !== tip.id)
    }
  }
}

// Looks at the figures the suggestions made were about and, when one has moved the way its suggestion
// meant, says so on the line: one at a time, the oldest first, each once.
function prove(): void {
  if (lineMode === 'off') {
    return
  }

  for (const watch of watches) {
    const text = proofOf(watch)

    if (text !== null) {
      watches = watches.filter(other => other !== watch)
      hold({ topic: 'you', text: `${SHOWN}${text}` })

      return
    }
  }
}

// What has become of the figure a suggestion was about: said only when it is better than it was, and
// there has been enough since to tell (of the context: a compaction or /clear). Null otherwise.
function proofOf(watch: Watch): string | null {
  const { figure, was } = watch
  const asks = asked.filter(ask => ask.nth > watch.nth)
  // A turn still running has not shown how it goes, or what it costs.
  const ended = isMainWorking ? asks.filter(ask => ask !== asked.at(-1)) : asks
  const running = isMainWorking ? ledger?.turns.at(-1) : undefined
  const rows = ledger !== null && ledger.seen > 0 ? billOf(ledger).rows.filter(row => row.turn.seq > watch.seq && row.turn !== running) : []

  if (figure === 'context' || figure === 'mcp' || figure === 'memory') {
    const now = reading === null ? null : figure === 'context' ? reading.used : figure === 'mcp' ? reading.mcp.tokens : reading.memory.tokens

    // The context is an estimate that moves by itself: it shows something only once the conversation was
    // in fact made shorter.
    if (now === null || now >= was || (figure === 'context' && eased === null)) {
      return null
    }

    // Figures that round alike are said in full.
    const [before, after] = short(was) === short(now) ? [count(was), count(now)] : [short(was), short(now)]
    const less = shareOf(was - now, was)

    return figure === 'context'
      ? `after ${eased ?? 'that'} the context went from ${before} to ${after} tokens, so every request from here sends ${less} less.`
      : `${figure === 'mcp' ? 'MCP tools' : 'memory files'} are ${after} tokens of every request now, down from ${before}: ${less} less.`
  }

  if (figure === 'stopped') {
    const stopped = ended.filter(ask => ask.isAborted).length

    return ended.length >= 4 && stopped / ended.length < was
      ? `you stopped ${stopped === 0 ? 'none' : stopped} of the ${ended.length} turns since, against ${Math.round(was * 100)}% of those before.`
      : null
  }

  if (figure === 'dear') {
    const dearest = Math.max(0, ...rows.map(row => row.amount))

    return rows.length >= 4 && dearest < was ? `the dearest of the ${rows.length} prompts since cost ${money$(dearest)}, against ${money$(was)} for that one.` : null
  }

  if (figure === 'cold') {
    const back = [...ended].reverse().find(ask => ask.gapMs >= COLD_GAP_MS)
    const wrote = back === undefined ? undefined : ledger?.turns.find(turn => turn.seq === back.seq)?.tokens.cacheWrite

    return back !== undefined && wrote !== undefined && wrote < was
      ? `back after ${span(back.gapMs / 1000)}, the prompt wrote ${short(wrote)} tokens to the cache again, against ${short(was)} the time before.`
      : null
  }

  if (figure === 'agents') {
    // By what was spent since, whichever prompt a subagent's spend belongs to.
    const spent = (ledger?.seen ?? 0) - watch.usd
    const theirs = ledger ? spentOf(ledger).agents - watch.agents : 0

    return ended.length >= 3 && spent >= 0.01 && theirs / spent < was
      ? `subagents were ${Math.round((theirs / spent) * 100)}% of the ${dollars(spent)} spent since, against ${Math.round(was * 100)}% before.`
      : null
  }

  if (figure === 'terse') {
    const words = asks.reduce((sum, ask) => sum + ask.words, 0) / Math.max(1, asks.length)

    return asks.length >= 5 && words > was ? `your ${asks.length} prompts since averaged ${Math.round(words)} words, against ${Math.max(1, Math.round(was))} before.` : null
  }

  if (figure === 'pasted') {
    const long = asks.filter(ask => ask.chars >= 3_000).length

    return asks.length >= 5 && long / asks.length < was
      ? `${long === 0 ? 'none' : long} of your ${asks.length} prompts since ${long <= 1 ? 'was' : 'were'} over 3,000 characters, against ${Math.round(was * 100)}% of those before.`
      : null
  }

  if (figure.startsWith('limit-')) {
    const kind = figure.slice('limit-'.length)
    const pace = paceOf(kind, watch.at)
    const name = WINDOW_NAME[kind] ?? capital(kind.replace(/_/g, ' '))

    if (pace === null || pace >= was) {
      return null
    }

    return pace > 0 ? `the ${name} limit is going at ${rateOf(pace)} an hour now, down from ${rateOf(was)}.` : `the ${name} limit has not moved since, against ${rateOf(was)} an hour before.`
  }

  return null
}

// A reading of the limits, added to each window's trail. A window less used than it was has begun again:
// its trail starts over, and nothing more is to be shown of the one that ended.
function noteTrail(): void {
  if (limits === null) {
    return
  }

  for (const window of limits.windows) {
    const samples = trail[window.kind] ?? []
    const last = samples.at(-1)

    if (last && window.percentUsed < last.used) {
      trail[window.kind] = [{ at: limits.at, used: window.percentUsed }]
      watches = watches.filter(watch => watch.figure !== `limit-${window.kind}`)
    } else if (!last || window.percentUsed > last.used) {
      trail[window.kind] = [...samples, { at: limits.at, used: window.percentUsed }].slice(-TRAIL_KEPT)
    }
  }
}

// How fast a limit window is going, in points of it an hour, since the time `from` (or since its first
// reading, when that is later): null until there is PACE_MIN_MS to take it over.
function paceOf(kind: string, from: number): number | null {
  const samples = trail[kind] ?? []
  const base = [...samples].reverse().find(sample => sample.at <= from) ?? samples[0]
  const last = samples.at(-1)

  if (!base || !last) {
    return null
  }

  const since = Math.max(base.at, from)

  return nowMs - since < PACE_MIN_MS ? null : ((last.used - base.used) / (nowMs - since)) * 3_600_000
}

// 9.46 -> "9.5%", 12.3 -> "12%": points of a limit window an hour.
function rateOf(pace: number): string {
  return `${pace >= 10 ? Math.round(pace) : pace.toFixed(1)}%`
}

// A share as a percentage, to as many places as it takes to show: "12%", "1.4%", "0.03%", "0.004%".
function shareOf(part: number, whole: number): string {
  const percent = whole > 0 ? (part / whole) * 100 : 0

  if (percent > 0 && percent < 0.001) {
    return 'under 0.001%'
  }

  return `${percent.toFixed(percent >= 10 ? 0 : percent >= 1 ? 1 : percent >= 0.1 ? 2 : 3)}%`
}

// What this session's own figures suggest, the most pressing first: the window, the limits, what every
// request carries, how the turns went, what a turn's end noted, where the money went, how the prompts
// were put. Each says what to do and, in this session's own figures, what doing it moves; `watch` is that
// figure, so that the line can say when it has moved. The last is a plain account of the session, so
// there is always something true to say.
function adviceOf(): Tip[] {
  const tips: Tip[] = []
  const recent = asked.slice(-8)
  const bill = ledger !== null && ledger.seen > 0 ? billOf(ledger) : null
  const asks = ledger ? Math.max(prompts, ledger.nextSeq - 1) : prompts
  // The conversation itself is what /compact shortens and /clear drops: the rest is sent whatever is done.
  const messages = reading?.segments.find(segment => /^messages$/i.test(segment.name))?.tokens ?? 0
  const rest = reading ? Math.max(0, reading.used - messages) : 0
  const context = reading ? { watch: { figure: 'context', was: reading.used } } : {}

  if (reading && reading.percent >= 80) {
    tips.push({
      id: 'full',
      text: messages > 0
        ? `Context is ${reading.percent}% full, ${short(messages)} of it messages. /compact swaps those for a summary: the bar would fall toward ${Math.round((rest / reading.window) * 100)}%, and every request sends that much less.`
        : `Context is ${reading.percent}% full: every request sends all ${short(reading.used)} tokens again. /compact now, or /clear if the task has changed.`,
      ...context,
    })
  }

  for (const window of limits?.windows ?? []) {
    const left = Math.max(0, 100 - window.percentUsed)
    const until = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt) - nowMs

    if (left <= 25 && until > 30 * 60_000) {
      const name = WINDOW_NAME[window.kind] ?? capital(window.kind.replace(/_/g, ' '))
      const pace = paceOf(window.kind, nowMs - TRAIL_MS)
      const lasts = pace !== null && pace > 0 ? (left / pace) * 3_600_000 : Infinity

      tips.push(pace !== null && lasts < until
        ? {
            id: `limit-${window.kind}`,
            text: `${name} limit: ${Math.round(left)}% left, going at ${rateOf(pace)} an hour: gone in ${span(lasts / 1000)}, ${span((until - lasts) / 1000)} before it resets. Keep the big asks for after the reset.`,
            watch: { figure: `limit-${window.kind}`, was: pace },
          }
        : { id: `limit-${window.kind}`, text: `${name} limit: ${Math.round(left)}% left for the next ${span(until / 1000)}. Put the small asks into one prompt, and keep the big ones for after the reset.` })
    }
  }

  if (reading && reading.mcp.tokens >= 10_000) {
    tips.push({
      id: 'mcp',
      text: `MCP tools are ${short(reading.mcp.tokens)} tokens of every request, ${short(reading.mcp.topTokens)} of them from "${reading.mcp.top}". /mcp switches a server off: without that one, every request is ${short(reading.mcp.topTokens)} lighter.`,
      watch: { figure: 'mcp', was: reading.mcp.tokens },
    })
  }

  if (reading && reading.memory.tokens >= 6_000) {
    tips.push({
      id: 'memory',
      text: `Memory files are ${short(reading.memory.tokens)} tokens of every request; ${reading.memory.top} is ${short(reading.memory.topTokens)} of them. /memory opens it: each 1k you cut comes off every request from then on.`,
      watch: { figure: 'memory', was: reading.memory.tokens },
    })
  }

  const stopped = recent.filter(ask => ask.isAborted)

  if (recent.length >= 5 && stopped.length >= 3) {
    const lost = (bill?.rows ?? []).filter(row => stopped.some(ask => ask.seq === row.turn.seq)).reduce((sum, row) => sum + row.amount, 0)
    tips.push({
      id: 'stopped',
      text: `You stopped ${stopped.length} of your last ${recent.length} turns${lost > 0 ? `, ${money$(lost)} into them` : ''}. Plan mode (Shift+Tab) shows the approach before anything is done: say no there instead.`,
      watch: { figure: 'stopped', was: stopped.length / recent.length },
    })
  }

  tips.push(...noted)

  if (bill) {
    const itemised = bill.main + bill.agents

    if (bill.agents >= 100 && bill.agents >= itemised * 0.4) {
      const runs = bill.rows.reduce((sum, row) => sum + row.ids.length, 0)
      tips.push({
        id: 'agents',
        text: `Subagents are ${Math.round((bill.agents / itemised) * 100)}% of what this session has spent: ${money$(bill.agents)}${runs > 1 ? ` over ${count(runs)} runs, ${money$(Math.round(bill.agents / runs))} a run` : ''}. For a small lookup, ask Claude to do it inline.`,
        watch: { figure: 'agents', was: bill.agents / itemised },
      })
    }
  }

  const latest = asked.slice(-6)
  const words = latest.reduce((sum, ask) => sum + ask.words, 0) / Math.max(1, latest.length)

  if (latest.length === 6 && words <= 5) {
    tips.push({
      id: 'terse',
      text: `Your last 6 prompts averaged ${Math.max(1, Math.round(words))} words. Name the file, the goal and what done looks like: one clear ask beats three corrections.`,
      watch: { figure: 'terse', was: words },
    })
  }

  const pasted = recent.filter(ask => ask.chars >= 3_000)

  if (pasted.length >= 2) {
    // About four characters to a token.
    const carried = Math.round(pasted.reduce((sum, ask) => sum + ask.chars, 0) / 4)
    tips.push({
      id: 'pasted',
      text: `${pasted.length} of your last ${recent.length} prompts were over 3,000 characters: about ${short(carried)} tokens that every later request sends again. Put a long log in a file and point Claude at it.`,
      watch: { figure: 'pasted', was: pasted.length / recent.length },
    })
  }

  if (reading && asks >= 30 && reading.percent >= 50) {
    tips.push({
      id: 'long',
      text: `${count(asks)} prompts in this conversation, and every request now sends ${short(reading.used)} tokens. A new task? /clear starts it ${messages > 0 ? `at about ${short(rest)}` : 'light'} and keeps your memory files.`,
      ...context,
    })
  }

  if (reading && messages >= 20_000) {
    tips.push({
      id: 'clear',
      text: `Every request sends all ${short(reading.used)} tokens of this conversation again. When the task changes, /clear: the next one sends about ${short(rest)}.`,
      ...context,
    })
  }

  if (bill && bill.rows.length > 0) {
    const itemised = bill.rows.reduce((sum, row) => sum + row.amount, 0)
    tips.push({ id: 'tally', text: `${count(bill.rows.length)} ${bill.rows.length === 1 ? 'prompt' : 'prompts'} so far for ${money$(itemised)}: ${money$(Math.round(itemised / bill.rows.length))} each on average. /${COMMAND} costs says what each one cost, and why.` })
  } else if (reading && tips.length === 0) {
    tips.push({ id: 'window', text: `The window is ${reading.percent}% in use. /context shows what is filling it, category by category.` })
  }

  return tips
}

// What the Claude Code changelog says was added, release by release, newest first. The read is of the
// file's head, so its last line may be cut short: it is left out.
function newInClaudeCode(body: string): Note[] {
  const notes: Note[] = []
  let version = ''

  for (const line of body.split('\n').slice(0, -1)) {
    const heading = /^## (\d+\.\d+\.\d+)/.exec(line)

    if (heading) {
      version = heading[1] ?? ''
      continue
    }

    const added = /^- Added (.+)$/.exec(line)

    if (version === '' || !added || PLUMBING.test(line)) {
      continue
    }

    const text = tidy(`New in Claude Code ${version}: ${added[1] ?? ''}`)

    if (text !== null) {
      notes.push({ topic: 'ai', text, href: CHANGELOG_PAGE })
    }
  }

  return notes
}

function dadJokes(body: string): Note[] {
  const results = (parsed(body) as { results?: unknown } | undefined)?.results

  return (Array.isArray(results) ? results as Array<{ joke?: unknown }> : []).flatMap(row => jokeOf(typeof row.joke === 'string' ? row.joke : ''))
}

function codeJokes(body: string): Note[] {
  const jokes = (parsed(body) as { jokes?: unknown } | undefined)?.jokes

  return (Array.isArray(jokes) ? jokes as Array<{ joke?: unknown; setup?: unknown; delivery?: unknown }> : []).flatMap(row =>
    jokeOf(typeof row.joke === 'string' ? row.joke : typeof row.setup === 'string' && typeof row.delivery === 'string' ? `${row.setup} ${row.delivery}` : ''),
  )
}

function jokeOf(raw: string): Note[] {
  const text = tidy(raw)

  return text === null || NOT_FUNNY.test(text) ? [] : [{ topic: 'joke', text }]
}

// An outlet's feed (RSS or Atom) as notes: of each story the gist its own summary gives, never its
// headline, and its link, the short one a feed gives for a post where it does. `isLead` says the summary
// is the story's opening lines, not a summary written as one.
function stories(topic: Pile, host: string, isLead: boolean, body: string): Note[] {
  // Of the opening lines of a story about AI, the sentence must name someone or a figure: an essay opens
  // with neither. Good news is told big or small, named or not.
  const mustName = isLead && topic === 'ai'

  return [...body.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/g)].flatMap((found): Note[] => {
    const item = found[0]
    const title = plainOf(/<title\b[^>]*>([\s\S]*?)<\/title>/.exec(item)?.[1] ?? '')
    const text = gistOf(/<(description|summary)\b[^>]*>([\s\S]*?)<\/\1>/.exec(item)?.[2] ?? '', title, isLead, mustName)
    const href = [
      /<(guid|id)\b[^>]*>\s*(https:\/\/[^\s<]+\/\?p=\d+)\s*<\/\1>/.exec(item)?.[2],
      /<link>\s*(https:\/\/[^\s<]+)\s*<\/link>/.exec(item)?.[1],
      /<link\b[^>]*\bhref="(https:\/\/[^"\s]+)"/.exec(item)?.[1],
    ].map(link => link?.replace(/&amp;/g, '&')).find(link => link !== undefined && isOf(link, host))

    if (text === null || href === undefined || ABOUT_ITSELF.test(title) || [title, text].some(said => GRIM.test(said) || HEATED.test(said))) {
      return []
    }

    return [{ topic, text, href }]
  })
}

// Whether a link is one the line may show for an outlet: its own, plain, and no longer than a link may be.
function isOf(link: string, host: string): boolean {
  const site = /^https:\/\/([^/?#]+)/.exec(link)?.[1] ?? ''

  return (site === host || site.endsWith(`.${host}`)) && link.length <= LINK_MAX && /^[!-~]+$/.test(link)
}

// The gist of a story, from the summary its feed gives of it. Of a summary written as one: as many of
// its sentences, from the first, as fit and are about the story. Of a story's opening lines: the first
// sentence that stands by itself (and, where `mustName`, names someone, somewhere or a figure). Either
// is cut short when it is too long (see cut).
// Null with nothing that can stand for the story: a headline is no gist.
function gistOf(summary: string, title: string, isLead: boolean, mustName: boolean): string | null {
  const plain = plainOf(summary)
    .replace(/\s*The (post|article) .{0,300}? (appeared first|first appeared) on .{0,80}$/, '')
    .replace(/^BY THE [A-Z ]+ TEAM\s*/, '')
    .replace(/\s*\[\s*[.]{3}\s*\]\s*$/, '...')
  const bare = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const sentences = sentencesOf(plain)
  const isDull = (sentence: string, nth: number): boolean =>
    sentence.split(' ').length < 6
    || sentence.startsWith('(')
    || sentence.endsWith('?')
    || NOT_A_GIST.test(sentence)
    || SELF.test(sentence)
    || DANGLES.test(sentence)
    || bare(sentence) === bare(title)
    || LEANS.test(sentence)
    || (nth > 0 && (LEANS_LATER.test(sentence) || POINTS_BACK.test(sentence)))
    || (SCENE.test(sentence) && !/\d/.test(sentence))
    || (sentence.endsWith('...') && (SUBORDINATE.test(sentence) || sentence.length < CUT_SHORT))
  // A figure, a capital after the first word, or a first word that is a name by its looks.
  const isNamed = (shown: string): boolean => /\d/.test(shown) || /[\s"'(-](?!I\b)[A-Z][A-Za-z]/.test(shown) || /^[A-Z][a-z]*[A-Z]|^[A-Z][A-Za-z]+'s\b/.test(shown)
  const first = sentences[0]
  let picked: string | undefined

  if (isLead) {
    picked = sentences.slice(0, 3).find((sentence, nth) => !isDull(sentence, nth) && (!mustName || isNamed(cut(sentence, GIST_MAX))))
  } else if (first !== undefined && !isDull(first, 0)) {
    picked = first

    for (const sentence of sentences.slice(1)) {
      if (`${picked} ${sentence}`.length > GIST_MAX || sentence.endsWith('?') || NOT_A_GIST.test(sentence) || SELF.test(sentence)) {
        break
      }

      picked = `${picked} ${sentence}`
    }
  }

  return picked === undefined ? null : tidy(cut(picked, GIST_MAX), NOTE_MIN, GIST_MAX)
}

// A text as its sentences. A stop ends one only before a capital, a figure or a quotation, and not after
// a title, an initial or the like.
function sentencesOf(text: string): string[] {
  const sentences: string[] = []
  let start = 0

  for (const stop of text.matchAll(/[.!?]+["')\]]*\s+(?=["'([]?[A-Z0-9])/g)) {
    const at = stop.index ?? 0
    const before = /([A-Za-z.]*)$/.exec(text.slice(start, at))?.[1] ?? ''

    if (stop[0].startsWith('.') && ABBREVIATED.test(before)) {
      continue
    }

    sentences.push(text.slice(start, at + stop[0].trimEnd().length))
    start = at + stop[0].length
  }

  return start < text.length ? [...sentences, text.slice(start)] : sentences
}

// Text from a feed made fit to draw on one line (see plainOf). Null when anything is left that is not a
// printable Latin character (so no escape ever reaches the terminal, and a character is a cell) or that
// is still an entity, or when what is left is shorter than `least` or longer than `most`: a note's bounds,
// unless told otherwise.
function tidy(raw: string, least = NOTE_MIN, most = NOTE_MAX): string | null {
  const plain = plainOf(raw)

  return /^[\x20-\x7E\u00A1-\u024F]*$/.test(plain) && !/&#?[a-z0-9]+;/i.test(plain) && plain.length >= least && plain.length <= most ? plain : null
}

// A feed's text on one line, without its markup and entities and with its typography made plain. A feed
// may escape its markup once more, so that is taken off twice.
function plainOf(raw: string): string {
  return unmarked(unmarked(raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')))
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // A dash between words keeps them apart; a hyphen joins them.
    .replace(/\s*[\u2013\u2014\u2015]\s*/g, ' - ')
    .replace(/[\u2010-\u2012\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[`\u00A0\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unmarked(text: string): string {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => charOf(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => charOf(parseInt(code, 16)))
    .replace(/&([a-z]+);/g, (whole: string, name: string) => ENTITY[name] ?? whole)
}

function charOf(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
}

function parsed(body: string): unknown {
  try {
    return JSON.parse(body) as unknown
  } catch {
    return undefined
  }
}

// What a session kept of the feeds, read back as carefully as the feeds themselves: the file is anyone's
// to edit. One kept in another format is of no use here: the feeds are read anew.
function freshOf(value: unknown): Fresh | null {
  const v = value as { format?: unknown; at?: unknown; notes?: unknown } | null | undefined

  if (typeof v !== 'object' || v === null || v.format !== FORMAT || typeof v.at !== 'number' || !Array.isArray(v.notes)) {
    return null
  }

  const notes = (v.notes as Array<Partial<Note> | null>).flatMap((note): Note[] => {
    const text = typeof note?.text === 'string' ? tidy(note.text) : null

    if (!note || text === null || (note.topic !== 'ai' && note.topic !== 'joke' && note.topic !== 'news')) {
      return []
    }

    return [{ topic: note.topic, text, ...(typeof note.href === 'string' && /^https:\/\/[!-~]+$/.test(note.href) && note.href.length <= LINK_MAX ? { href: note.href } : {}) }]
  })

  return { at: v.at, notes }
}

// Dice that fall the same way for the same seed.
function seeded(from: number): () => number {
  let state = from >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed

    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

function seedOf(text: string, salt: number): number {
  let hash = salt >>> 0

  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16_777_619) >>> 0
  }

  return hash
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

// A limit bar with what it says written in it, a cell in from its left: its title and what is left, at
// the greatest length that fits, with a cell of the bar's own ground after it too.
function wordedCells(gauge: Gauge, width: number): Cell[] {
  const said = [`${gauge.title} · ${gauge.label}`, `${gauge.title} · ${gauge.short}`, `${gauge.name} · ${gauge.short}`, gauge.short, gauge.name]
    .find(candidate => candidate.length + 2 <= width)
  const words = said === undefined ? '' : ` ${said} `

  return cellsOf(gauge.parts, width).map((cell, i): Cell => {
    const glyph = words[i]

    return glyph === undefined ? cell : { ...cell, glyph, isWord: true }
  })
}

// How a cell of a bar is drawn. Every cell is BACKGROUND, so a bar is one height along its length whatever
// the terminal's line spacing, and the mascot stands on it: a part in its own colour, what is free or gone
// in the track's black, each with its block glyph in that same colour (a copy of the band still carries
// it). A shaded part shows its glyph over the track. A word written in the bar is cut out of a part, and
// stands white over the track.
function paintOf(cell: Cell): { backgroundColor: string; color?: string } {
  if (cell.isDim || cell.color === undefined) {
    return { backgroundColor: TRACK, color: cell.isWord === true ? TRACK_WORD : TRACK }
  }

  if (cell.glyph === SHADE) {
    return { backgroundColor: TRACK, color: cell.color }
  }

  return { backgroundColor: cell.color, color: cell.isWord === true ? WORD : cell.color }
}

// Cells drawn alike, side by side, are one Text.
function runsOf(Text: Text, cells: Cell[]): RenderElement[] {
  const runs: RenderElement[] = []
  let start = 0

  for (let i = 1; i <= cells.length; i += 1) {
    const from = cells[start]
    const to = cells[i]

    if (from) {
      const paint = paintOf(from)
      const next = to ? paintOf(to) : null

      if (next === null || next.backgroundColor !== paint.backgroundColor || next.color !== paint.color) {
        runs.push(Text({ ...paint, children: cells.slice(start, i).map(cell => cell.glyph).join('') }))
        start = i
      }
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

  return [`Last request: ${short(sent)} in (${short(last.cache_read_input_tokens)} cached)`, `${short(last.output_tokens)} out`]
}

// What the current prompt has cost so far, in the cents the ledger gives it.
function promptOf(money: Ledger, bill: Bill): string {
  const last = money.turns.at(-1)

  return last ? `This prompt ${money$(bill.rows.find(row => row.turn === last)?.amount ?? 0)}` : ''
}

// One category, in the theme colour /context draws it in.
function partOf(segment: Segment): Part {
  return { name: segment.name, weight: segment.tokens, glyph: GLYPH[segment.kind], color: segment.color, isDim: segment.kind === 'free' }
}

// The limit bars. A window the account reports is shown by what is LEFT of it, draining. With no window
// (an account billed by the API) the month's spend stands in: draining the budget when one is set, and
// growing against the next round figure when none is. A set budget has its bar under the windows' too.
function gaugesOf(monthSpend: number, hasMoney: boolean): Gauge[] {
  const gauges = (limits?.windows ?? []).map((window): Gauge => {
    const left = Math.max(0, Math.min(100, 100 - window.percentUsed))
    const until = window.resetsAt === undefined ? NaN : Date.parse(window.resetsAt) - nowMs
    const reset = Number.isNaN(until) ? '' : until > 0 ? ` · Resets in ${span(until / 1000)}` : ' · Reset due'
    const name = WINDOW_NAME[window.kind] ?? capital(window.kind.replace(/_/g, ' '))

    return {
      name,
      title: `${name} limit`,
      isWindow: true,
      parts: drain(left, 100 - left),
      label: `${Math.round(left)}% left${reset}`,
      short: `${Math.round(left)}% left`,
    }
  })

  if (budget !== null) {
    const left = Math.max(0, budget - monthSpend)
    gauges.push({
      name: 'Month',
      title: 'Month budget',
      isWindow: false,
      parts: drain(left, budget - left),
      label: `${dollars(left)} left of ${dollars(budget)}`,
      short: `${dollars(left)} left`,
    })
  } else if (gauges.length === 0 && hasMoney) {
    // No ceiling is known: the bar fills toward the next round figure, then starts on the one after.
    const ceiling = roundAbove(monthSpend)
    gauges.push({
      name: 'Month',
      title: 'Month',
      isWindow: false,
      parts: [
        { name: 'spent', weight: monthSpend, glyph: '█', color: 'permission', isDim: false },
        { name: 'room', weight: ceiling - monthSpend, glyph: '░', color: 'inactive', isDim: true },
      ].filter(part => part.weight > 0),
      label: `${dollars(monthSpend)} spent · Bar full at ${dollars(ceiling)}`,
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

// Who spent what the ledger saw being spent: the main conversation and its subagents, both always, so
// that neither is missed for having spent nothing; and the earlier prompts, where there are any. (The
// mascot's colour is left to the mascot.)
function spendParts(bill: Pick<Bill, 'main' | 'agents' | 'folded'>): Part[] {
  return [
    { name: 'Main', weight: bill.main, glyph: '█', color: 'permission', isDim: false },
    { name: 'Subagents', weight: bill.agents, glyph: '█', color: 'cyan_FOR_SUBAGENTS_ONLY', isDim: false },
    ...(bill.folded > 0 ? [{ name: 'Earlier prompts', weight: bill.folded, glyph: '▒', color: 'inactive', isDim: false }] : []),
  ]
}

// The ledger as text: the session's total reconciled to the cent, then every prompt and what it used.
function statement(money: Ledger): string {
  const bill = billOf(money)
  const itemised = bill.total - bill.before - bill.folded
  const lines = bill.rows.flatMap((row, i) => [
    `${String(i + 1).padStart(3)}. ${money$(row.amount).padStart(9)}  ${row.turn.label}`,
    `${' '.repeat(16)}Main ${money$(row.shares[0] ?? 0)}${usedBy(row.turn.tokens, row.turn.model)}`,
    ...row.ids.map((id, j) => {
      const note = money.agents[id]
      const what = note && note.description !== '' ? ` "${note.description.slice(0, 50)}"` : ''

      return `${' '.repeat(16)}${note?.type || 'Subagent'}${what} ${money$(row.shares[j + 1] ?? 0)}${note ? usedBy(note.tokens, note.model) : ''}`
    }),
  ])
  const most = Math.max(0, ...bill.rows.map(row => row.amount))
  const rate = money.steps > 0 && itemised > 0 ? ` · ${dollars(itemised / 100 / (money.steps / 3600))}/h while working` : ''
  const asks = bill.rows.length
  const totals = calendar(nowMs, everyDays())

  return [
    `Session total reported by Claude Code: ${money$(bill.total)}`,
    ...periodsOf(money).map(period => period.isPlan
      ? `  ${'This plan month:'.padEnd(18)}${money$(period.total)}  (seen spent since ${dayMonth(planOf(nowMs).from)}: the band's cost bar. /${COMMAND} plan <day> says which day your plan renews on)`
      : `  ${`This ${period.name} window:`.padEnd(18)}${money$(period.total)}  (seen spent since it began, or since this session first met it)`),
    `  Itemised below:   ${money$(itemised)}`,
    ...(money.folded.prompts > 0 ? [`  Earlier prompts:  ${money$(bill.folded)}  (${count(money.folded.prompts)} prompts older than the ${MAX_TURNS} kept line by line)`] : []),
    `  Before tracking:  ${money$(bill.before)}  (spent before this ledger first looked; cannot be itemised)`,
    `  Unaccounted:      ${money$(bill.total - bill.before - bill.folded - bill.rows.reduce((sum, row) => sum + row.amount, 0))}`,
    `  Working time:     ${stepsOf(money.steps)} (${span(money.steps)})${rate}`,
    `  Prompts:          ${asks}${asks > 0 ? ` · Average ${money$(Math.round(itemised / asks))} · Most expensive ${money$(most)}` : ''}`,
    `  This machine:     Steps today ${count(totals.today.steps)} · Week ${count(totals.week.steps)} · Month ${count(totals.month.steps)} · Year ${count(totals.year.steps)}`,
    `                    Spend today ${dollars(totals.today.usd)} · Week ${dollars(totals.week.usd)} · Month ${dollars(totals.month.usd)} · Year ${dollars(totals.year.usd)}`,
    '',
    ...lines,
  ].join('\n')
}

// The figures checked against each other: what must agree, and whether it does.
function audit(): string {
  const lines: string[] = []
  const check = (isRight: boolean, what: string): void => {
    lines.push(`${isRight ? 'OK  ' : 'OFF '} ${what}`)
  }

  if (reading) {
    const inUse = reading.segments.filter(segment => segment.kind === 'used').reduce((sum, segment) => sum + segment.tokens, 0)
    const all = reading.segments.reduce((sum, segment) => sum + segment.tokens, 0)
    check(inUse === reading.used, `Context: the categories in use add up to ${count(inUse)}; Claude Code reports ${count(reading.used)} in use`)
    // These two are Claude Code's own rounding, so a hair's difference is not a fault of the bar's.
    check(Math.abs(all - reading.window) <= reading.window / 1000, `Context: in use, free and buffer add up to ${count(all)}; the window is ${count(reading.window)}`)
    const filled = (reading.used / reading.window) * 100
    check([Math.floor(filled), Math.round(filled)].includes(reading.percent), `Context: ${count(reading.used)} of ${count(reading.window)} is ${reading.percent}%`)

    if (reading.last) {
      const sent = reading.last.input_tokens + reading.last.cache_read_input_tokens + reading.last.cache_creation_input_tokens
      lines.push(`Note the last request sent ${count(sent)} tokens in (${count(reading.last.input_tokens)} new, ${count(reading.last.cache_read_input_tokens)} read from the cache, ${count(reading.last.cache_creation_input_tokens)} written to it) and got ${count(reading.last.output_tokens)} out; the bar's total is Claude Code's estimate for the next one`)
    }
  } else {
    lines.push('Note no reading of the context window yet')
  }

  if (ledger) {
    const bill = billOf(ledger)
    const listed = bill.rows.reduce((sum, row) => sum + row.amount, 0)
    check(listed + bill.folded + bill.before === bill.total, `Cost: prompts ${money$(listed)} + earlier ${money$(bill.folded)} + before tracking ${money$(bill.before)} = ${money$(listed + bill.folded + bill.before)}; Claude Code reports ${money$(bill.total)}`)
    check(bill.main + bill.agents === listed, `Cost: main ${money$(bill.main)} + subagents ${money$(bill.agents)} = the prompts' ${money$(listed)}`)
    const walked = Object.values(days).reduce((sum, day) => sum + day.steps, 0)
    check(walked >= ledger.steps, `Steps: this session's days hold ${count(walked)}; its ledger counts ${count(ledger.steps)}`)
  } else {
    lines.push('Note no cost is reported for this session')
  }

  lines.push(limits ? `Note limits as read ${span(Math.max(0, nowMs - limits.at) / 1000)} ago by a session on this machine` : 'Note no limit window is reported for this account')

  return lines.join('\n')
}

// What a turn or a subagent used, as the API reported it: the justification for its spend.
function usedBy(tokens: Tokens, model: string | null): string {
  const read = tokens.input + tokens.cacheRead + tokens.cacheWrite

  if (read + tokens.output === 0) {
    return ''
  }

  const cached = read > 0 ? ` (${Math.round((tokens.cacheRead / read) * 100)}% of input from cache)` : ''

  return ` · ${model ?? 'Model unknown'} · In ${short(tokens.input)}, out ${short(tokens.output)}, cache read ${short(tokens.cacheRead)}, cache write ${short(tokens.cacheWrite)}${cached}`
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
    && (v.spent === undefined || (typeof v.spent === 'object' && v.spent !== null && typeof v.spent.main === 'number' && typeof v.spent.agents === 'number'))
    && (v.marks === undefined || (typeof v.marks === 'object' && v.marks !== null && Object.values(v.marks).every(isMark)))
}

function isMark(value: unknown): value is Mark {
  const v = value as Partial<Mark> | null | undefined

  return typeof v === 'object' && v !== null
    && (v.resetsAt === null || typeof v.resetsAt === 'string')
    && typeof v.used === 'number' && typeof v.usd === 'number' && typeof v.main === 'number' && typeof v.agents === 'number'
}

function isDays(value: unknown): value is Days {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every(day => typeof (day as Day | null)?.steps === 'number' && typeof (day as Day).usd === 'number')
}

function isLimits(value: unknown): value is Limits {
  const v = value as Partial<Limits> | null | undefined

  return typeof v === 'object' && v !== null && typeof v.at === 'number' && Array.isArray(v.windows)
}

// The heaviest of `items` and what they weigh together.
function loadOf(items: Array<{ name: string; tokens: number }>): Load {
  const top = items.reduce<{ name: string; tokens: number } | null>((most, item) => (most === null || item.tokens > most.tokens ? item : most), null)

  return { tokens: items.reduce((sum, item) => sum + item.tokens, 0), top: top?.name ?? '', topTokens: top?.tokens ?? 0 }
}

// "week" -> "Week".
function capital(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`
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
