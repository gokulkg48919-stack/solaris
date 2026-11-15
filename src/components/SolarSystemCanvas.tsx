import { Line, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  ALL_INSPECTABLE_BODIES,
  PlanetaryMoonSpec,
  SOLAR_SYSTEM_BODIES,
  SolarSystemBodySpec,
} from '../astronomy/bodiesCatalog';
import { SystemEphemerisData } from '../astronomy/ephemerisService';
import {
  computeOsculatingOrbitPoints,
  eclipticKmToThreePosition,
  interpolateStateVector,
  moonGeocentricToThreeOffset,
} from '../astronomy/orbitalMath';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  applyEarthCloudDetailShader,
  applyPlanetMicroDetailShader,
  applySaturnRingShadowShader,
} from '../three/planetShaders';
import {
  createAtmosphereMaterial,
  createExplosionEjectaSystem,
  createExplosionShockwaveMaterial,
  createPlanetTextures,
  createRadialRingGeometry,
  createSunCoronaMaterial,
  createSunHaloTexture,
  createSunPhotosphereMaterial,
  createSupernovaBurstTexture,
  createSupernovaDiskMaterial,
  createSupernovaJetMaterial,
  PlanetTextureBundle,
} from '../three/proceduralTextures';
import { createAsteroidBelt, createMovingStarfield } from '../three/starfield';

export interface SceneLayerVisibility {
  orbits: boolean;
  labels: boolean;
  asteroidBelt: boolean;
  moons: boolean;
  starfield: boolean;
}

export type LightingMode = 'natural' | 'illuminated';

export interface CameraActionSignal {
  type: 'focus' | 'reset' | 'zoomIn' | 'zoomOut';
  bodyId?: string | null;
  nonce: number;
}

interface SolarSystemCanvasProps {
  ephemeris: SystemEphemerisData | null;
  simTimeMsRef: MutableRefObject<number>;
  selectedId: string | null;
  layers: SceneLayerVisibility;
  lightingMode: LightingMode;
  cameraSignal: CameraActionSignal;
  redGiantActive?: boolean;
  redGiantStartMsRef?: MutableRefObject<number>;
  onBodyEngulfed?: (bodyId: string) => void;
  onSelectBody: (id: string) => void;
  onContextLost: (lost: boolean) => void;
}

const OVERVIEW_CAM_POS = new THREE.Vector3(0, 142, 340);
const OVERVIEW_TARGET = new THREE.Vector3(0, 0, 0);

const _scratchVecA = new THREE.Vector3();
const _scratchVecB = new THREE.Vector3();
const _scratchDelta = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function SoftwareGlPacer({ isSoftwareGl }: { isSoftwareGl: boolean }) {
  const { gl, invalidate } = useThree();

  useEffect(() => {
    if (!isSoftwareGl) return;
    let alive = true;
    let timerId = 0;

    const scheduleNext = () => {
      if (!alive) return;
      const ctx = gl.getContext() as WebGL2RenderingContext;
      if (typeof ctx.fenceSync === 'function') {
        const sync = ctx.fenceSync(ctx.SYNC_GPU_COMMANDS_COMPLETE, 0);
        ctx.flush();
        const poll = () => {
          if (!alive) {
            if (sync) ctx.deleteSync(sync);
            return;
          }
          const status = sync && ctx.getSyncParameter(sync, ctx.SYNC_STATUS);
          if (status === ctx.UNSIGNALED) {
            timerId = window.setTimeout(poll, 5);
          } else {
            if (sync) ctx.deleteSync(sync);
            timerId = window.setTimeout(() => {
              if (!alive) return;
              invalidate();
              scheduleNext();
            }, 80);
          }
        };
        timerId = window.setTimeout(poll, 5);
      } else {
        timerId = window.setTimeout(() => {
          if (!alive) return;
          invalidate();
          scheduleNext();
        }, 80);
      }
    };

    invalidate();
    scheduleNext();

    return () => {
      alive = false;
      window.clearTimeout(timerId);
    };
  }, [gl, invalidate, isSoftwareGl]);

  return null;
}

const _normalScale = new THREE.Vector2(1.15, 1.15);

const _sunBaseColor = new THREE.Color('#fff2db');
const _sunGiantColor = new THREE.Color('#ff5e28');
const _sunFlashColor = new THREE.Color('#fff6e0');
const _sunRemnantColor = new THREE.Color('#ffaa55');
const _whiteColor = new THREE.Color('#ffffff');
const _scorchColor = new THREE.Color('#ff521a');

const RED_GIANT_CYCLE_SEC = 30.0;

function RedGiantController({
  active,
  startMsRef,
  sunScaleRef,
  redGiantProgressRef,
  flashRef,
  remnantRef,
  blastProgressRef,
  blastAlphaRef,
  burstFlareRef,
  allEngulfedRef,
}: {
  active: boolean;
  startMsRef?: MutableRefObject<number>;
  sunScaleRef: MutableRefObject<number>;
  redGiantProgressRef: MutableRefObject<number>;
  flashRef: MutableRefObject<number>;
  remnantRef: MutableRefObject<number>;
  blastProgressRef: MutableRefObject<number>;
  blastAlphaRef: MutableRefObject<number>;
  burstFlareRef: MutableRefObject<number>;
  allEngulfedRef: MutableRefObject<boolean>;
}) {
  useFrame(() => {
    if (!active || !startMsRef) {
      sunScaleRef.current = 1;
      redGiantProgressRef.current = 0;
      flashRef.current = 0;
      remnantRef.current = 0;
      blastProgressRef.current = 0;
      blastAlphaRef.current = 0;
      burstFlareRef.current = 0;
      allEngulfedRef.current = false;
      return;
    }

    const elapsedSec = Math.max(0, (performance.now() - startMsRef.current) / 1000);
    const cycleSec = elapsedSec % RED_GIANT_CYCLE_SEC;

    if (cycleSec < 5.0) {
      // Phase 1 (0..5s): Normal solar system countdown; all planets visible & clickable
      sunScaleRef.current = 1;
      redGiantProgressRef.current = 0;
      flashRef.current = 0;
      remnantRef.current = 0;
      blastProgressRef.current = 0;
      blastAlphaRef.current = 0;
      burstFlareRef.current = 0;
      allEngulfedRef.current = false;
    } else if (cycleSec < 21.5) {
      // Phase 2 (5..21.5s): Supergiant swells and eats each and every planet out to Neptune
      const expandT = (cycleSec - 5.0) / 16.5;
      const eased = Math.pow(expandT, 1.45);
      sunScaleRef.current = 1 + eased * 31.8;
      redGiantProgressRef.current = Math.min(1, expandT * 1.85);
      flashRef.current = 0;
      remnantRef.current = 0;
      blastProgressRef.current = 0;
      blastAlphaRef.current = 0;
      burstFlareRef.current = 0;
      allEngulfedRef.current = false;
    } else if (cycleSec < 22.1) {
      // Phase 3 (21.5..22.1s): Gravity wins instantly — core collapses in a fraction of a second (0.6s)
      const c = (cycleSec - 21.5) / 0.6;
      const collapseCurve = Math.pow(c, 2.2);
      sunScaleRef.current = THREE.MathUtils.lerp(32.8, 0.55, collapseCurve);
      redGiantProgressRef.current = 1 - collapseCurve * 0.5;
      flashRef.current = Math.pow(c, 1.4);
      remnantRef.current = 0;
      blastProgressRef.current = 0;
      blastAlphaRef.current = 0;
      burstFlareRef.current = Math.pow(c, 2.5) * 0.65;
      allEngulfedRef.current = true;
    } else {
      // Phase 4 (22.1..30.0s): Cataclysmic Supernova rebound outshining galaxies + relativistic jets -> loop
      const b = (cycleSec - 22.1) / 7.9;
      const fadeToLoop = b > 0.91 ? (1 - b) / 0.09 : 1;

      sunScaleRef.current = THREE.MathUtils.lerp(1, 0.42, fadeToLoop);
      redGiantProgressRef.current = Math.max(0, 1 - b * 8.0);
      flashRef.current = Math.max(0, 1 - b * 4.2);
      remnantRef.current = Math.min(1, b * 6.0) * fadeToLoop;
      blastProgressRef.current = b;
      blastAlphaRef.current = Math.sin(Math.min(1, b) * Math.PI) * (1 - Math.pow(b, 2.2) * 0.58);
      burstFlareRef.current = Math.exp(-b * 6.8) * fadeToLoop;
      allEngulfedRef.current = true;
    }
  });

  return null;
}

function SpaceLightingRig({
  lightingMode,
  redGiantProgressRef,
  flashRef,
  remnantRef,
  burstFlareRef,
}: {
  lightingMode: LightingMode;
  redGiantProgressRef: MutableRefObject<number>;
  flashRef: MutableRefObject<number>;
  remnantRef: MutableRefObject<number>;
  burstFlareRef: MutableRefObject<number>;
}) {
  const { gl, scene } = useThree();
  const sunLightRef = useRef<THREE.PointLight>(null);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmrem.dispose();
    return () => {
      scene.environment = null;
      envTex.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environmentIntensity = lightingMode === 'illuminated' ? 0.36 : 0.04;
  }, [scene, lightingMode]);

  useFrame(() => {
    if (sunLightRef.current) {
      const p = redGiantProgressRef.current;
      const fl = flashRef.current;
      const rem = remnantRef.current;
      const flare = burstFlareRef.current;
      sunLightRef.current.color
        .copy(_sunBaseColor)
        .lerp(_sunGiantColor, p)
        .lerp(_sunRemnantColor, rem)
        .lerp(_sunFlashColor, Math.min(1, fl + flare * 0.85));
      sunLightRef.current.intensity = 3.5 + p * 1.4 + fl * 9.0 + flare * 16.0 + rem * 1.4;
    }
  });

  return (
    <>
      <color attach="background" args={['#020409']} />
      <pointLight ref={sunLightRef} position={[0, 0, 0]} intensity={3.5} decay={0} color="#fff2db" />
      <hemisphereLight
        args={['#7ea6e0', '#0c111e', lightingMode === 'illuminated' ? 1.75 : 0.11]}
      />
    </>
  );
}

function StarfieldAndBelt({
  showStarfield,
  showAsteroidBelt,
  simTimeMsRef,
  sunScaleRef,
  allEngulfedRef,
}: {
  showStarfield: boolean;
  showAsteroidBelt: boolean;
  simTimeMsRef: MutableRefObject<number>;
  sunScaleRef: MutableRefObject<number>;
  allEngulfedRef: MutableRefObject<boolean>;
}) {
  const starfield = useMemo(() => createMovingStarfield(), []);
  const belt = useMemo(() => createAsteroidBelt(540), []);

  useEffect(() => {
    return () => {
      starfield.dispose();
      belt.dispose();
    };
  }, [starfield, belt]);

  useFrame((state, delta) => {
    if (showStarfield) {
      starfield.update(state.clock.elapsedTime, delta);
    }
    if (showAsteroidBelt) {
      // Advance belt subtly from simulation epoch
      belt.mesh.rotation.y = (simTimeMsRef.current / (4.6 * 365.25 * 86400 * 1000)) * Math.PI * 2;
      belt.mesh.visible = !allEngulfedRef.current && 5.5 * sunScaleRef.current < 74;
    }
  });

  return (
    <>
      {showStarfield && <primitive object={starfield.group} />}
      {showAsteroidBelt && <primitive object={belt.mesh} />}
    </>
  );
}

interface BodyRegistryEntry {
  group: THREE.Group;
  currPos: THREE.Vector3;
  prevPos: THREE.Vector3;
}

const _projVec = new THREE.Vector3();

function LabelProjector({
  enabled,
  showMoons,
  selectedId,
  sunScaleRef,
  registryRef,
  labelButtonRefs,
}: {
  enabled: boolean;
  showMoons: boolean;
  selectedId: string | null;
  sunScaleRef: MutableRefObject<number>;
  registryRef: MutableRefObject<Map<string, BodyRegistryEntry>>;
  labelButtonRefs: MutableRefObject<Record<string, HTMLButtonElement | null>>;
}) {
  useFrame(({ camera, size }) => {
    const placed: Array<{ x: number; y: number }> = [];
    const focusedSpec =
      selectedId && selectedId !== 'sun'
        ? ALL_INSPECTABLE_BODIES.find((b) => b.id === selectedId)
        : null;
    const focusedEntry = focusedSpec ? registryRef.current.get(focusedSpec.id) : null;
    const focusedCamDist = focusedEntry ? camera.position.distanceTo(focusedEntry.currPos) : Infinity;

    for (const spec of ALL_INSPECTABLE_BODIES) {
      const btn = labelButtonRefs.current[spec.id];
      if (!btn) continue;

      const isMoonVisible =
        spec.id !== 'moon' ||
        (showMoons && (selectedId === 'earth' || selectedId === 'moon'));
      const entry = registryRef.current.get(spec.id);

      if (!enabled || !isMoonVisible || !entry || !entry.group.visible) {
        if (btn.style.display !== 'none') btn.style.display = 'none';
        continue;
      }

      // Cull distant background planet labels occluded behind the focused planet OR the Sun
      const sunEntry = registryRef.current.get('sun');
      const sunCamDist = sunEntry ? camera.position.distanceTo(sunEntry.currPos) : Infinity;
      const bodyCamDist = camera.position.distanceTo(entry.currPos);

      if (sunEntry && spec.id !== 'sun' && bodyCamDist > sunCamDist) {
        const rayDir = _scratchDelta.copy(entry.currPos).sub(camera.position).normalize();
        const toSun = _scratchVecA.copy(sunEntry.currPos).sub(camera.position);
        const projLen = toSun.dot(rayDir);
        if (projLen > 0) {
          const closestSq = toSun.lengthSq() - projLen * projLen;
          const sunOccludeR = 5.5 * sunScaleRef.current * 1.04;
          if (closestSq < sunOccludeR * sunOccludeR) {
            if (btn.style.display !== 'none') btn.style.display = 'none';
            continue;
          }
        }
      }

      if (focusedSpec && focusedEntry && spec.id !== focusedSpec.id && bodyCamDist > focusedCamDist) {
        const rayDir = _scratchDelta.copy(entry.currPos).sub(camera.position).normalize();
        const toCenter = _scratchVecA.copy(focusedEntry.currPos).sub(camera.position);
        const projLen = toCenter.dot(rayDir);
        if (projLen > 0) {
          const closestSq = toCenter.lengthSq() - projLen * projLen;
          const occludeR = focusedSpec.radiusVisual * 1.16;
          if (closestSq < occludeR * occludeR) {
            if (btn.style.display !== 'none') btn.style.display = 'none';
            continue;
          }
        }
      }

      _projVec.copy(entry.currPos);
      _projVec.y +=
        spec.id === 'sun'
          ? spec.radiusVisual * sunScaleRef.current * 0.85
          : selectedId === spec.id
            ? spec.radiusVisual * 1.18
            : spec.radiusVisual * 0.7;
      _projVec.project(camera);

      if (
        _projVec.z < -1 ||
        _projVec.z > 1 ||
        Math.abs(_projVec.x) > 1.04 ||
        Math.abs(_projVec.y) > 1.04
      ) {
        if (btn.style.display !== 'none') btn.style.display = 'none';
        continue;
      }

      const sx = (_projVec.x * 0.5 + 0.5) * size.width;
      let sy =
        (-_projVec.y * 0.5 + 0.5) * size.height -
        (spec.id === 'sun' ? 18 : spec.hasRings ? 16 : 12);

      // Avoid 2D screen-space label overlap (e.g., near conjunctions)
      for (const prev of placed) {
        if (Math.abs(sx - prev.x) < 64 && Math.abs(sy - prev.y) < 18) {
          sy = prev.y - 19;
        }
      }

      placed.push({ x: sx, y: sy });
      if (btn.style.display !== 'block') btn.style.display = 'block';
      btn.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
    }
  });

  return null;
}

function SunMesh({
  body,
  simTimeMsRef,
  sunScaleRef,
  redGiantProgressRef,
  flashRef,
  remnantRef,
  blastProgressRef,
  blastAlphaRef,
  burstFlareRef,
  onSelectBody,
  registryRef,
}: {
  body: SolarSystemBodySpec;
  simTimeMsRef: MutableRefObject<number>;
  sunScaleRef: MutableRefObject<number>;
  redGiantProgressRef: MutableRefObject<number>;
  flashRef: MutableRefObject<number>;
  remnantRef: MutableRefObject<number>;
  blastProgressRef: MutableRefObject<number>;
  blastAlphaRef: MutableRefObject<number>;
  burstFlareRef: MutableRefObject<number>;
  onSelectBody: (id: string) => void;
  registryRef: MutableRefObject<Map<string, BodyRegistryEntry>>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const haloSpriteRef = useRef<THREE.Sprite>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const burstSpriteRef = useRef<THREE.Sprite>(null);
  const burstMatRef = useRef<THREE.SpriteMaterial>(null);
  const diskRef = useRef<THREE.Mesh>(null);
  const shockwaveRef = useRef<THREE.Mesh>(null);
  const jetsGroupRef = useRef<THREE.Group>(null);
  const photosphereMat = useMemo(() => createSunPhotosphereMaterial(), []);
  const coronaMat = useMemo(() => createSunCoronaMaterial(), []);
  const haloTex = useMemo(() => createSunHaloTexture(), []);
  const burstTex = useMemo(() => createSupernovaBurstTexture(), []);
  const diskMat = useMemo(() => createSupernovaDiskMaterial(), []);
  const jetMat = useMemo(() => createSupernovaJetMaterial(), []);
  const shockwaveMat = useMemo(() => createExplosionShockwaveMaterial(), []);
  const ejecta = useMemo(() => createExplosionEjectaSystem(2400), []);

  useEffect(() => {
    const grp = groupRef.current;
    if (grp) {
      registryRef.current.set(body.id, {
        group: grp,
        currPos: new THREE.Vector3(0, 0, 0),
        prevPos: new THREE.Vector3(0, 0, 0),
      });
    }
    return () => {
      photosphereMat.dispose();
      coronaMat.dispose();
      haloTex.dispose();
      burstTex.dispose();
      diskMat.dispose();
      jetMat.dispose();
      shockwaveMat.dispose();
      ejecta.dispose();
    };
  }, [body.id, photosphereMat, coronaMat, haloTex, burstTex, diskMat, jetMat, shockwaveMat, ejecta, registryRef]);

  useFrame((state) => {
    const s = sunScaleRef.current;
    const rg = redGiantProgressRef.current;
    const fl = flashRef.current;
    const rem = remnantRef.current;
    const blast = blastProgressRef.current;
    const blastAlpha = blastAlphaRef.current;
    const flare = burstFlareRef.current;

    photosphereMat.uniforms.uTime.value = state.clock.elapsedTime;
    photosphereMat.uniforms.uRedGiant.value = rg;
    photosphereMat.uniforms.uFlash.value = fl;
    photosphereMat.uniforms.uRemnant.value = rem;

    coronaMat.uniforms.uTime.value = state.clock.elapsedTime;
    coronaMat.uniforms.uRedGiant.value = rg;
    coronaMat.uniforms.uFlash.value = fl;
    coronaMat.uniforms.uRemnant.value = rem;

    if (groupRef.current) {
      groupRef.current.scale.setScalar(s);
    }
    if (haloSpriteRef.current && haloMatRef.current) {
      const baseScale = Math.max(0.42, s);
      const compensated = body.radiusVisual * (4.4 / Math.pow(Math.max(1, baseScale), 0.35));
      const haloBoost = 1 + fl * 1.1 + rem * 0.75;
      haloSpriteRef.current.scale.set(compensated * haloBoost, compensated * haloBoost, 1);
      haloMatRef.current.color
        .copy(_sunBaseColor)
        .lerp(_sunGiantColor, rg)
        .lerp(_sunRemnantColor, rem)
        .lerp(_sunFlashColor, fl);
      haloMatRef.current.opacity = Math.min(0.98, Math.max(0.28, 0.72 - rg * 0.38) + fl * 0.38);
    }
    if (burstSpriteRef.current && burstMatRef.current) {
      const showFlare = flare > 0.01;
      burstSpriteRef.current.visible = showFlare;
      if (showFlare) {
        const flareSize = 64 + blast * 320;
        burstSpriteRef.current.scale.set(flareSize, flareSize, 1);
        burstMatRef.current.opacity = Math.min(1, flare * 1.15);
      }
    }
    if (surfaceRef.current) {
      const rotCycles = simTimeMsRef.current / (body.rotationPeriodHours * 3600 * 1000);
      surfaceRef.current.rotation.y = rotCycles * Math.PI * 2 + state.clock.elapsedTime * 7.5 * rem;
    }

    if (diskRef.current) {
      const showDisk = blastAlpha > 0.01;
      diskRef.current.visible = showDisk;
      if (showDisk) {
        const diskSize = 110 + blast * 310;
        diskRef.current.scale.set(diskSize, diskSize, 1);
        diskMat.uniforms.uTime.value = state.clock.elapsedTime;
        diskMat.uniforms.uBlast.value = blast;
        diskMat.uniforms.uAlpha.value = blastAlpha;
      }
    }

    if (shockwaveRef.current) {
      const showBlast = blastAlpha > 0.01;
      shockwaveRef.current.visible = showBlast;
      if (showBlast) {
        shockwaveRef.current.scale.setScalar(14 + blast * 185);
        shockwaveMat.uniforms.uTime.value = state.clock.elapsedTime;
        shockwaveMat.uniforms.uBlast.value = blast;
        shockwaveMat.uniforms.uAlpha.value = blastAlpha;
      }
    }

    if (jetsGroupRef.current) {
      const showJets = blastAlpha > 0.01;
      jetsGroupRef.current.visible = showJets;
      if (showJets) {
        const lobeScale = 10 + blast * 88;
        jetsGroupRef.current.scale.set(lobeScale * 0.85, lobeScale * 1.15, lobeScale * 0.85);
        jetMat.uniforms.uTime.value = state.clock.elapsedTime;
        jetMat.uniforms.uBlast.value = blast;
        jetMat.uniforms.uAlpha.value = blastAlpha;
      }
    }

    const showEjecta = blastAlpha > 0.01;
    ejecta.points.visible = showEjecta;
    if (showEjecta) {
      ejecta.material.uniforms.uBlast.value = blast;
      ejecta.material.uniforms.uAlpha.value = blastAlpha;
    }
  });

  return (
    <group position={[0, 0, 0]}>
      <group ref={groupRef}>
        <group rotation={[0, 0, THREE.MathUtils.degToRad(body.axialTiltDeg)]}>
          <mesh
            ref={surfaceRef}
            onClick={(e) => {
              if (e.delta > 9) return;
              e.stopPropagation();
              onSelectBody(body.id);
            }}
          >
            <sphereGeometry args={[body.radiusVisual, 64, 48]} />
            <primitive object={photosphereMat} attach="material" />
          </mesh>
        </group>

        <mesh>
          <sphereGeometry args={[body.radiusVisual * 1.18, 48, 32]} />
          <primitive object={coronaMat} attach="material" />
        </mesh>

        <sprite ref={haloSpriteRef} scale={[body.radiusVisual * 4.4, body.radiusVisual * 4.4, 1]}>
          <spriteMaterial
            ref={haloMatRef}
            map={haloTex}
            color="#ffc766"
            transparent
            opacity={0.72}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </sprite>

        {/* Invisible generous click collider */}
        <mesh
          onClick={(e) => {
            if (e.delta > 9) return;
            e.stopPropagation();
            onSelectBody(body.id);
          }}
        >
          <sphereGeometry args={[body.radiusVisual * 1.2, 16, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      {/* Blinding warm white-gold supernova breakout core flare */}
      <sprite ref={burstSpriteRef} visible={false} scale={[120, 120, 1]}>
        <spriteMaterial
          ref={burstMatRef}
          map={burstTex}
          color="#ffffff"
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Fiery crimson-red circumstellar gas/dust disk illuminated from the core breakout */}
      <mesh
        ref={diskRef}
        visible={false}
        rotation={[-Math.PI / 2 + 0.16, 0.05, 0.12]}
      >
        <planeGeometry args={[2, 2, 1, 1]} />
        <primitive object={diskMat} attach="material" />
      </mesh>

      {/* Asymmetric billowing shock-breakout plasma plumes punching through the stellar surface */}
      <group
        ref={jetsGroupRef}
        visible={false}
        rotation={[0.06, 0, -0.14]}
      >
        <mesh position={[0, 0.85, 0]} scale={[0.78, 1.18, 0.78]}>
          <sphereGeometry args={[1, 44, 32]} />
          <primitive object={jetMat} attach="material" />
        </mesh>
        <mesh position={[0.14, 1.55, -0.1]} scale={[0.48, 0.62, 0.48]}>
          <sphereGeometry args={[1, 36, 28]} />
          <primitive object={jetMat} attach="material" />
        </mesh>
        <mesh position={[0, -0.62, 0]} scale={[0.58, 0.78, 0.58]}>
          <sphereGeometry args={[1, 36, 28]} />
          <primitive object={jetMat} attach="material" />
        </mesh>
      </group>

      {/* Expanding incandescent supernova shockwave shell */}
      <mesh ref={shockwaveRef} visible={false}>
        <sphereGeometry args={[1, 56, 42]} />
        <primitive object={shockwaveMat} attach="material" />
      </mesh>

      {/* Radial fiery plasma ejecta embers */}
      <primitive object={ejecta.points} />
    </group>
  );
}

function PlanetNode({
  body,
  ephemeris,
  simTimeMsRef,
  redGiantActive,
  sunScaleRef,
  allEngulfedRef,
  showOrbit,
  showMoons,
  isSelected,
  onSelectBody,
  onBodyEngulfed,
  registryRef,
}: {
  body: SolarSystemBodySpec;
  ephemeris: SystemEphemerisData;
  simTimeMsRef: MutableRefObject<number>;
  redGiantActive: boolean;
  sunScaleRef: MutableRefObject<number>;
  allEngulfedRef: MutableRefObject<boolean>;
  showOrbit: boolean;
  showMoons: boolean;
  isSelected: boolean;
  onSelectBody: (id: string) => void;
  onBodyEngulfed?: (bodyId: string) => void;
  registryRef: MutableRefObject<Map<string, BodyRegistryEntry>>;
}) {
  const { gl } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const orbitGroupRef = useRef<THREE.Group>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const cloudsRef = useRef<THREE.Mesh>(null);
  const engulfedRef = useRef(false);
  const moonMeshRefs = useRef<Record<string, THREE.Group | null>>({});

  const maxAniso = useMemo(
    () => Math.min(8, gl.capabilities.getMaxAnisotropy()),
    [gl]
  );

  const texBundle: PlanetTextureBundle = useMemo(
    () => createPlanetTextures(body.id, maxAniso),
    [body.id, maxAniso]
  );

  const moonTexBundle = useMemo(
    () => (body.moons && body.moons.length > 0 ? createPlanetTextures('moon', maxAniso) : null),
    [body.moons, maxAniso]
  );

  const atmoMat = useMemo(
    () =>
      body.hasAtmosphere && body.atmosphereColor
        ? createAtmosphereMaterial(body.atmosphereColor, body.id === 'earth' ? 0.85 : 0.55)
        : null,
    [body.hasAtmosphere, body.atmosphereColor, body.id]
  );

  const ringShadowUniformRef = useRef({
    uSaturnPos: { value: new THREE.Vector3() },
    uSaturnRadius: { value: body.radiusVisual },
  });

  const surfaceMat = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: texBundle.map,
      normalMap: texBundle.normalMap ?? null,
      normalScale: _normalScale,
      roughnessMap: texBundle.roughnessMap ?? null,
      roughness: body.id === 'earth' ? 0.94 : body.id === 'venus' ? 0.72 : 0.86,
      metalness: 0.02,
      envMapIntensity: body.id === 'earth' ? 0.14 : 0.18,
    });

    if (body.id === 'earth' && texBundle.emissiveMap) {
      mat.emissive = new THREE.Color('#ffc470');
      mat.emissiveMap = texBundle.emissiveMap;
      mat.emissiveIntensity = 2.25;
    }

    applyPlanetMicroDetailShader(mat, body.id);
    return mat;
  }, [body.id, texBundle]);

  const cloudsMat = useMemo(() => {
    if (!body.hasClouds || !texBundle.cloudsMap) return null;
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: texBundle.cloudsMap,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      roughness: 0.95,
      envMapIntensity: 0.08,
    });
    applyEarthCloudDetailShader(mat);
    return mat;
  }, [body.hasClouds, texBundle.cloudsMap]);

  const moonMaterials = useMemo(() => {
    if (!moonTexBundle || !body.moons) return {};
    const map: Record<string, THREE.MeshStandardMaterial> = {};
    for (const moon of body.moons) {
      const mat = new THREE.MeshStandardMaterial({
        color: moon.color,
        map: moonTexBundle.map,
        normalMap: moonTexBundle.normalMap ?? null,
        normalScale: _normalScale,
        roughnessMap: moonTexBundle.roughnessMap ?? null,
        roughness: 0.92,
        metalness: 0.02,
        envMapIntensity: 0.08,
      });
      applyPlanetMicroDetailShader(mat, 'moon');
      map[moon.id] = mat;
    }
    return map;
  }, [body.moons, moonTexBundle]);

  const ringMat = useMemo(() => {
    if (!body.hasRings || !texBundle.ringMap) return null;
    const mat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: texBundle.ringMap,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 0.84,
      metalness: 0.04,
      envMapIntensity: 0.18,
    });

    if (body.ringType === 'saturn') {
      applySaturnRingShadowShader(mat, ringShadowUniformRef.current);
    }

    return mat;
  }, [body.hasRings, body.ringType, texBundle.ringMap]);

  const ringGeom = useMemo(() => {
    if (!body.hasRings || !texBundle.ringMap) return null;
    const innerR =
      body.ringType === 'saturn' ? body.radiusVisual * 1.32 : body.radiusVisual * 1.45;
    const outerR =
      body.ringType === 'saturn' ? body.radiusVisual * 2.48 : body.radiusVisual * 1.98;
    const g = createRadialRingGeometry(innerR, outerR, 144);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [body.hasRings, body.ringType, body.radiusVisual, texBundle.ringMap]);

  useEffect(() => {
    return () => {
      texBundle.map.dispose();
      texBundle.normalMap?.dispose();
      texBundle.bumpMap?.dispose();
      texBundle.roughnessMap?.dispose();
      texBundle.emissiveMap?.dispose();
      texBundle.cloudsMap?.dispose();
      texBundle.ringMap?.dispose();
      if (moonTexBundle) {
        moonTexBundle.map.dispose();
        moonTexBundle.normalMap?.dispose();
        moonTexBundle.bumpMap?.dispose();
        moonTexBundle.roughnessMap?.dispose();
      }
      surfaceMat.dispose();
      cloudsMat?.dispose();
      for (const mMat of Object.values(moonMaterials)) {
        mMat.dispose();
      }
      ringMat?.dispose();
      atmoMat?.dispose();
      ringGeom?.dispose();
    };
  }, [texBundle, moonTexBundle, surfaceMat, cloudsMat, moonMaterials, ringMat, atmoMat, ringGeom]);

  useEffect(() => {
    const grp = groupRef.current;
    if (grp) {
      registryRef.current.set(body.id, {
        group: grp,
        currPos: grp.position.clone(),
        prevPos: grp.position.clone(),
      });
    }
  }, [body.id, registryRef]);

  // Compute osculating Keplerian orbit directly from the active Horizons window midpoint
  const orbitPoints = useMemo(() => {
    const samples = ephemeris.samplesByHorizonsId[body.horizonsId];
    if (!samples || samples.length === 0) return [];
    const midIdx = Math.floor(samples.length / 2);
    const state = interpolateStateVector(samples, samples[midIdx].timestampMs);
    if (!state) return [];
    return computeOsculatingOrbitPoints(state, 192).map(
      (p) => [p.x, p.y, p.z] as [number, number, number]
    );
  }, [ephemeris, body.horizonsId]);

  useFrame(() => {
    const grp = groupRef.current;
    if (!grp) return;

    const samples = ephemeris.samplesByHorizonsId[body.horizonsId];
    if (samples && samples.length > 0) {
      const state = interpolateStateVector(samples, simTimeMsRef.current);
      if (state) {
        const threePos = eclipticKmToThreePosition(state.x, state.y, state.z);
        const reg = registryRef.current.get(body.id);
        if (reg) {
          reg.prevPos.copy(reg.currPos);
          reg.currPos.set(threePos.x, threePos.y, threePos.z);
        }
        grp.position.set(threePos.x, threePos.y, threePos.z);
        ringShadowUniformRef.current.uSaturnPos.value.copy(grp.position);
      }
    }

    // Red Giant engulfment & thermal scorch response
    const sunRadius = 5.5 * sunScaleRef.current;
    const planetDist = grp.position.length();
    if (redGiantActive && planetDist > 0.1) {
      if (allEngulfedRef.current || sunRadius >= planetDist + body.radiusVisual * 0.35) {
        if (!engulfedRef.current) {
          engulfedRef.current = true;
          onBodyEngulfed?.(body.id);
        }
        grp.visible = false;
        if (orbitGroupRef.current) orbitGroupRef.current.visible = false;
        return;
      }

      engulfedRef.current = false;
      const ratio = sunRadius / planetDist;
      const heat = THREE.MathUtils.clamp((ratio - 0.65) / 0.36, 0, 1);
      grp.visible = true;
      if (orbitGroupRef.current) orbitGroupRef.current.visible = true;
      if (ratio > 0.96) {
        const shrink = THREE.MathUtils.clamp(1 - (ratio - 0.96) / 0.06, 0.05, 1);
        grp.scale.setScalar(shrink);
      } else {
        grp.scale.setScalar(1);
      }
      surfaceMat.color.copy(_whiteColor).lerp(_scorchColor, heat * 0.78);
      if (body.id !== 'earth') {
        surfaceMat.emissive.copy(_scorchColor);
        surfaceMat.emissiveIntensity = heat * 1.4;
      } else {
        surfaceMat.emissiveIntensity = 2.25 + heat * 1.8;
      }
    } else {
      if (engulfedRef.current || !grp.visible) {
        engulfedRef.current = false;
        grp.visible = true;
        grp.scale.setScalar(1);
        if (orbitGroupRef.current) orbitGroupRef.current.visible = true;
      }
      surfaceMat.color.copy(_whiteColor);
      if (body.id !== 'earth') {
        surfaceMat.emissiveIntensity = 0;
      } else {
        surfaceMat.emissiveIntensity = 2.25;
      }
    }

    // Real sidereal axial rotation
    const rotCycles = simTimeMsRef.current / (body.rotationPeriodHours * 3600 * 1000);
    if (surfaceRef.current) {
      surfaceRef.current.rotation.y = rotCycles * Math.PI * 2;
    }
    if (cloudsRef.current) {
      cloudsRef.current.rotation.y = rotCycles * Math.PI * 2 * 1.12;
    }

    // Update planetary moons
    if (showMoons && body.moons) {
      for (const moon of body.moons) {
        const mGrp = moonMeshRefs.current[moon.id];
        if (!mGrp) continue;

        if (moon.horizonsId && ephemeris.samplesByHorizonsId[moon.horizonsId]?.length) {
          const moonState = interpolateStateVector(
            ephemeris.samplesByHorizonsId[moon.horizonsId],
            simTimeMsRef.current
          );
          if (moonState) {
            const offset = moonGeocentricToThreeOffset(
              moonState.x,
              moonState.y,
              moonState.z,
              moon.orbitVisualRadius
            );
            mGrp.position.set(offset.x, offset.y, offset.z);
            const mEntry = registryRef.current.get(moon.id);
            if (mEntry) {
              mEntry.prevPos.copy(mEntry.currPos);
              mEntry.currPos.set(
                grp.position.x + offset.x,
                grp.position.y + offset.y,
                grp.position.z + offset.z
              );
            }
          }
        } else {
          const angle =
            (simTimeMsRef.current / (moon.orbitalPeriodDays * 86400 * 1000)) * Math.PI * 2;
          mGrp.position.set(
            Math.cos(angle) * moon.orbitVisualRadius,
            0,
            -Math.sin(angle) * moon.orbitVisualRadius
          );
        }
      }
    }
  });

  const hitRadius = Math.max(body.radiusVisual * 1.85, 2.2);
  const oblatenessY = body.id === 'saturn' ? 0.902 : body.id === 'jupiter' ? 0.935 : 1;

  return (
    <>
      {showOrbit && orbitPoints.length > 2 && (
        <group ref={orbitGroupRef}>
          <Line
            points={orbitPoints}
            color={body.orbitColor}
            lineWidth={isSelected ? 1.8 : 1.0}
            transparent
            opacity={isSelected ? 0.82 : 0.34}
          />
        </group>
      )}

      <group ref={groupRef}>
        <group rotation={[0, 0, THREE.MathUtils.degToRad(body.axialTiltDeg)]}>
          <mesh
            ref={surfaceRef}
            scale={[1, oblatenessY, 1]}
            onClick={(e) => {
              if (e.delta > 9) return;
              e.stopPropagation();
              onSelectBody(body.id);
            }}
          >
            <sphereGeometry args={[body.radiusVisual, 64, 48]} />
            <primitive object={surfaceMat} attach="material" />
          </mesh>

          {cloudsMat && (
            <mesh ref={cloudsRef}>
              <sphereGeometry args={[body.radiusVisual * 1.018, 56, 42]} />
              <primitive object={cloudsMat} attach="material" />
            </mesh>
          )}

          {atmoMat && (
            <mesh scale={[1, oblatenessY, 1]}>
              <sphereGeometry args={[body.radiusVisual * 1.038, 48, 36]} />
              <primitive object={atmoMat} attach="material" />
            </mesh>
          )}

          {ringGeom && ringMat && (
            <mesh geometry={ringGeom}>
              <primitive object={ringMat} attach="material" />
            </mesh>
          )}
        </group>

        {/* Planetary Moons */}
        {showMoons &&
          moonTexBundle &&
          body.moons?.map((moon: PlanetaryMoonSpec) => {
            const moonScale: [number, number, number] =
              moon.id === 'phobos'
                ? [1.32, 0.92, 0.82]
                : moon.id === 'deimos'
                  ? [1.25, 0.9, 0.84]
                  : [1, 1, 1];
            const mMat = moonMaterials[moon.id];
            if (!mMat) return null;
            return (
              <group
                key={moon.id}
                ref={(el) => {
                  moonMeshRefs.current[moon.id] = el;
                  if (el && moon.id === 'moon') {
                    registryRef.current.set('moon', {
                      group: el,
                      currPos: new THREE.Vector3(),
                      prevPos: new THREE.Vector3(),
                    });
                  }
                }}
              >
                <mesh
                  scale={moonScale}
                  onClick={(e) => {
                    if (e.delta > 9) return;
                    e.stopPropagation();
                    if (moon.id === 'moon') onSelectBody('moon');
                  }}
                >
                  <sphereGeometry args={[moon.radiusVisual, 36, 28]} />
                  <primitive object={mMat} attach="material" />
                </mesh>
              </group>
            );
          })}

        {/* Generous invisible hit sphere for effortless planet clicking */}
        <mesh
          onClick={(e) => {
            if (e.delta > 9) return;
            e.stopPropagation();
            onSelectBody(body.id);
          }}
        >
          <sphereGeometry args={[hitRadius, 14, 10]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

function CameraController({
  isSoftwareGl,
  selectedId,
  cameraSignal,
  sunScaleRef,
  registryRef,
}: {
  isSoftwareGl: boolean;
  selectedId: string | null;
  cameraSignal: CameraActionSignal;
  sunScaleRef: MutableRefObject<number>;
  registryRef: MutableRefObject<Map<string, BodyRegistryEntry>>;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, invalidate } = useThree();
  const animatingRef = useRef(false);
  const desiredOffsetRef = useRef(new THREE.Vector3(0, 12, 24));
  const returningHomeRef = useRef(false);

  useEffect(() => {
    if (cameraSignal.type === 'reset') {
      returningHomeRef.current = true;
      animatingRef.current = true;
      invalidate();
    } else if (cameraSignal.type === 'focus' && cameraSignal.bodyId) {
      const targetSpec = ALL_INSPECTABLE_BODIES.find((b) => b.id === cameraSignal.bodyId);
      const entry = registryRef.current.get(cameraSignal.bodyId);
      if (targetSpec && entry) {
        returningHomeRef.current = false;
        animatingRef.current = true;

        const r = targetSpec.radiusVisual;
        const dist =
          targetSpec.id === 'sun'
            ? Math.min(r * sunScaleRef.current * 3.5, 520)
            : targetSpec.id === 'saturn'
              ? r * 4.25
              : targetSpec.hasRings
                ? r * 3.85
                : targetSpec.id === 'moon'
                  ? 1.12
                  : r * 3.55;

        const sunToPlanet = _scratchVecA.copy(entry.currPos);
        if (sunToPlanet.lengthSq() < 0.01) sunToPlanet.set(0.3, 0, 1.0);
        sunToPlanet.y = 0;
        sunToPlanet.normalize();

        // ~62° crescent angle so close-ups highlight terminator craters, rim glow, and night-side city lights
        const toSunX = -sunToPlanet.x;
        const toSunZ = -sunToPlanet.z;
        const cosA = Math.cos(1.08);
        const sinA = Math.sin(1.08);
        const camDirX = toSunX * cosA - toSunZ * sinA;
        const camDirZ = toSunX * sinA + toSunZ * cosA;

        desiredOffsetRef.current
          .set(camDirX, 0.22, camDirZ)
          .normalize()
          .multiplyScalar(dist);

        if (targetSpec.id === 'sun') {
          desiredOffsetRef.current.set(0, 6.2, dist);
        }
        invalidate();
      }
    } else if (cameraSignal.type === 'zoomIn' || cameraSignal.type === 'zoomOut') {
      const ctrl = controlsRef.current;
      if (ctrl) {
        animatingRef.current = false;
        const factor = cameraSignal.type === 'zoomIn' ? 0.72 : 1.38;
        _scratchVecA.copy(camera.position).sub(ctrl.target);
        const nextLen = THREE.MathUtils.clamp(_scratchVecA.length() * factor, 0.55, 620);
        _scratchVecA.setLength(nextLen);
        camera.position.copy(ctrl.target).add(_scratchVecA);
        ctrl.update();
        invalidate();
      }
    }
  }, [cameraSignal, camera, invalidate, registryRef]);

  useFrame((_state, delta) => {
    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const stepDelta = Math.min(delta, isSoftwareGl ? 0.35 : 0.08);
    const dampAlpha = 1 - Math.exp(-(isSoftwareGl ? 12 : 5.8) * stepDelta);

    if (selectedId && !returningHomeRef.current) {
      const entry = registryRef.current.get(selectedId);
      if (entry) {
        _scratchDelta.copy(entry.currPos).sub(entry.prevPos);
        ctrl.target.add(_scratchDelta);
        camera.position.add(_scratchDelta);

        if (animatingRef.current) {
          ctrl.target.lerp(entry.currPos, dampAlpha);
          _scratchVecB.copy(entry.currPos).add(desiredOffsetRef.current);
          camera.position.lerp(_scratchVecB, dampAlpha);
          if (
            camera.position.distanceTo(_scratchVecB) < 0.08 &&
            ctrl.target.distanceTo(entry.currPos) < 0.05
          ) {
            animatingRef.current = false;
          }
        }
      }
    } else if (returningHomeRef.current && animatingRef.current) {
      ctrl.target.lerp(OVERVIEW_TARGET, dampAlpha);
      camera.position.lerp(OVERVIEW_CAM_POS, dampAlpha);
      if (
        camera.position.distanceTo(OVERVIEW_CAM_POS) < 0.3 &&
        ctrl.target.distanceTo(OVERVIEW_TARGET) < 0.12
      ) {
        animatingRef.current = false;
        returningHomeRef.current = false;
      }
    }

    ctrl.update();
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping={!isSoftwareGl}
      dampingFactor={0.055}
      enablePan
      minDistance={0.55}
      maxDistance={900}
      rotateSpeed={0.72}
      zoomSpeed={0.9}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
      onStart={() => {
        animatingRef.current = false;
        returningHomeRef.current = false;
      }}
    />
  );
}

export function SolarSystemCanvas({
  ephemeris,
  simTimeMsRef,
  selectedId,
  layers,
  lightingMode,
  cameraSignal,
  redGiantActive = false,
  redGiantStartMsRef,
  onBodyEngulfed,
  onSelectBody,
  onContextLost,
}: SolarSystemCanvasProps) {
  const [isSoftwareGl] = useState(() => detectSoftwareWebGL());
  const registryRef = useRef<Map<string, BodyRegistryEntry>>(new Map());
  const labelButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const sunScaleRef = useRef(1);
  const redGiantProgressRef = useRef(0);
  const flashRef = useRef(0);
  const remnantRef = useRef(0);
  const blastProgressRef = useRef(0);
  const blastAlphaRef = useRef(0);
  const burstFlareRef = useRef(0);
  const allEngulfedRef = useRef(false);

  return (
    <div
      data-testid="solar-system-canvas"
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
    >
      <Canvas
        frameloop={isSoftwareGl ? 'demand' : 'always'}
        dpr={isSoftwareGl ? 1 : [1, 2]}
        camera={{ position: [0, 142, 340], fov: 44, near: 0.15, far: 3000 }}
        gl={{
          antialias: !isSoftwareGl,
          powerPreference: 'high-performance',
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.14,
        }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            onContextLost(true);
          });
          canvas.addEventListener('webglcontextrestored', () => {
            onContextLost(false);
          });
        }}
      >
        <SoftwareGlPacer isSoftwareGl={isSoftwareGl} />
        <RedGiantController
          active={redGiantActive}
          startMsRef={redGiantStartMsRef}
          sunScaleRef={sunScaleRef}
          redGiantProgressRef={redGiantProgressRef}
          flashRef={flashRef}
          remnantRef={remnantRef}
          blastProgressRef={blastProgressRef}
          blastAlphaRef={blastAlphaRef}
          burstFlareRef={burstFlareRef}
          allEngulfedRef={allEngulfedRef}
        />
        <SpaceLightingRig
          lightingMode={lightingMode}
          redGiantProgressRef={redGiantProgressRef}
          flashRef={flashRef}
          remnantRef={remnantRef}
          burstFlareRef={burstFlareRef}
        />

        <StarfieldAndBelt
          showStarfield={layers.starfield}
          showAsteroidBelt={layers.asteroidBelt}
          simTimeMsRef={simTimeMsRef}
          sunScaleRef={sunScaleRef}
          allEngulfedRef={allEngulfedRef}
        />

        {ephemeris &&
          SOLAR_SYSTEM_BODIES.map((body) =>
            body.id === 'sun' ? (
              <SunMesh
                key={body.id}
                body={body}
                simTimeMsRef={simTimeMsRef}
                sunScaleRef={sunScaleRef}
                redGiantProgressRef={redGiantProgressRef}
                flashRef={flashRef}
                remnantRef={remnantRef}
                blastProgressRef={blastProgressRef}
                blastAlphaRef={blastAlphaRef}
                burstFlareRef={burstFlareRef}
                onSelectBody={onSelectBody}
                registryRef={registryRef}
              />
            ) : (
              <PlanetNode
                key={body.id}
                body={body}
                ephemeris={ephemeris}
                simTimeMsRef={simTimeMsRef}
                redGiantActive={redGiantActive}
                sunScaleRef={sunScaleRef}
                allEngulfedRef={allEngulfedRef}
                showOrbit={layers.orbits}
                showMoons={layers.moons}
                isSelected={selectedId === body.id}
                onSelectBody={onSelectBody}
                onBodyEngulfed={onBodyEngulfed}
                registryRef={registryRef}
              />
            )
          )}

        <LabelProjector
          enabled={Boolean(ephemeris && layers.labels)}
          showMoons={layers.moons}
          selectedId={selectedId}
          sunScaleRef={sunScaleRef}
          registryRef={registryRef}
          labelButtonRefs={labelButtonRefs}
        />

        <CameraController
          isSoftwareGl={isSoftwareGl}
          selectedId={selectedId}
          cameraSignal={cameraSignal}
          sunScaleRef={sunScaleRef}
          registryRef={registryRef}
        />
      </Canvas>

      {/* Projected 2D Object Labels Overlay (keeps React 19 single-root clean & collision-free) */}
      <div
        className={
          ephemeris && layers.labels
            ? 'pointer-events-none absolute inset-0 overflow-hidden z-10'
            : 'hidden'
        }
      >
        {ALL_INSPECTABLE_BODIES.map((body) => {
          const isSelected = selectedId === body.id;
          const isSun = body.id === 'sun';
          return (
            <button
              key={body.id}
              ref={(el) => {
                labelButtonRefs.current[body.id] = el;
              }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectBody(body.id);
              }}
              aria-label={`Select ${body.name}`}
              style={{ display: 'none', left: 0, top: 0 }}
              className={`pointer-events-auto absolute px-1.5 py-0.5 font-medium tracking-wider uppercase whitespace-nowrap rounded transition-colors cursor-pointer ${
                isSun ? 'text-[11px]' : 'text-[10px]'
              } ${
                isSelected
                  ? 'bg-[#2b7fff] text-white'
                  : isSun
                    ? 'text-amber-200/90 hover:text-white bg-black/55'
                    : 'text-slate-200/90 hover:text-white bg-black/55'
              }`}
            >
              {body.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
