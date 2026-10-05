# Penny Patrol

Meters above your Claude Code prompt: how full the context window is, who spent this session's dollars,
and what is left of your limits. A small mascot walks them while Claude works, and a line under them has
something worth a glance: an AI tip, a joke, a piece of good news, or a suggestion from your own figures.

![Penny Patrol above the prompt: four bars one under another, the two limit bars saying what is left inside the bar, the mascot standing on one of them in its colour, a readout at the right, and a line of text under the bars](docs/preview.png)

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

The bars stand at the left, one under another, with two free rows over each. What the context and cost
bars have to say is at the right, one line a row, each under a short label. A limit bar says what it has
to say inside the bar. Under the bars is the line.

| Line | What it says |
| --- | --- |
| `Model` | The model, and the reasoning effort once a tool call has reported it. |
| `Steps` | This session's working time, a step a second: today, this week (from Sunday), this month, this year. |
| `Context` | Beside the context bar: the share in use, tokens in use of the window, and what is free before Claude Code compacts. |
| | Under it, the legend: the categories and colours of `/context`. When they do not all fit, the smallest give way and the line ends on how many (`+2`). |
| | When the legend fits on one line, the last request: everything sent in (and how much of it was read from the prompt cache), and what came out. |
| `Cost` | Beside the cost bar: the session's total as Claude Code reports it, and what the current prompt has cost so far. |
| | Under it: who spent it. `Main` is the main conversation, `Subagents` everything it started. What was spent before Penny Patrol first looked is a figure here, not a part of the bar. |

**The context bar** is the window as one stacked bar. What is in use comes first, then the free space (a
quiet band), then the autocompact buffer (shaded) at the window's end, so the quiet run is the room left.

*Messages* is the conversation itself: your prompts, Claude's replies and thinking, every tool call and
every tool result. It is not split into input and output, because everything in the window is input to
the next request.

**The limit bars** are one bar for each window your account reports, each with what is left written in
it: `5h limit · 75% left · Resets in 3h 32m`, `Week limit · 83% left · Resets in 5d 0h`. The coloured
part is what is *left*, so the bar drains as you use the window: green above half, amber down to a fifth,
red below. Where the bar is short, what it says is shorter (`5h limit · 75% left`).

An account billed by the API has no such window. It gets the month's spend instead: a bar that grows
toward the next round figure (`Month · $612.40 spent · Bar full at $1,000.00`) or, once you give it a
budget, drains that (`Month budget · $7,388.00 left of $8,000.00`).

**The mascot** stands on a bar. While anything runs (a turn, a background shell, a subagent) it takes a
step a second: along the context bar, down, back along the cost bar, down, along the next, and so to the
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
them, and the mascot keeps to the context and cost bars. With fewer rows than that, or narrower than 65
columns, the bars are drawn alone, each with its figures, the limits side by side under their names, and
the mascot stays home.

### The line

One row under the bars. It says something else each time the mascot has walked a bar's length.

| Label | What it is | Where it comes from |
| --- | --- | --- |
| `AI` | A tip for Claude Code or for prompting, how tokens and caching cost, a fact; and what is new. | With the mod: about forty notes. The commands and keys they name were checked against Claude Code 2.1.289. From the web: what the last Claude Code releases added (its changelog), and stories about AI that did well on Hacker News. |
| `Joke` | A joke. Mostly about working with AI; some are not about anything. | With the mod: about fifty. From the web: icanhazdadjoke.com, and JokeAPI's programming jokes in its safe mode. |
| `Good news` | A headline, and where it was read (a link, where your terminal has links). Only ever good news. | From the web only: Good News Network, Reasons to be Cheerful, The Optimist Daily. Headlines with a grim word in them are left out, as are the outlets' notes about themselves. |
| `For you` | A suggestion from this session's own figures. | Nowhere but your session: see below. |

`AI`, `Joke` and `Good news` take turns. A note too long for your terminal is passed over for one that
fits, so the line is always one row and never cut short. Jokes at the expense of what people are,
believe or suffer are left out.

**`For you`** comes every five to ten prompts and holds the line while the mascot takes ninety steps. It
is the most pressing thing the session's figures have to say that it has not said yet:

- the window is four fifths full;
- a limit has a quarter or less left with more than half an hour to go;
- MCP tools or memory files weigh thousands of tokens in every request (it names the heaviest);
- you stopped three or more of your last eight turns;
- one prompt cost several times what this session's usually do;
- after a break, one prompt wrote the whole conversation to the prompt cache again;
- subagents are two fifths or more of the spend;
- your last six prompts averaged five words or fewer, or two or more of the last eight were over 3,000
  characters;
- the conversation is thirty prompts long and half the window is in use;
- nearly all of the session's input came from the prompt cache (that one is praise);
- and when there is nothing else, a plain account: so many prompts, so much, so much each.

It sees the size of your prompts and how the turns went, never their words.

**The web.** Unless you tell it otherwise, the line reads seven public feeds, in the background, when
what it has is six hours old; what they give is kept for every session on the machine. The requests are
plain reads made through Claude Code's own fetch, so your organisation's web-fetch policy applies to
them, and they send nothing from your session: no prompt, no usage, no file. The hosts are `raw.githubusercontent.com`, `hn.algolia.com`, `icanhazdadjoke.com`, `v2.jokeapi.dev`,
`www.goodnewsnetwork.org`, `reasonstobecheerful.world` and `www.optimistdaily.com`.

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
| `/penny-patrol costs` | Print the ledger: every prompt, what it cost, the tokens that explain it, and the hourly rate while working. Also what every session on this machine adds up to: steps and spend by day, week, month and year. |
| `/penny-patrol audit` | Check the figures against each other and against what Claude Code reports. |
| `/penny-patrol budget` | Say what the month's budget is. |
| `/penny-patrol budget <dollars>` | Set the month's budget, for example `/penny-patrol budget 8000`. `$8,000` works too. Every session on this machine takes it up. |
| `/penny-patrol budget off` | Clear the budget. |
| `/penny-patrol lines` | Say where the line under the bars reads from, and name the feeds. |
| `/penny-patrol lines live` | The line reads the feeds too (and does so at once). This is how it starts. |
| `/penny-patrol lines offline` | The line says only what came with the mod. Nothing is read from the web. |
| `/penny-patrol lines off` | No line. |

The choice of `lines`, like the budget, is the machine's: every session on it takes it up within half a
minute. Anything else after `/penny-patrol` prints this list in one line.

**`/penny-patrol costs`** prints:

```
Session total reported by Claude Code: $12.48
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

**`/penny-patrol lines`** answers, for example:

```
The line under the bars is live: what came with the mod, and 82 notes read from the feeds 2h 14m ago.
/penny-patrol lines live reads the feeds too (raw.githubusercontent.com, hn.algolia.com, ...), /penny-patrol lines offline keeps to what came with the mod, /penny-patrol lines off hides the line.
```

## How the money is tracked

Claude Code reports one figure: the session's total in dollars. Penny Patrol looks at it at every turn
start, tool call and turn end, and books each rise to whoever was acting when it was seen: the main
conversation's current prompt, or a subagent, whose spend belongs to the prompt that started it. So the
entries always add up to the total. Every view rounds from the same whole cents, so no two of them are a
cent apart, and `Unaccounted` is always $0.00.

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
| `Model`, `Steps`, `Context`, `Cost` | this session's |
| the `5h` and `Week` bars | your account's: every session shows the newest reading any of them saw, within five seconds |
| the `Month` bar (API billing) | every session's on this machine, as is the budget you set |
| the line | what the feeds gave is the machine's, read once for all its sessions; the order of the notes and the `For you` suggestions are each session's own |

What the sessions on this machine add up to, in steps and in dollars, is in `/penny-patrol costs`.

## Where it keeps things

Plain JSON files in `~/.penny-patrol`, which you can read:

| File | What it holds |
| --- | --- |
| `sessions/<session id>.json` | That session's ledger, effort and whether it is hidden. A ledger line carries the first sixty characters of its prompt, so you can tell the lines apart. |
| `days/<session id>.json` | That session's steps and dollars, by day |
| `limits.json` | The newest limit reading any session saw |
| `settings.json` | The month's budget, and where the line reads from |
| `lines.json` | What the feeds last gave: the notes, and when they were read |

It reads the session's usage from Claude Code and reads and writes those files. The one thing it does
beyond your machine is read the seven feeds named under [The line](#the-line), unless you turn that off;
it sends nothing of yours anywhere.

## Notes

- The context figures are Claude Code's local estimate, read after each turn and, during a turn, at most
  once every ten seconds. They cost no extra requests.
- Reasoning effort is only reported to a mod during a tool call, so it appears after the session's first
  one.
- After a turn you interrupt, background work is not seen again until the next turn ends.
- While nothing runs the band is drawn again once a minute, so the reset times keep moving. The line
  changes only while the mascot walks.
- A bar is drawn as a solid band of colour, so it is one height along its length and the words in a limit
  bar sit inside it. A copy of the band still carries block characters for it.
- The `[-]` beside the band collapses it; `/penny-patrol` hides it.
- The jokes and headlines read from the web are other people's: icanhazdadjoke.com, JokeAPI, Hacker News
  and the three outlets named above. The notes that come with the mod were written for it.

## License

MIT. See [LICENSE](LICENSE).
