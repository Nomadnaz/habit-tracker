# Rebuild: uv run --with fonttools python scripts/fonts/puck-dot.py assets/fonts/LondonUnderground-Heavy.ttf assets/fonts/PuckDot-Heavy.ttf
# Adds . · / % × + ! to London Underground Heavy in its own dot grid (100-unit
# dots, two-dot strokes) and renames it per the OFL's Reserved Font Name clause.
# Also adds tabular figures under the OpenType 'tnum' feature: every digit at
# the widest digit's advance, centred, so a timer or counter styled with
# fontVariant: ['tabular-nums'] doesn't shuffle sideways as its digits change.
# The default digits stay proportional.
import copy, sys
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphCoordinates
src, dst = sys.argv[1], sys.argv[2]
f = TTFont(src)
glyf, hmtx = f['glyf'], f['hmtx']
colon = glyf['colon']
colon.expand(glyf)
ends = colon.endPtsOfContours
# Template: colon's first dot, normalised to the cell (0,0)–(100,100).
tpl = [(x, y) for x, y in list(colon.coordinates)[: ends[0] + 1]]
tflags = list(colon.flags)[: ends[0] + 1]
mx, my = min(x for x, _ in tpl), min(y for _, y in tpl)
tpl = [(x - mx, y - my) for x, y in tpl]

def make(cells):
    cells = sorted(set(cells))
    g = Glyph(); coords, flags, endpts = [], [], []
    for cx, cy in cells:
        coords += [(x + cx * 100, y + cy * 100) for x, y in tpl]
        flags += tflags
        endpts.append(len(coords) - 1)
    g.coordinates = GlyphCoordinates(coords); g.flags = bytearray(flags)
    g.endPtsOfContours = endpts; g.numberOfContours = len(endpts); g.program = None
    from fontTools.ttLib.tables import ttProgram
    g.program = ttProgram.Program(); g.program.fromBytecode(b'')
    g.recalcBounds(glyf)
    return g

block = lambda x, y: [(x, y), (x + 1, y), (x, y + 1), (x + 1, y + 1)]
slash = [c for r in range(10) for c in [(round(r * 4 / 9), r), (round(r * 4 / 9) + 1, r)]]
new = {
    'period':         (0x2E, block(0, 0), 300),
    'periodcentered': (0xB7, block(0, 4), 300),
    'slash':          (0x2F, slash, 700),
    'percent':        (0x25, slash + block(0, 8) + block(4, 0), 700),
    'multiply':       (0xD7, [(i, i + 2) for i in range(5)] + [(4 - i, i + 2) for i in range(5)], 600),
    'plus':           (0x2B, [(c, r) for c in (2, 3) for r in range(2, 8)] + [(c, r) for c in range(6) for r in (4, 5)], 700),
    'exclam':         (0x21, [(c, r) for c in (0, 1) for r in range(3, 10)] + block(0, 0), 300),
}
order = f.getGlyphOrder()
for name, (cp, cells, adv) in new.items():
    if name in order: raise SystemExit(f'{name} already there')
    g = make(cells); glyf[name] = g; hmtx[name] = (adv, g.xMin)
    if order[-1] != name: order.append(name)
    for t in f['cmap'].tables:
        if t.isUnicode(): t.cmap[cp] = name
digits = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
tab = max(hmtx[d][0] for d in digits)
for d in digits:
    g = copy.deepcopy(glyf[d]); g.expand(glyf)
    g.coordinates.translate(((tab - hmtx[d][0]) // 2, 0)); g.recalcBounds(glyf)
    glyf[d + '.tnum'] = g; hmtx[d + '.tnum'] = (tab, g.xMin)
    if order[-1] != d + '.tnum': order.append(d + '.tnum')
f.setGlyphOrder(order)
addOpenTypeFeaturesFromString(f, 'languagesystem DFLT dflt;\nlanguagesystem latn dflt;\nfeature tnum {\n'
    + ''.join(f'  sub {d} by {d}.tnum;\n' for d in digits) + '} tnum;\n')
for n in f['name'].names:
    v = n.toUnicode()
    if n.nameID == 1: n.string = 'Puck Dot'
    elif n.nameID == 3: n.string = 'Puck Dot Heavy 1.0'
    elif n.nameID == 4: n.string = 'Puck Dot Heavy'
    elif n.nameID == 6: n.string = 'PuckDot-Heavy'
    elif n.nameID == 0: n.string = v + ' Modified 2026: adds period, middle dot, slash, percent, multiply, plus, exclam and tabular figures; renamed Puck Dot under the OFL.'
f.save(dst)
t = TTFont(dst); print('ok', t['maxp'].numGlyphs, ''.join(sorted(chr(c) for c in t.getBestCmap() if c < 0x2500)))
