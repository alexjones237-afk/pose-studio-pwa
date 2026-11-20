# PoseLab 3D — Mobile-First 3D Mannequin Posing & Staging PWA

A mobile-first 3D mannequin posing, inverse kinematics, anatomical morphing, soft-body physics, and scene-staging Progressive Web App built with **Vite**, **React**, **TypeScript**, **Tailwind CSS**, **Three.js**, **@react-three/fiber**, **@react-three/drei**, and **@pixiv/three-vrm**.

## Features
- **Touch-Optimized Studio Viewport**: Full-screen `touch-none` 3D canvas with damped `OrbitControls`, dark neutral studio (`#121216`), ground grid, shadow-catching floor, directional key light with soft shadows, adjustable rim/fill lights, 20mm–85mm focal length slider, and 5 quick camera angle presets.
- **VRM / GLB & Multi-Character Support**: Boots immediately with stylized procedural Anime Female and Anime Male rigged mannequins (complete with VRM humanoid skeletons, anatomical morph targets, and spring bones), plus `.vrm`/`.glb` file import, `/public/models/` auto-loading, 2nd mannequin spawning, and Smooth Clay vs. Hard-Edge Cel/Toon shading with adjustable shadow threshold.
- **Posing & Inverse Kinematics (IK)**: Tap major joints for 3D rotation gizmos (`TransformControls` auto-disables orbit while dragging), drag IK handles for Hands, Feet, Hips, and Head Aim, Pin Foot to Floor toggle, Mirror Pose (`Swap`, `L → R`, `R → L`), and Undo/Redo history.
- **Anatomical Proportions**: Dynamically inspects `morphTargetDictionary` across loaded meshes and groups 0–100% blendshape sliders by category without scaling bones.
- **Hybrid Gravity & Softness Physics**: Real-time spring bones (`VRMSpringBoneManager` for `.vrm` + Verlet spring solver for procedural mannequins) plus orientation-driven chest droop (`Chest_Hang_Forward` and `Chest_Splay_Back`) calculated per frame from chest orientation vs. world gravity.
- **Extensible Pose Library & PNG Export**: 12 starter poses in `src/data/poses.json` with smooth SLERP transitions, custom pose saving (`localStorage`), scene `.json` export/import, and high-res PNG screenshot export (with transparent background option for Clip Studio Paint).

## Running Locally
```bash
npm install
npm run dev
```

## Adding Custom Models or Poses
- Drop `anime-female.vrm` or `anime-male.vrm` into `public/models/` to override the default built-in mannequins, or import any `.vrm`/`.glb` directly from device storage in the **Models** tab.
- Add new entries directly to `src/data/poses.json` using standardized VRM humanoid bone names and `[x, y, z]` Euler angles in degrees.
