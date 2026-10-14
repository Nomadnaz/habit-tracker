# Blender (headless) → JSON of decimated, merged meshes, one per muscle id.
#   /Applications/Blender.app/Contents/MacOS/Blender -b <Z-Anatomy>/Startup.blend \
#     --python scripts/anatomy/export_muscles.py -- <out.json> [triangle budget]
# Then: node scripts/anatomy/pack.mjs <out.json>  → lib/body-mesh-data.ts
# Coordinates out: cm, y up, feet at 0, +z front, +x the figure's left.
import bpy, bmesh, json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parts import PAIRED, SINGLE, ABS_SPLIT_Z, TRIM

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]
BUDGET = int(argv[1]) if len(argv) > 1 else 60000

scene = bpy.context.scene
tmp = bpy.data.collections.new('export_tmp')
scene.collection.children.link(tmp)
missing = []

def source_bm(names, sides):
    bm = bmesh.new()
    for base in names:
        found = False
        for s in sides:
            o = bpy.data.objects.get(base + s)
            if not o or o.type != 'MESH':
                continue
            found = True
            # Link a stand-in into a visible collection so its modifiers
            # (subdivision on the skin regions) are evaluated.
            ob = bpy.data.objects.new('tmp', o.data)
            ob.matrix_world = o.matrix_world
            for m in o.modifiers:
                if m.type in ('SUBSURF', 'MIRROR', 'SOLIDIFY'):
                    nm = ob.modifiers.new(m.name, m.type)
                    for attr in ('levels', 'render_levels', 'use_axis', 'use_bisect_axis', 'use_clip', 'thickness', 'offset', 'mirror_object'):
                        if hasattr(m, attr):
                            try: setattr(nm, attr, getattr(m, attr))
                            except Exception: pass
            tmp.objects.link(ob)
            dg = bpy.context.evaluated_depsgraph_get()
            eo = ob.evaluated_get(dg)
            me = eo.to_mesh()
            me.transform(ob.matrix_world)
            bm.from_mesh(me)
            eo.to_mesh_clear()
            bpy.data.objects.remove(ob)
        if not found:
            missing.append(base + '|'.join(sides))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0004)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    return bm

def area(bm):
    return sum(f.calc_area() for f in bm.faces)

def decimated(bm, target):
    me = bpy.data.meshes.new('d')
    bm.to_mesh(me)
    ob = bpy.data.objects.new('d', me)
    tmp.objects.link(ob)
    tris = len(bm.faces)
    if tris > target:
        mod = ob.modifiers.new('dec', 'DECIMATE')
        mod.ratio = target / tris
        mod.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    eo = ob.evaluated_get(dg)
    m = eo.to_mesh()
    m.calc_loop_triangles()
    pos = []
    nrm = []
    for v in m.vertices:
        x, y, z = v.co
        nx, ny, nz = v.normal
        pos += [round(x * 100, 2), round(z * 100, 2), round(-y * 100, 2)]
        nrm += [round(nx, 3), round(nz, 3), round(-ny, 3)]
    idx = []
    for t in m.loop_triangles:
        idx += list(t.vertices)
    eo.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.meshes.remove(me)
    return pos, nrm, idx

# Build every part's source mesh first, so the budget can be shared by area.
src = {}
for mid, names in PAIRED.items():
    for side in ('l', 'r'):
        b = source_bm(names, ['.' + side])
        if mid in TRIM:
            cut = TRIM[mid]
            drop = [f for f in b.faces if cut(*f.calc_center_median())]
            bmesh.ops.delete(b, geom=drop, context='FACES')
            loose = [v for v in b.verts if not v.link_faces]
            bmesh.ops.delete(b, geom=loose, context='VERTS')
        src[f'{mid}.{side}'] = b
for mid, names in SINGLE.items():
    src[mid] = source_bm(names, ['', '.j', '.l', '.r'])

# Split the rectus abdominis at the navel.
abs_bm = src.pop('abs')
for key, keep in (('abs.upper', lambda z: z >= ABS_SPLIT_Z), ('abs.lower', lambda z: z < ABS_SPLIT_Z)):
    b = abs_bm.copy()
    drop = [f for f in b.faces if not keep(f.calc_center_median().z)]
    bmesh.ops.delete(b, geom=drop, context='FACES')
    src[key] = b

areas = {k: area(b) for k, b in src.items()}
weight = {k: max(a, 1e-6) ** 0.8 for k, a in areas.items()}
total_w = sum(weight.values())
out = {}
for k, b in src.items():
    target = max(90, int(BUDGET * weight[k] / total_w))
    pos, nrm, idx = decimated(b, target)
    out[k] = {'pos': pos, 'nrm': nrm, 'idx': idx}
    print('PART', k, len(b.faces), '->', len(idx) // 3)

json.dump(out, open(OUT, 'w'))
print('MISSING', sorted(set(missing)))
print('TOTAL TRIS', sum(len(p['idx']) // 3 for p in out.values()))
