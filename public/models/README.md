# Multi-Archetype Model Library (`/public/models/`)

Drop your pre-rigged `.vrm` (VRM 0.x / VRM 1.0) or `.glb` humanoid files here to replace any of the 4 built-in archetype slots automatically:

| Model Slot | Supported Filenames |
| --- | --- |
| **Realistic Male (8-Heads)** | `realistic-male.vrm` or `realistic-male.glb` |
| **Realistic Female (8-Heads)** | `realistic-female.vrm` or `realistic-female.glb` |
| **Stylized Anime Male** | `anime-male.vrm` or `anime-male.glb` |
| **Stylized Anime Female** | `anime-female.vrm` or `anime-female.glb` |

### Automatic Features on Imported Models
- **Smooth Mesh Shading**: Automatically computes missing vertex normals, disables flat shading, enables soft shadows, and supports both **Matte Clay** (neutral studio grey override) and **Cel-Shaded** toon rendering.
- **30-Bone Hand Rig Detection**: Automatically detects VRM 0.x, VRM 1.0 (`ThumbMetacarpal/Proximal/Distal`), Mixamo, and Blender finger rigs for full per-finger curl, spread, and hand presets.
- **Anatomical Blendshapes & Spring Bones**: Inspects `morphTargetDictionary` for the Body tab and wires `VRMSpringBoneManager` + orientation-driven chest droop (`Chest_Hang_Forward` / `Chest_Splay_Back`).

If a slot file is not present yet, PoseLab 3D cleanly falls back to a matching procedural articulated mannequin with full 30-bone fingers, morph targets, and spring bones. You can also import any `.vrm` or `.glb` directly from device storage in the **Models** tab.
