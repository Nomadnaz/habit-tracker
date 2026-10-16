# Anatomy pipeline

Builds `lib/body-mesh-data.ts` (the BODY tab's figure) from the Z-Anatomy
Blender atlas. Licence and attribution: `assets/anatomy/LICENSE.md`.

1. Get the source (~300 MB unzipped):
   `curl -L -o Z-Anatomy.zip https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/master/Z-Anatomy.zip && unzip Z-Anatomy.zip`
2. Export (Blender 4+, headless; a few minutes):
   `Blender -b Z-Anatomy/Startup.blend --python scripts/anatomy/export_muscles.py -- out.json 120000`
   The last number is the triangle budget, shared across parts by surface area.
   Prints `MISSING [...]` for any object name in `parts.py` it couldn't find.
3. Pack (also ray-traces each muscle's best viewing angle):
   `npm run gen:body-mesh -- out.json`

`parts.py` is the map from app muscle ids (`lib/body-mesh.ts` MUSCLES) to
Z-Anatomy object names. Any new id needs adding in both, plus a recovery time in
`lib/muscle-recovery.ts` (a test checks every muscle has one). Scenery — the
head, hands, feet, bones, muscles nobody trains — goes under an `x.` id in
`parts.py` only: it's drawn faint and can't be tapped.
