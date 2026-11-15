import * as THREE from 'three';

export interface StarfieldHandle {
  group: THREE.Group;
  update: (elapsedTime: number, delta: number) => void;
  dispose: () => void;
}

const SPECTRAL_PALETTE = [
  new THREE.Color('#cad8ff'), // O/B blue-white
  new THREE.Color('#eef2ff'), // A white
  new THREE.Color('#fff5e4'), // G yellow-white
  new THREE.Color('#ffd8a8'), // K pale amber
  new THREE.Color('#ffb88c'), // M warm red-orange
];

function pseudoRand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function createMovingStarfield(): StarfieldHandle {
  const group = new THREE.Group();

  // 1. Primary 3D Moving & Twinkling Multi-Spectral Starfield
  const starCount = 4200;
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);
  const sizes = new Float32Array(starCount);
  const phases = new Float32Array(starCount);
  const speeds = new Float32Array(starCount);

  for (let i = 0; i < starCount; i++) {
    const r = 240 + Math.pow(pseudoRand(i * 3 + 1), 0.7) * 680;
    const theta = pseudoRand(i * 3 + 2) * Math.PI * 2;
    const phi = Math.acos(2 * pseudoRand(i * 3 + 3) - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

    const specIdx = Math.min(
      SPECTRAL_PALETTE.length - 1,
      Math.floor(pseudoRand(i * 7 + 5) * SPECTRAL_PALETTE.length)
    );
    const col = SPECTRAL_PALETTE[specIdx];
    const brightness = 0.78 + pseudoRand(i * 7 + 9) * 0.22;
    colors[i * 3] = col.r * brightness;
    colors[i * 3 + 1] = col.g * brightness;
    colors[i * 3 + 2] = col.b * brightness;

    sizes[i] = 1.9 + Math.pow(pseudoRand(i * 5 + 11), 2.4) * 5.2;
    phases[i] = pseudoRand(i * 5 + 13) * Math.PI * 2;
    speeds[i] = 0.6 + pseudoRand(i * 5 + 17) * 2.4;
  }

  const starGeom = new THREE.BufferGeometry();
  starGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeom.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  starGeom.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  starGeom.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  starGeom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vColor = aColor;
        // Subtle parallax orbital drift + natural scintillation
        float driftAngle = uTime * 0.006 * aSpeed;
        float s = sin(driftAngle);
        float c = cos(driftAngle);
        vec3 pos = position;
        pos.xz = mat2(c, -s, s, c) * pos.xz;
        pos.y += sin(uTime * 0.18 * aSpeed + aPhase) * 1.8;

        vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float twinkle = 0.72 + 0.28 * sin(uTime * aSpeed * 1.8 + aPhase);
        vAlpha = twinkle;
        gl_PointSize = clamp(aSize * uPixelRatio * (390.0 / -mvPosition.z), 1.6, 11.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        float core = exp(-d * d * 18.0);
        float halo = smoothstep(0.5, 0.0, d) * 0.62;
        float alpha = clamp(core + halo, 0.0, 1.0) * vAlpha;
        gl_FragColor = vec4(vColor * 1.25, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const starPoints = new THREE.Points(starGeom, starMat);
  starPoints.frustumCulled = false;
  group.add(starPoints);

  // 2. Drifting Foreground Cosmic Micro-Dust (gives strong sensation of space depth & motion)
  const dustCount = 560;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSizes = new Float32Array(dustCount);
  const dustPhases = new Float32Array(dustCount);

  for (let i = 0; i < dustCount; i++) {
    const r = 35 + pseudoRand(i * 11 + 1) * 175;
    const angle = pseudoRand(i * 11 + 2) * Math.PI * 2;
    dustPos[i * 3] = Math.cos(angle) * r;
    dustPos[i * 3 + 1] = (pseudoRand(i * 11 + 3) - 0.5) * 80;
    dustPos[i * 3 + 2] = Math.sin(angle) * r;
    dustSizes[i] = 1.8 + pseudoRand(i * 11 + 4) * 2.4;
    dustPhases[i] = pseudoRand(i * 11 + 5) * Math.PI * 2;
  }

  const dustGeom = new THREE.BufferGeometry();
  dustGeom.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeom.setAttribute('aSize', new THREE.BufferAttribute(dustSizes, 1));
  dustGeom.setAttribute('aPhase', new THREE.BufferAttribute(dustPhases, 1));

  const dustMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aPhase;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 pos = position;
        float angle = uTime * 0.02;
        float s = sin(angle);
        float c = cos(angle);
        pos.xz = mat2(c, -s, s, c) * pos.xz;
        pos.y += cos(uTime * 0.25 + aPhase) * 1.1;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        vAlpha = 0.38 + 0.28 * sin(uTime + aPhase);
        gl_PointSize = clamp(aSize * uPixelRatio * (210.0 / -mv.z), 1.4, 6.0);
      }
    `,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float falloff = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(0.68, 0.8, 1.0, falloff * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const dustPoints = new THREE.Points(dustGeom, dustMat);
  dustPoints.frustumCulled = false;
  group.add(dustPoints);

  // 3. Subtle Galactic Plane Band (Milky Way soft starlight belt)
  const bandCount = 1600;
  const bandPos = new Float32Array(bandCount * 3);
  const bandCol = new Float32Array(bandCount * 3);
  const bandSize = new Float32Array(bandCount);
  const bandPhase = new Float32Array(bandCount);
  const bandSpeed = new Float32Array(bandCount);

  for (let i = 0; i < bandCount; i++) {
    const r = 460 + pseudoRand(i * 13 + 1) * 320;
    const theta = pseudoRand(i * 13 + 2) * Math.PI * 2;
    const spreadY = (pseudoRand(i * 13 + 3) + pseudoRand(i * 13 + 4) - 1) * 95;
    // Tilt the Milky Way plane 28 degrees
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const y = spreadY;
    const tilt = 0.48;
    bandPos[i * 3] = x;
    bandPos[i * 3 + 1] = y * Math.cos(tilt) - z * Math.sin(tilt);
    bandPos[i * 3 + 2] = y * Math.sin(tilt) + z * Math.cos(tilt);

    const mixT = pseudoRand(i * 13 + 5);
    bandCol[i * 3] = 0.45 + mixT * 0.35;
    bandCol[i * 3 + 1] = 0.55 + mixT * 0.3;
    bandCol[i * 3 + 2] = 0.85 + mixT * 0.15;

    bandSize[i] = 1.0 + pseudoRand(i * 13 + 6) * 2.2;
    bandPhase[i] = pseudoRand(i * 13 + 7) * Math.PI * 2;
    bandSpeed[i] = 0.35 + pseudoRand(i * 13 + 8) * 0.65;
  }

  const bandGeom = new THREE.BufferGeometry();
  bandGeom.setAttribute('position', new THREE.BufferAttribute(bandPos, 3));
  bandGeom.setAttribute('aColor', new THREE.BufferAttribute(bandCol, 3));
  bandGeom.setAttribute('aSize', new THREE.BufferAttribute(bandSize, 1));
  bandGeom.setAttribute('aPhase', new THREE.BufferAttribute(bandPhase, 1));
  bandGeom.setAttribute('aSpeed', new THREE.BufferAttribute(bandSpeed, 1));

  const bandPoints = new THREE.Points(bandGeom, starMat);
  bandPoints.frustumCulled = false;
  group.add(bandPoints);

  return {
    group,
    update(elapsedTime: number, delta: number) {
      starMat.uniforms.uTime.value = elapsedTime;
      dustMat.uniforms.uTime.value = elapsedTime;
      group.rotation.y += delta * 0.0028;
    },
    dispose() {
      starGeom.dispose();
      starMat.dispose();
      dustGeom.dispose();
      dustMat.dispose();
      bandGeom.dispose();
    },
  };
}

export interface AsteroidBeltHandle {
  mesh: THREE.InstancedMesh;
  update: (delta: number) => void;
  dispose: () => void;
}

export function createAsteroidBelt(count = 680): AsteroidBeltHandle {
  const geom = new THREE.IcosahedronGeometry(0.095, 1);
  // Irregular rocky boulder silhouette
  const posAttr = geom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const jitter = 0.72 + pseudoRand(Math.round(vx * 50) * 19 + Math.round(vy * 50) * 37 + Math.round(vz * 50) * 53) * 0.48;
    posAttr.setXYZ(i, vx * jitter, vy * jitter * 0.76, vz * jitter);
  }
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0.04,
    envMapIntensity: 0.06,
  });

  const mesh = new THREE.InstancedMesh(geom, mat, count);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + pseudoRand(i * 3 + 1) * 0.25;
    // Main asteroid belt spans ~2.15 to 3.25 AU -> kmToSceneRadius(2.15..3.25 AU) = ~66.7..78.9
    const radius = 66.7 + pseudoRand(i * 3 + 2) * 12.2;
    const y = (pseudoRand(i * 3 + 3) - 0.5) * 3.0;

    dummy.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    dummy.rotation.set(
      pseudoRand(i * 5 + 1) * Math.PI,
      pseudoRand(i * 5 + 2) * Math.PI,
      pseudoRand(i * 5 + 3) * Math.PI
    );
    const scale = 0.45 + Math.pow(pseudoRand(i * 7 + 1), 2.1) * 1.25;
    dummy.scale.set(scale, scale * (0.68 + pseudoRand(i * 7 + 2) * 0.46), scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    const shade = 0.10 + pseudoRand(i * 11) * 0.16;
    color.setRGB(shade * 1.04, shade * 0.96, shade * 0.88);
    mesh.setColorAt(i, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();

  return {
    mesh,
    update(delta: number) {
      mesh.rotation.y += delta * 0.025;
    },
    dispose() {
      geom.dispose();
      mat.dispose();
    },
  };
}
