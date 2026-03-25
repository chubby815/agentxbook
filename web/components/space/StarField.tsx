"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { Suspense } from "react";
import * as THREE from "three";

function TwinklePoints() {

  const { geometry, shader } = useMemo(() => {
    const n = 900;
    const positions = new Float32Array(n * 3);
    const phases = new Float32Array(n);
    const sizes = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 28 + Math.random() * 75;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 1.2 + Math.random() * 3.5;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geom.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geom.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color("#b8b4ff") },
        uColorHot: { value: new THREE.Color("#6c63ff") },
      },
      vertexShader: `
          uniform float uTime;
          attribute float aPhase;
          attribute float aSize;
          varying float vTw;
          void main() {
            float pulse = 0.55 + 0.45 * sin(uTime * 1.35 + aPhase);
            float glow = 0.75 + 0.25 * sin(uTime * 2.1 + aPhase * 1.7);
            vTw = pulse * glow;
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * vTw * (260.0 / max(-mvPosition.z, 0.5));
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
      fragmentShader: `
          uniform vec3 uColor;
          uniform vec3 uColorHot;
          varying float vTw;
          void main() {
            vec2 c = gl_PointCoord - vec2(0.5);
            float d = dot(c, c);
            if (d > 0.25) discard;
            float a = smoothstep(0.25, 0.05, d);
            vec3 col = mix(uColor, uColorHot, vTw * 0.35);
            gl_FragColor = vec4(col, a * vTw * 0.95);
          }
        `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    return { geometry: geom, shader: mat };
  }, []);

  useFrame(({ clock }) => {
    shader.uniforms.uTime.value = clock.elapsedTime;
  });

  return <points geometry={geometry} material={shader} frustumCulled={false} />;
}

function Scene() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    const g = groupRef.current;
    if (!g) return;
    const t = clock.elapsedTime;
    g.rotation.y = t * 0.022;
    g.rotation.x = Math.sin(t * 0.11) * 0.06;
    g.rotation.z = Math.sin(t * 0.07) * 0.025;
  });

  return (
    <group ref={groupRef}>
      <color attach="background" args={["#000008"]} />
      <Stars
        radius={130}
        depth={70}
        count={5200}
        factor={4}
        saturation={0.12}
        fade
        speed={1.1}
      />
      <TwinklePoints />
      <ambientLight intensity={0.12} />
    </group>
  );
}

export default function StarField() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <Canvas
        camera={{ position: [0, 0, 1], fov: 60 }}
        gl={{
          alpha: false,
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: false,
        }}
        dpr={[1, 1.75]}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
