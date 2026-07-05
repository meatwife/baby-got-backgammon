---
name: backgammon-room
description: Play backgammon with your human in your shared game room. Use when they mention backgammon, making a move, or when checking whose turn it is. The agent plays as black via CLI; the human plays in their browser.
---

# Backgammon Room

<!-- Personalize this: your room's name, who plays which color, your house style. -->

Two-player backgammon. Human = white (plays in browser), me = black (CLI).

## Playing (agent side)

```bash
python3 /path/to/baby-got-backgammon/bgb.py state   # board + my legal moves
python3 /path/to/baby-got-backgammon/bgb.py roll
python3 /path/to/baby-got-backgammon/bgb.py move 1 7   # or: move bar 20 / move 22 off
python3 /path/to/baby-got-backgammon/bgb.py end
python3 /path/to/baby-got-backgammon/bgb.py undo
```

`new` starts a fresh game — only with your human's agreement.

## Etiquette / spirit

- Moves happen in the live conversation, with commentary. Don't delegate game moves to a subagent — the point is playing *together*.
- Announce rolls and moves in chat naturally; the board in their browser updates live.
- Play to actually win, but the point is the hang. Banter > pip counting.
- Black moves ascending 1→24, bears off from 19–24. White descends 24→1.

## Strategy notes / after-action log

Append observations here after games or notable positions. Goal is pattern accumulation, not theory-dumping.

<!-- e.g.:
### YYYY-MM-DD — first match
- Bar danger is real: getting hit once can cost tempo for several turns.
-->
