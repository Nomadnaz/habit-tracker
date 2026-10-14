# Anatomy model — attribution and licence

The muscle and body-region meshes in `lib/body-mesh-data.ts` are derived from:

- **Z-Anatomy** — https://github.com/Z-Anatomy/Models-of-human-anatomy —
  licensed under Creative Commons Attribution-ShareAlike 4.0 International
  (CC BY-SA 4.0), https://creativecommons.org/licenses/by-sa/4.0/
- which is built on **BodyParts3D**, © The Database Center for Life Science,
  licensed under Creative Commons Attribution 4.0 International (CC BY 4.0),
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/

Changes made: a subset of muscles and skin regions selected and merged per
muscle group, the external oblique and latissimus dorsi aponeuroses trimmed,
the rectus abdominis split at the navel, meshes decimated, re-oriented and
quantised (see `scripts/anatomy/`).

The derived mesh data (`lib/body-mesh-data.ts`) is therefore licensed under
CC BY-SA 4.0. This licence covers the mesh data only, not the rest of the app.
The in-app credit is on the BODY tab.
