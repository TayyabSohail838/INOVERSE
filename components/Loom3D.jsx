"use client";
// The cofounder's body: a sphere woven from warp (turmeric) and weft (indigo) threads,
// a nod to Faisalabad's looms. Five satellites orbit it, one per gap-check reviewer.
//   listening → threads ripple with the real microphone level
//   thinking  → the weave tightens and twists
//   speaking  → pulses run along the weft
//   verdict   → each reviewer moves closer the higher it scored; the weave takes the verdict's colour
import { useEffect, useRef } from "react";
import * as THREE from "three";

export const COUNCIL = [
  { key: "critic", label: "Critic", color: "#D0545F" },
  { key: "champion", label: "Champion", color: "#E2A93B" },
  { key: "analyst", label: "Analyst", color: "#93A9EC" },
  { key: "investigator", label: "Investigator", color: "#7CC6B6" },
  { key: "customer", label: "Customer", color: "#EFE8DA" },
];

const VERDICT_TINT = { GO: "#4FA67F", RESHAPE: "#E2A93B", KILL: "#D0545F" };

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uAmp;
  uniform float uThink;
  uniform float uSpeak;
  uniform float uMotion;
  attribute vec2 aUV;
  attribute float aKind;
  varying float vKind;
  varying float vShade;
  void main() {
    vec3 n = normalize(position);
    float u = aUV.x;
    float v = aUV.y;
    // over-under: where the warp rises the weft dips, like real cloth
    float weave = sin(u * 72.0 * 3.14159) * sin(v * 40.0 * 3.14159);
    float over = (aKind < 0.5 ? 1.0 : -1.0) * weave * 0.02;
    float breathe = sin(uTime * 0.6 + u * 12.566) * 0.014 * uMotion;
    float ripple = sin(v * 18.0 - uTime * 4.0) * uAmp * 0.14;
    float speak = sin(v * 10.0 + uTime * 9.0) * uSpeak * 0.045 * (0.6 + 0.4 * sin(uTime * 2.3));
    float radius = 1.0 + over + breathe + ripple + speak - uThink * 0.09;
    vec3 p = n * radius;
    float tw = uThink * sin(uTime * 1.4) * 0.7 * (v - 0.5) * uMotion;
    float c = cos(tw);
    float s = sin(tw);
    p.xz = mat2(c, -s, s, c) * p.xz;
    vec3 viewN = normalize(normalMatrix * n);
    vShade = clamp(0.25 + 0.75 * viewN.z, 0.0, 1.0);
    vKind = aKind;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uWarp;
  uniform vec3 uWeft;
  uniform vec3 uTint;
  uniform float uTintMix;
  varying float vKind;
  varying float vShade;
  void main() {
    vec3 col = mix(uWarp, uWeft, vKind);
    col = mix(col, uTint, uTintMix);
    float a = mix(0.12, 0.95, vShade);
    gl_FragColor = vec4(col * (0.5 + 0.7 * vShade), a);
  }
`;

function buildWeave() {
  const pos = [];
  const uv = [];
  const kind = [];
  const push = (theta, phi, k) => {
    pos.push(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
    uv.push(theta / (Math.PI * 2), phi / Math.PI);
    kind.push(k);
  };
  const WARP = 72, WARP_SEG = 96, WEFT = 40, WEFT_SEG = 144;
  for (let i = 0; i < WARP; i++) {
    const theta = (i / WARP) * Math.PI * 2;
    for (let j = 0; j < WARP_SEG; j++) {
      push(theta, (j / WARP_SEG) * Math.PI, 0);
      push(theta, ((j + 1) / WARP_SEG) * Math.PI, 0);
    }
  }
  for (let k = 0; k < WEFT; k++) {
    const phi = ((k + 0.5) / WEFT) * Math.PI;
    for (let j = 0; j < WEFT_SEG; j++) {
      push((j / WEFT_SEG) * Math.PI * 2, phi, 1);
      push(((j + 1) / WEFT_SEG) * Math.PI * 2, phi, 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aUV", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("aKind", new THREE.Float32BufferAttribute(kind, 1));
  return g;
}

export default function Loom3D({ state = "idle", levelRef, panel = null, verdict = null }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);
  const live = useRef({ state, panel, verdict });
  live.current = { state, panel, verdict };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      wrap.dataset.nowebgl = "true";
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const motion = reduce ? 0.2 : 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    const root = new THREE.Group();
    scene.add(root);

    // the woven core
    const weaveGeo = buildWeave();
    const uniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0 },
      uThink: { value: 0 },
      uSpeak: { value: 0 },
      uMotion: { value: motion },
      uWarp: { value: new THREE.Color("#22D3EE") },
      uWeft: { value: new THREE.Color("#2F6BFF") },
      uTint: { value: new THREE.Color("#22D3EE") },
      uTintMix: { value: 0 },
    };
    const weaveMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
    });
    const weave = new THREE.LineSegments(weaveGeo, weaveMat);
    root.add(weave);

    // loose cotton fibres drifting inside
    const FIBRES = 700;
    const fp = new Float32Array(FIBRES * 3);
    for (let i = 0; i < FIBRES; i++) {
      const r = Math.cbrt(Math.random()) * 0.78;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      fp.set([r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t)], i * 3);
    }
    const fibreGeo = new THREE.BufferGeometry();
    fibreGeo.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    const fibreMat = new THREE.PointsMaterial({ color: "#CFFAFE", size: 0.012, transparent: true, opacity: 0.35, depthWrite: false });
    const fibres = new THREE.Points(fibreGeo, fibreMat);
    root.add(fibres);

    // the council: five reviewers on tilted orbits
    const satGeo = new THREE.OctahedronGeometry(0.065);
    const ringGeos = [];
    const sats = COUNCIL.map((c, i) => {
      const tilt = new THREE.Group();
      tilt.rotation.set(0.35 + i * 0.28, i * 1.257, 0.15 * i);
      const mat = new THREE.MeshBasicMaterial({ color: c.color });
      const mesh = new THREE.Mesh(satGeo, mat);
      tilt.add(mesh);
      const ringPts = [];
      for (let k = 0; k <= 96; k++) {
        const a = (k / 96) * Math.PI * 2;
        ringPts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
      const rg = new THREE.BufferGeometry().setFromPoints(ringPts);
      ringGeos.push(rg);
      const ringMat = new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.12 });
      const ring = new THREE.LineLoop(rg, ringMat);
      tilt.add(ring);
      root.add(tilt);
      return { mesh, mat, ring, ringMat, phase: i * 1.3, speed: 0.22 + i * 0.03, r: 1.65, scale: 1 };
    });

    // pointer parallax (only moves when the person moves)
    const pointer = { x: 0, y: 0 };
    const onPointer = (e) => {
      const b = wrap.getBoundingClientRect();
      pointer.x = ((e.clientX - b.left) / b.width - 0.5) * 2;
      pointer.y = ((e.clientY - b.top) / b.height - 0.5) * 2;
    };
    wrap.addEventListener("pointermove", onPointer);

    const resize = () => {
      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.position.set(0, 0, camera.aspect < 1 ? 7 / camera.aspect : 7);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    const tint = new THREE.Color();
    const tmp = new THREE.Vector3();
    const clock = new THREE.Clock();
    let speakLevel = 0;
    let raf = 0;

    const ease = (cur, target, k) => cur + (target - cur) * k;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const { state: st, panel: pn, verdict: vd } = live.current;

      uniforms.uTime.value = t;
      const mic = st === "listening" ? Math.min(1, (levelRef?.current || 0) * 6) : 0;
      uniforms.uAmp.value = ease(uniforms.uAmp.value, mic * motion, 0.25);
      uniforms.uThink.value = ease(uniforms.uThink.value, st === "thinking" ? 1 : 0, 0.05);
      // While speaking, follow the real voice level when we have it; otherwise a steady pulse
      const voice = levelRef?.current || 0;
      speakLevel =
        st !== "speaking"
          ? 0
          : voice > 0.003
            ? Math.min(1, 0.25 + voice * 7)
            : 0.55 + 0.45 * Math.abs(Math.sin(t * 7.1) * Math.sin(t * 3.3));
      uniforms.uSpeak.value = ease(uniforms.uSpeak.value, speakLevel * motion, 0.2);

      if (vd && VERDICT_TINT[vd]) {
        tint.set(VERDICT_TINT[vd]);
        uniforms.uTint.value.lerp(tint, 0.05);
        uniforms.uTintMix.value = ease(uniforms.uTintMix.value, 0.45, 0.03);
      } else {
        uniforms.uTintMix.value = ease(uniforms.uTintMix.value, 0, 0.03);
      }

      root.rotation.y += dt * 0.08 * motion * (st === "thinking" ? 3 : 1);
      root.rotation.x = ease(root.rotation.x, pointer.y * 0.15, 0.04);
      root.rotation.z = ease(root.rotation.z, -pointer.x * 0.08, 0.04);
      fibres.rotation.y -= dt * 0.05 * motion;

      const speedUp = st === "thinking" ? 4 : 1;
      sats.forEach((s, i) => {
        const score = pn?.[COUNCIL[i].key]?.score;
        const targetR = score ? 2.15 - score * 0.07 : 1.65;
        const targetScale = score ? 0.55 + score * 0.12 : 1;
        s.r = ease(s.r, targetR, 0.04);
        s.scale = ease(s.scale, targetScale, 0.05);
        s.phase += dt * s.speed * speedUp * motion;
        s.mesh.position.set(Math.cos(s.phase) * s.r, 0, Math.sin(s.phase) * s.r);
        s.mesh.scale.setScalar(s.scale);
        s.mesh.rotation.y += dt * 1.2;
        s.ring.scale.setScalar(s.r);
        s.ringMat.opacity = ease(s.ringMat.opacity, score ? 0.08 + score * 0.025 : 0.12, 0.05);

        // label follows its reviewer on screen; dims when behind the core
        const el = labelRefs.current[i];
        if (el) {
          s.mesh.getWorldPosition(tmp);
          const depth = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z;
          tmp.project(camera);
          const x = (tmp.x * 0.5 + 0.5) * wrap.clientWidth;
          const y = (-tmp.y * 0.5 + 0.5) * wrap.clientHeight;
          el.style.transform = `translate(${x + 10}px, ${y - 8}px)`;
          el.style.opacity = depth < -7 ? "0.35" : "1";
        }
      });

      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      wrap.removeEventListener("pointermove", onPointer);
      weaveGeo.dispose();
      weaveMat.dispose();
      fibreGeo.dispose();
      fibreMat.dispose();
      satGeo.dispose();
      ringGeos.forEach((g) => g.dispose());
      sats.forEach((s) => {
        s.mat.dispose();
        s.ringMat.dispose();
      });
      renderer.dispose();
    };
  }, [levelRef]);

  return (
    <div className="loom" ref={wrapRef}>
      <canvas ref={canvasRef} className="loom-canvas" aria-hidden="true" />
      <div className="loom-fallback" aria-hidden="true" />
      {COUNCIL.map((c, i) => (
        <div
          key={c.key}
          className="council-label"
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          style={{ "--c": c.color }}
        >
          {c.label}
          {panel?.[c.key]?.score ? <b>{panel[c.key].score}</b> : null}
        </div>
      ))}
    </div>
  );
}
