# Penny Patrol

Three meters above your Claude Code prompt: how full the context window is, where this session's dollars
went, and what is left of your limits. While Claude works, a small walker paces each bar and counts its
steps.

```
 ████████████████▗█▪██▪█▖██████████░░░░░░░░░░░░░░░░░░░░░░▒▒▒  73%  730.9k / 1M  ·  claude-opus-5-5  ·  max  ·  128 steps
 █ System prompt 3.4k  █ System tools 30k  █ Memory files 2.3k  █ Messages 686.1k  ░ Free space 236.1k  ▒ Autocompact buffer 33k
 ██████████████████████████░░░░░░░░░░░░░░░▝█▪██▪█▘░░░░░░░░░░                    $12.48  ·  this prompt $2.83  ·  3,412 steps
 █ Main conversation $9.61  █ Subagents $2.87  $13.17/h while working
 5h ██████████████░░░░░░░░░  62% left · resets in 1h 20m    week ████░░░░░░░░░░░░░░░░░░░  15% left · resets in 3d 5h
 steps  today 3,412 · week 3,412 · month 3,412 · year 3,412    spend  today $12.48 · week $12.48 · month $12.48 · year $12.48
```

An unofficial community mod for Claude Code. Not affiliated with Anthropic.

## Install

Needs Claude Code 2.1.287 or later.

```sh
claude plugin marketplace add Kumaraman110/penny-patrol
claude plugin install penny-patrol@penny-patrol
```

Start `claude`. The bars are above the prompt.

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

**The context bar.** The window as one stacked bar, a colour per category, the same categories and
colours as `/context`. What is in use comes first, then the free space, then the autocompact buffer at the
window's end, so the pale run in the middle is the room left before Claude Code compacts. Beside it: the
share in use, the model, the reasoning effort, and the steps walked for the current prompt.

*Messages* is the conversation itself: your prompts, Claude's replies and thinking, every tool call and
every tool result. It is not split into input and output, because everything in the window is input to
the next request. What the last request really sent is on the legend when Claude Code reports it:
uncached input, tokens read from the prompt cache, tokens written to it, and output.

**The cost bar.** Where this session's dollars went: the main conversation, its subagents, and what was
spent before Penny Patrol first looked. Beside it: the session's total, what the current prompt has cost
so far, and the session's steps. The legend adds the hourly rate while working.

**The limit bars.** One for each window your account reports (five hours, the week, a gateway's spend
limit). Each shows what is *left*, draining as you use it: green above half, amber down to a fifth, red
below. The time to its reset is beside the bar.

An account billed by the API has no such window. It gets the month's spend instead: a bar that grows
toward the next round figure, or, once you give it a budget, one that drains it.

**The last line.** Steps and spend for today, this week (from Sunday), this month and this year, summed
over every session on this machine.

**The walkers.** While anything runs (a turn, a background shell, a subagent) a walker paces every bar,
one step a second, neighbours in opposite directions. When nothing runs they step off and the bars are
bare. A step is a second of work, so the step counts are working time.

## Commands

| Command | What it does |
| --- | --- |
| `/penny-patrol` | Hide the bars, or show them again. This session only. |
| `/penny-patrol costs` | The ledger: every prompt, what it cost, and the tokens that explain it. |
| `/penny-patrol audit` | Check the figures against each other and against what Claude Code reports. |
| `/penny-patrol budget 8000` | Set the month's budget in dollars. `budget off` clears it. |

`/penny-patrol costs` looks like this:

```
Session total reported by Claude Code: $12.48
  itemised below:   $12.48
  before tracking:  $0.00  (spent before this ledger first looked; cannot be itemised)
  unaccounted:      $0.00
  working time:     3,412 steps (56m) · $13.17/h while working
  prompts:          14 · average $0.89 · most expensive $2.83
  this machine:     today $12.48 · week $12.48 · month $12.48 · year $12.48

  1.     $2.83  fix the flaky test in the recovery suite
                main $2.11 · claude-opus-5-5 · in 1.2k, out 8.4k, cache read 2.1M, cache write 35k (98% of input from cache)
                general-purpose "Independent verification of the fix" $0.72 · claude-opus-5-5 · in 400, out 12k, ...
```

## How the money is tracked

Claude Code reports one figure: the session's total in dollars. Penny Patrol looks at it at every turn
start, tool call and turn end, and books each rise to whoever was acting when it was seen: the main
conversation's current prompt, or a subagent, whose spend belongs to the prompt that started it. So the
entries always add up to the total. Every view rounds from the same whole cents, so no two of them are a
cent apart, and `unaccounted` is always $0.00.

What it cannot know:

- **Anything spent before it first looked.** That is shown as "before tracking" and never itemised.
- **Which of two things running at once caused a rise.** A rise seen while the main conversation and a
  subagent both work is booked to whichever acted next.
- **Prices.** No price list is exposed to a mod, so there is no split of dollars by token type. The
  token counts on each ledger line are the API's own.
- **Your bill.** On a subscription the dollars are Claude Code's API-equivalent figure, not a charge.
- **Your organisation's balance.** The month bar and the calendar totals count the sessions on this
  machine that had Penny Patrol loaded. A budget is a number you give it, not one it can read.

A session keeps its last 200 prompts line by line. Older ones fold into a single "earlier prompts"
figure: still counted, no longer listed.

## Is it right?

`/penny-patrol audit` checks, on the spot, that the categories add up to the total Claude Code reports,
that in use plus free plus buffer make the window, that the cents add up to the reported total, and that
the steps saved match the steps counted. A line that does not hold starts with `OFF`.

Two checks you can make yourself: `/context` for the window (its counts come from the token-count API,
so they differ a little from the local estimate the bar uses) and `/cost` for the session's dollars.

The mod ships with a test suite that runs against Claude Code's own engine:

```sh
claude plugin test penny-patrol
```

## Several sessions

Each session has its own ledger, its own counters and its own choice to hide the bars, even when two
sessions run in the same folder. The limits and the budget belong to your account, so every session
shows the newest reading any of them saw, within five seconds. The calendar totals add all of them up.

## Where it keeps things

Plain JSON files in `~/.penny-patrol`, which you can read:

| File | What it holds |
| --- | --- |
| `sessions/<session id>.json` | That session's ledger, effort and whether it is hidden |
| `days/<session id>.json` | That session's steps and dollars, by day |
| `limits.json` | The newest limit reading any session saw |
| `settings.json` | The month's budget |

It sends nothing anywhere. It reads the session's usage from Claude Code and reads and writes those
files; that is all.

## Notes

- The context figures are Claude Code's local estimate, read after each turn and, during a turn, at most
  once every ten seconds. They cost no extra requests.
- Reasoning effort is only reported to a mod during a tool call, so it appears after the session's first
  one.
- After a turn you interrupt, background work is not seen again until the next turn ends.
- The band is six rows. The `[-]` beside it collapses it; `/penny-patrol` hides it.

## License

MIT. See [LICENSE](LICENSE).
