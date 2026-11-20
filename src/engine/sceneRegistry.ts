import * as THREE from 'three';
import { RiggedMannequinHandle } from './proceduralMannequin';

/**
 * Runtime registry bridging live Three.js objects across R3F components:
 * - Character rigs & stage groups (for bone.attach / root parenting & surface raycast snapping)
 * - Prop groups (for object-to-object parenting and downward Raycaster surface detection)
 */
class StudioSceneRegistry {
  private characters = new Map<string, RiggedMannequinHandle>();
  private characterStageGroups = new Map<string, THREE.Object3D>();
  private propRoots = new Map<string, { object: THREE.Object3D; attachedToBone: boolean }>();

  registerCharacter(
    id: string,
    handle: RiggedMannequinHandle,
    stageGroup?: THREE.Object3D | null
  ) {
    this.characters.set(id, handle);
    if (stageGroup) {
      this.characterStageGroups.set(id, stageGroup);
    }
  }

  unregisterCharacter(id: string, handle?: RiggedMannequinHandle) {
    if (handle && this.characters.get(id) !== handle) return;
    this.characters.delete(id);
    this.characterStageGroups.delete(id);
  }

  getCharacter(id: string): RiggedMannequinHandle | undefined {
    return this.characters.get(id);
  }

  getCharacterStageGroup(id: string): THREE.Object3D | undefined {
    return this.characterStageGroups.get(id);
  }

  registerProp(id: string, object: THREE.Object3D, attachedToBone: boolean) {
    this.propRoots.set(id, { object, attachedToBone });
  }

  unregisterProp(id: string) {
    this.propRoots.delete(id);
  }

  getPropObject(id: string): THREE.Object3D | undefined {
    return this.propRoots.get(id)?.object;
  }

  /**
   * Returns all meshes from stage props suitable for downward surface raycasting.
   */
  getSurfaceRaycastTargets(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const entry of this.propRoots.values()) {
      if (entry.attachedToBone) continue;
      entry.object.updateMatrixWorld(true);
      entry.object.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          meshes.push(obj);
        }
      });
    }
    return meshes;
  }
}

export const sceneRegistry = new StudioSceneRegistry();
