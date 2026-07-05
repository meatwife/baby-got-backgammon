#!/usr/bin/env python3
"""Agent-side CLI for Baby Got Backgammon. Plays as black.

  bgb.py state          — pretty board + whose turn + my legal moves
  bgb.py roll           — roll dice (my turn, rolling phase)
  bgb.py move FROM TO   — FROM: 1-24 or bar; TO: 1-24 or off
  bgb.py end            — end my turn
  bgb.py undo           — undo last move this turn
  bgb.py new            — start a fresh game (asks nothing; be sure!)
"""

import json
import sys
import urllib.request

import os
BASE = os.environ.get('BGB_URL', 'http://127.0.0.1:8642') + '/api'
_secrets = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'secrets.json')
KEY = json.load(open(os.environ.get('BGB_SECRETS', _secrets)))['blackKey']


def call(method, path, body=None):
    req = urllib.request.Request(
        BASE + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'x-bgb-key': KEY, 'Content-Type': 'application/json'})
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        print('ERROR:', json.loads(e.read()).get('error', e.code))
        sys.exit(1)


def show(s):
    pts = s['points']
    names = s.get('players', {'white': 'White', 'black': 'Black'})
    wi, bi = names['white'][0].upper(), names['black'][0].upper()
    if wi == bi:
        wi, bi = 'W', 'B'

    def cell(p):
        v = pts[p - 1]
        return '  · ' if v == 0 else f'{wi if v > 0 else bi}{abs(v):<2} '

    top = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]
    bot = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    print('  13  14  15  16  17  18 | 19  20  21  22  23  24')
    print(' ' + ''.join(cell(p) for p in top[:6]) + '| ' + ''.join(cell(p) for p in top[6:]))
    print(' ' + ''.join(cell(p) for p in bot[:6]) + '| ' + ''.join(cell(p) for p in bot[6:]))
    print('  12  11  10   9   8   7 |  6   5   4   3   2   1')
    print(f"bar: {names['white']}={s['bar']['white']} {names['black']}={s['bar']['black']}   "
          f"off: {names['white']}={s['borneOff']['white']} {names['black']}={s['borneOff']['black']}")
    print(f"phase: {s['phase']}  turn: {s.get('currentPlayerName')}  "
          f"dice: {s.get('diceRoll')}  remaining: {s.get('remainingMoves')}")
    if s.get('result'):
        print(f"🏆 GAME OVER: {s['players'][s['result']['winner']]} wins ({s['result']['victoryType']})")
    if s.get('currentPlayer') == 'black' and s['phase'] == 'moving':
        print('my legal moves:')
        for m in s['validMoves']:
            dests = ', '.join(f"{d['to']}(d{d['dieValue']}{'+hit' if d['wouldHit'] else ''})"
                              for d in m['destinations'])
            print(f"  from {m['from']} -> {dests}")


cmd = sys.argv[1] if len(sys.argv) > 1 else 'state'
if cmd == 'state':
    show(call('GET', '/state'))
elif cmd == 'roll':
    r = call('POST', '/roll', {})
    if r.get('turnForfeited'):
        print('rolled, but no legal moves — turn forfeited')
    show(r)
elif cmd == 'move':
    frm = sys.argv[2] if sys.argv[2] == 'bar' else int(sys.argv[2])
    to = sys.argv[3] if sys.argv[3] == 'off' else int(sys.argv[3])
    show(call('POST', '/move', {'from': frm, 'to': to}))
elif cmd == 'end':
    show(call('POST', '/endturn', {}))
elif cmd == 'undo':
    show(call('POST', '/undo', {}))
elif cmd == 'new':
    show(call('POST', '/new', {}))
else:
    print(__doc__)
