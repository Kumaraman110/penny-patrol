# Penny Patrol

Meters above your Claude Code prompt: how full the context window is, who spent this session's dollars,
and what is left of your limits. A small mascot walks them while Claude works, and a line under them has
something worth a glance: an AI tip, a joke, a piece of good news, or a suggestion from your own figures.

![Penny Patrol above the prompt: four bars one under another (the five-hour limit, the context, the cost, the week's limit), each limit bar saying what is left inside the bar, the mascot standing on the first of them in its colour, a line beside each bar, and under them a line of good news with its link](docs/preview.png)

*The mod's own drawing, rendered outside a terminal for this page. Your terminal's theme sets the colours.*

An unofficial community mod for Claude Code. Not affiliated with Anthropic.

## Install

Needs Claude Code 2.1.289 or later.

```sh
claude plugin marketplace add Kumaraman110/penny-patrol
claude plugin install penny-patrol@penny-patrol
```

Start `claude`. The band is above the prompt.

To try it once without installing anything:

```sh
git clone https://github.com/Kumaraman110/penny-patrol
claude --plugin-dir penny-patrol/penny-patrol
```

## Uninstall

```sh
claude plugin uninstall penny-patrol@penny-patrol
claude plugin marketplace remove penny-patrol
rm -rf ~/.penny-patrol    # its saved ledgers and counters; skip this to keep them
```

## What you see

The bars stand at the left, one under another, with two free rows over each: a limit window first, then
the context and the cost, then the other limits. Beside each bar is a line under a short label. A limit
bar says what it has to say inside the bar, so the line beside it is another's: the model beside the
first limit, the steps beside the next. Under the bars is the line.

| Line | What it says |
| --- | --- |
| `Model` | Beside the first limit bar: the model, and the reasoning effort once a tool call has reported it. |
| `Context` | Beside the context bar: the share in use, tokens in use of the window, and what is free before Claude Code compacts. |
| | Under it, the legend: the categories and colours of `/context`. When they do not all fit, the smallest give way and the line ends on how many (`+2`). |
| | When the legend fits on one line, the last request: everything sent in (and how much of it was read from the prompt cache), and what came out. |
| `Cost` | Beside the cost bar: what this session was seen spending in each window of your plan and in the plan's month (`5h $1.03 · Week $107.56 · Plan $417.13`), then what the current prompt has cost so far. |
| | Under it: who spent it, in the plan's month. `Main` is the main conversation, `Subagents` everything it started. Both are always named, though one may have spent nothing. |
| `Steps` | Beside the next limit bar: this session's working time, a step a second: today, this week (from Sunday), this month, this year. |

With one limit window alone, the steps stand right under it. With none (an account billed by the API) the
model and the steps stand over the context bar, and the cost is the session's total.

**The limit bars** are one bar for each window your account reports, each with what is left written in
it: `5h limit · 75% left · Resets in 3h 32m`, `Week limit · 38% left · Resets in 5d 0h`. The coloured
part is what is *left*, so the bar drains as you use the window: green above half, amber down to a fifth,
red below. What is gone has no colour of its own: it is a faint shade, and the words over it are your
terminal's ordinary text, so it reads on a light terminal and on a dark one. Where the bar is short,
what it says is shorter (`5h limit · 75% left`).

An account billed by the API has no such window. It gets the month's spend instead: a bar that grows
toward the next round figure (`Month · $612.40 spent · Bar full at $1,000.00`) or, once you give it a
budget, drains that (`Month budget · $7,388.00 left of $8,000.00`).

**The context bar** is the room there is before Claude Code compacts. What is in use comes first, one
colour for each category; what is free is a faint shade. So a full bar means compaction is due. (Claude Code
keeps a buffer at the end of the window for that compaction. It is no room of yours, and is not drawn.)

*Messages* is the conversation itself: your prompts, Claude's replies and thinking, every tool call and
every tool result. It is not split into input and output, because everything in the window is input to
the next request.

**The cost follows your plan.** Where your account has limit windows, the cost on the band is three
figures: what this session was seen spending in the five hours' window, in the week's, and in the
plan's month. Each goes back to `$0.00` when its own begins again: a window when it renews, or as soon
as its end has passed; the month on the day your plan renews. The cost bar, and who spent under it, is
the month's.

Claude Code does not tell a mod when your plan renews, so say it once: `/penny-patrol plan 14` if it
renews on the 14th. Until then the month is counted from the 1st. What a session spent in the month is
worked out from its days, so the figure is right from the first look, whatever day you say.

What the session had spent before it first met a window is not counted to that window. Nothing is
lost: `/penny-patrol costs` still lists every prompt of the session, and says what each of the three
figures is.

**The mascot** stands on a bar. While anything runs (a turn, a background shell, a subagent) it takes a
step a second: along the first bar, down, back along the second, down, along the next, and so to the
last bar; then the whole way back. There is a bar under it at every step. When nothing runs it stands
where it is.

It takes the colour of the part of the bar under it. Over the empty stretch of a bar it wears its own,
and so it does where the bar right over its head is that same colour, so it is never lost against it.

Its face says how things are:

| Face | When |
| --- | --- |
| `^__^` `^uu^` `n__n` `^ww^` `^oo^` `*__*` | walking: another smile every eight steps |
| `^__~` `~__^` | a wink, for one step, in the middle of every other smile |
| `$__$` | walking the cost bar: one of its smiles there has dollars in its eyes |
| `-__-` | asleep: nothing is running |
| `>__<` | the meter under it has less than a fifth left: of the room before compaction, of a limit window, of the budget |

**In a small terminal** the band takes what there is. Where it may not have the rows it needs (three
for each bar, and one for the line) the line goes first. Then the limit bars give up the free rows over
them, each keeping the line beside it, and the mascot keeps to the context and cost bars. With fewer
rows than that, or narrower than 60 columns, the bars are drawn alone, each with its figures, the limits
side by side under their names, and the mascot stays home.

### The line

One row under the bars: a label, and right after it what it says. It says something else every four
minutes of work: while nothing runs it stays as it is.

| Label | What it is | Where it comes from |
| --- | --- | --- |
| `AI` | A tip for Claude Code or for prompting, how tokens and caching cost, a fact; and what is new. | With the mod: about forty notes. The commands and keys they name were checked against Claude Code 2.1.289. From the web: what the last Claude Code releases added (its changelog), and stories about AI from The Decoder, TechCrunch and The Verge. |
| `Joke` | A joke. Mostly about working with AI; some are not about anything. | With the mod: about fifty. From the web: icanhazdadjoke.com, and JokeAPI's programming jokes in its safe mode. |
| `Good news` | The gist of a story, then its link. Anything that does some good, big or small: a fusion record, a reserve, a dog that found a home. | From the web only: Positive News, Good News Network (its front page and its heroes, animals and inspiring sections), The Optimist Daily, Good Good Good. |
| `For you` | A suggestion from this session's own figures, and later what came of it. | Nowhere but your session: see below. |

`AI`, `Joke` and `Good news` take turns. What a feed gave comes before what came with the mod, and
nothing is said a second time until all of its kind have been said. A note too long for your terminal
is passed over for one that fits. Jokes at the expense of what people are, believe or suffer are left
out.

**A story is its gist and its link, never its headline.** A headline is often a teaser. The gist is taken
from the summary the outlet's own feed gives of the story:

- where the outlet writes a summary, as many of its sentences, from the first, as fit;
- where it gives the story's opening lines, the first sentence that stands by itself. A sentence that
  only sets a scene, leans on the headline or on the sentence before it, asks a question, talks about
  the outlet, or was cut off by the feed before it got to its point is passed over, and a story with
  no sentence left is not told. (Of a story about AI the sentence must also name someone or a figure:
  an essay opens with neither.)

After the gist comes the story's address, written out so that your terminal can open it: the short one
the outlet gives for a post, where it gives one. Where the band is too narrow for both, the gist is cut
at the end of a word and the address stays whole. Stories with a grim word in them, stories about
politics and the outlets' notes about themselves are left out. No model writes these lines: they are
the outlet's own words, and nothing read from a feed is ever given to the model.

**`For you`** comes every five to ten prompts and holds the line through four minutes of work (and
for as long as nothing runs, so it is there when you look up). It is the most
pressing thing the session's figures have to say that it has not said yet, and it says what to do and,
in your own figures, what doing it would move:

- the window is four fifths full: how much of it is messages, and where the bar would fall after
  `/compact`;
- a limit has a quarter or less left with more than half an hour to go: at what pace it is going, and
  how long before its reset it will be gone;
- MCP tools or memory files weigh thousands of tokens in every request: which one is the heaviest, and
  what every request would be lighter by;
- you stopped three or more of your last eight turns: what those turns had cost;
- one prompt cost several times what this session's usually do;
- after a break, one prompt wrote the whole conversation to the prompt cache again: what that cost;
- subagents are two fifths or more of the spend: how many runs, and what a run costs;
- your last six prompts averaged five words or fewer, or two or more of the last eight were over 3,000
  characters;
- the conversation is thirty prompts long and half the window is in use, or simply long enough to
  matter: what every request sends now, and what the first one after `/clear` would;
- and when there is nothing else, a plain account: so many prompts, so much, so much each.

**And it says so when the figure has moved.** What a suggestion was about is watched for the next forty
prompts. When it is better than it was, the line says so once, in the same figures, however small the
change:

```
For you It shows: after /compact the context went from 850k to 116k tokens, so every request from here sends 86% less.
For you It shows: MCP tools are 2k tokens of every request now, down from 14k: 86% less.
For you It shows: the 5h limit is going at 6.0% an hour now, down from 30%.
For you It shows: the dearest of the 4 prompts since cost $0.60, against $2.40 for that one.
```

The context is an estimate that moves by itself, so it is shown only after the conversation was in fact
made shorter: by `/compact`, by Claude Code's own compaction, or by `/clear`. A figure that got worse,
or has not had time to tell, is not mentioned.

It sees the size of your prompts and how the turns went, never their words.

**The web.** Unless you tell it otherwise, the line reads thirteen public feeds, in the background,
when what it has is an hour old; what they give is kept for every session on the machine. (One read
brings well over a hundred notes: more than a working day of lines.) The requests are plain reads made
through Claude Code's own fetch, so your organisation's web-fetch policy applies to them, and they send
nothing from your session: no prompt, no usage, no file. The hosts are `raw.githubusercontent.com`,
`the-decoder.com`, `techcrunch.com`, `www.theverge.com`, `icanhazdadjoke.com`, `v2.jokeapi.dev`,
`www.positive.news`, `www.goodnewsnetwork.org` (four feeds), `www.optimistdaily.com` and
`www.goodgoodgood.co`.

What comes back is kept only if it is one plain line of printable Latin text, so nothing a feed sends can
make your terminal do anything, and it is only ever drawn: none of it is given to the model. The first
time the line is live on a machine it says so itself, once, with the command that stops it:

```
/penny-patrol lines offline
```

## Slash commands

Penny Patrol ships one slash command, `/penny-patrol`, with these forms. Type it in the prompt like any
other; each answers at once and none of them sends a request to the model.

| Command | What it does |
| --- | --- |
| `/penny-patrol` | Hide the band, or show it again. This session only; the choice is remembered. |
| `/penny-patrol costs` | Print the ledger: the whole session, whatever window of your plan it was spent in. Every prompt, what it cost, the tokens that explain it, and the hourly rate while working; what each window's figure on the band is; and what every session on this machine adds up to: steps and spend by day, week, month and year. |
| `/penny-patrol audit` | Check the figures against each other and against what Claude Code reports. |
| `/penny-patrol budget` | Say what the month's budget is. |
| `/penny-patrol budget <dollars>` | Set the month's budget, for example `/penny-patrol budget 8000`. `$8,000` works too. Every session on this machine takes it up. |
| `/penny-patrol budget off` | Clear the budget. |
| `/penny-patrol plan` | Say which day of the month your plan is taken to renew on, and the month now running. |
| `/penny-patrol plan <day>` | Say the day it renews on, for example `/penny-patrol plan 14`. The `Plan` cost and the cost bar count from that day. Every session on this machine takes it up. |
| `/penny-patrol plan off` | Count the plan's month from the 1st again. |
| `/penny-patrol lines` | Say where the line under the bars reads from, and name the feeds. |
| `/penny-patrol lines live` | The line reads the feeds too (and does so at once). This is how it starts. |
| `/penny-patrol lines offline` | The line says only what came with the mod. Nothing is read from the web. |
| `/penny-patrol lines off` | No line. |

The choice of `lines`, like the budget, is the machine's: every session on it takes it up within half a
minute. Anything else after `/penny-patrol` prints this list in one line.

**`/penny-patrol costs`** prints:

```
Session total reported by Claude Code: $12.48
  This 5h window:   $3.61  (seen spent since it began, or since this session first met it)
  This Week window: $12.48  (seen spent since it began, or since this session first met it)
  This plan month:  $12.48  (seen spent since 14 Sep: the band's cost bar. /penny-patrol plan <day> says which day your plan renews on)
  Itemised below:   $12.48
  Before tracking:  $0.00  (spent before this ledger first looked; cannot be itemised)
  Unaccounted:      $0.00
  Working time:     3,412 steps (56m) · $13.17/h while working
  Prompts:          14 · Average $0.89 · Most expensive $2.83
  This machine:     Steps today 1,930 · Week 9,412 · Month 9,412 · Year 31,206
                    Spend today $19.20 · Week $61.75 · Month $61.75 · Year $204.10

  1.     $2.83  fix the flaky test in the recovery suite
                Main $2.11 · claude-opus-5-5 · In 1.2k, out 8.4k, cache read 2.1M, cache write 35k (98% of input from cache)
                general-purpose "Independent verification of the fix" $0.72 · claude-opus-5-5 · In 400, out 12k, ...
```

**`/penny-patrol audit`** prints one line a check. `OK` holds, `OFF` does not, `Note` is a fact with
nothing to check it against:

```
OK   Context: the categories in use add up to 121,400; Claude Code reports 121,400 in use
OK   Context: in use, free and buffer add up to 200,000; the window is 200,000
OK   Context: 121,400 of 200,000 is 61%
Note the last request sent 119,800 tokens in (1,200 new, 116,500 read from the cache, 2,100 written to it) and got 1,900 out; the bar's total is Claude Code's estimate for the next one
OK   Cost: prompts $12.48 + earlier $0.00 + before tracking $0.00 = $12.48; Claude Code reports $12.48
OK   Cost: main $9.61 + subagents $2.87 = the prompts' $12.48
OK   Steps: this session's days hold 3,412; its ledger counts 3,412
Note limits as read 4s ago by a session on this machine
```

**`/penny-patrol budget 8000`** answers `Budget set: $8,000.00 a month, counted from what this machine's
sessions spend.` and the month's bar starts draining it.

**`/penny-patrol plan 14`** answers `Your plan renews on the 14th. Its month now running began on 14 Sep
and ends on 14 Oct. /penny-patrol plan off counts from the 1st.`

**`/penny-patrol lines`** answers, for example:

```
The line under the bars is live: what came with the mod, and 122 notes read from the feeds 14m ago. It says something else every 4 minutes of work; the feeds are read again every 60 minutes.
/penny-patrol lines live reads the feeds too (raw.githubusercontent.com, the-decoder.com, ...), /penny-patrol lines offline keeps to what came with the mod, /penny-patrol lines off hides the line.
```

## How the money is tracked

Claude Code reports one figure: the session's total in dollars. Penny Patrol looks at it at every turn
start, tool call and turn end, and books each rise to whoever was acting when it was seen: the main
conversation's current prompt, or a subagent, whose spend belongs to the prompt that started it. So the
entries always add up to the total. Every view rounds from the same whole cents, so no two of them are a
cent apart, and `Unaccounted` is always $0.00.

**The plan's windows and its month.** When the session first meets a limit window, it notes what it
had spent until then; what it spends from there is that window's. A window has begun again when it ends
later than the one before it (or, where no end is told, when less of it is used than was), and as soon
as its end has passed. The note is kept with the session, so a session that loads again has its windows
where it left them. A session whose ledger was kept before the windows were followed starts counting
from where it is.

The plan's month runs from the day you said the plan renews on (the 1st until you do) to that day of
the next month. A session's spending is kept by day, so what it spent in the month is known exactly.
Where a session is older than the month, how that splits between the main conversation and its
subagents is taken to be as all of the session's spending splits.

What it cannot know:

- **Anything spent before it first looked.** That is "before tracking": a figure, never itemised.
- **Which of two things running at once caused a rise.** A rise seen while the main conversation and a
  subagent both work is booked to whichever acted next.
- **Prices.** No price list is exposed to a mod, so there is no split of dollars by token type. The
  token counts on each ledger line are the API's own.
- **Your bill.** On a subscription the dollars are Claude Code's API-equivalent figure, not a charge.
- **Your organisation's balance.** The month bar and the totals by period count the sessions on this
  machine that had Penny Patrol loaded. A budget is a number you give it, not one it can read.

A session keeps its last 200 prompts line by line. Older ones fold into a single "earlier prompts"
figure: still counted, no longer listed.

## Is it right?

`/penny-patrol audit` checks, on the spot, that the categories add up to the total Claude Code reports,
that in use plus free plus buffer make the window, that the cents add up to the reported total, and that
the steps saved match the steps counted. A line that does not hold starts with `OFF`. It also gives the
last request in full: new input, tokens read from the cache, tokens written to it, and output.

Two checks you can make yourself: `/context` for the window (its counts come from the token-count API,
so they differ a little from the local estimate the bar uses) and `/usage` for the session's dollars.

The mod ships with a test suite that runs against Claude Code's own engine:

```sh
claude plugin test penny-patrol
```

## Several sessions

What the band says is this session's, except the limits. Two sessions in the same folder each have their
own ledger, their own counters and their own choice to hide the band.

| On the band | Whose it is |
| --- | --- |
| `Model`, `Steps`, `Context`, `Cost` | this session's: the cost in each window is what *this* session spent in it |
| the `5h` and `Week` bars | your account's: every session shows the newest reading any of them saw, within five seconds |
| the `Month` bar (API billing) | every session's on this machine, as is the budget you set |
| the line | what the feeds gave is the machine's, read once for all its sessions; the order of the notes and the `For you` suggestions are each session's own |

What the sessions on this machine add up to, in steps and in dollars, is in `/penny-patrol costs`.

## Where it keeps things

Plain JSON files in `~/.penny-patrol`, which you can read:

| File | What it holds |
| --- | --- |
| `sessions/<session id>.json` | That session's ledger, effort and whether it is hidden; in the ledger, what the session had spent when it met each window of the plan. A ledger line carries the first sixty characters of its prompt, so you can tell the lines apart. |
| `days/<session id>.json` | That session's steps and dollars, by day |
| `limits.json` | The newest limit reading any session saw |
| `settings.json` | The month's budget, the day your plan renews on, and where the line reads from |
| `lines.json` | What the feeds last gave: the notes (a gist and its link, for a story), and when they were read |

It reads the session's usage from Claude Code and reads and writes those files. The one thing it does
beyond your machine is read the thirteen feeds named under [The line](#the-line), unless you turn that off;
it sends nothing of yours anywhere.

## Notes

- The context figures are Claude Code's local estimate, read after each turn and, during a turn, at most
  once every ten seconds. They cost no extra requests.
- Reasoning effort is only reported to a mod during a tool call, so it appears after the session's first
  one.
- After a turn you interrupt, background work is not seen again until the next turn ends.
- While nothing runs the band is drawn again once a minute, so the reset times keep moving. The line
  turns only while something runs.
- A bar is drawn as a solid band of colour, so it is one height along its length and the words in a limit
  bar sit inside it. What is free or gone is a faint shade in your terminal's own text colour, with no
  colour of the mod's choosing, so it reads whatever your theme. A copy of the band still carries block
  characters for it.
- The `[-]` beside the band collapses it; `/penny-patrol` hides it.
- The jokes and stories read from the web are other people's: icanhazdadjoke.com, JokeAPI, and the
  seven outlets named above, each story in the outlet's own words with a link to it. The notes that come with
  the mod were written for it.

## License

MIT. See [LICENSE](LICENSE).
