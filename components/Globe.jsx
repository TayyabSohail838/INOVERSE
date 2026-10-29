"use client";
// Inovo's body: a liquid-glass globe on black.
//   idle      → slow breathing surface, colours drift across the glass
//   listening → ripples run across the surface and follow your mic
//   thinking  → the liquid swirls faster and the colours spin
//   speaking  → the surface swells and wobbles with Inovo's voice
// The colour comes from the current role (CFO gold, CTO blue, ...).
import { useEffect, useRef } from "react";
import * as THREE from "three";

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
const NOISE = /* glsl */ `
  vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
  vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.0*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);
    vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);
    vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
    vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;
    return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }
`;

const VERT = /* glsl */ `
  uniform float uPhase;
  uniform float uAmp;
  uniform float uFreq;
  uniform float uRipple;
  uniform float uRipplePhase;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vNoise;
  ${NOISE}

  // how far the surface moves out along direction d
  float shape(vec3 d){
    float n = snoise(d * uFreq + vec3(0.0, 0.0, uPhase));
    n += 0.5 * snoise(d * uFreq * 2.2 - vec3(uPhase * 1.3, 0.0, 0.0));
    // listening: rings that run from the front of the globe outwards
    float rip = sin(acos(clamp(d.z, -1.0, 1.0)) * 16.0 - uRipplePhase) * uRipple;
    return n * uAmp + rip;
  }

  void main(){
    vec3 d = normalize(position);
    vec3 p = d * (1.0 + shape(d));
    // normal of the moved surface, from two nearby points
    vec3 t = normalize(cross(d, abs(d.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
    vec3 b = cross(d, t);
    float e = 0.01;
    vec3 d1 = normalize(d + t * e);
    vec3 d2 = normalize(d + b * e);
    vec3 p1 = d1 * (1.0 + shape(d1));
    vec3 p2 = d2 * (1.0 + shape(d2));
    vec3 n = normalize(cross(p1 - p, p2 - p));
    if (dot(n, d) < 0.0) n = -n;

    vNoise = snoise(d * 1.6 + vec3(uPhase * 0.6));
    vNormal = normalize(normalMatrix * n);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vViewPos = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  uniform float uHue;
  uniform float uGlow;
  uniform vec3 uLight;
  varying vec3 vNormal;
  varying vec3 vViewPos;
  varying float vNoise;

  void main(){
    vec3 n = normalize(vNormal);
    vec3 v = normalize(-vViewPos);
    float facing = max(dot(n, v), 0.0);
    float fr = pow(1.0 - facing, 2.0);

    // thin-film colours, like oil on water or a liquid crystal screen
    float t = fr * 1.3 + vNoise * 0.4 + uHue;
    vec3 irid = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
    vec3 tint = mix(mix(uColor2, uColor, fr), irid, 0.35);

    // dark glassy body with a swirl of the role colour inside it
    float swirl = smoothstep(0.1, 0.9, vNoise * 0.5 + 0.5);
    vec3 body = mix(uColor2 * 0.05, uColor * 0.22, swirl * swirl) * (0.7 + uGlow * 0.6);

    // studio light reflections on the glass
    vec3 r = reflect(-v, n);
    float key = pow(max(dot(r, uLight), 0.0), 60.0); // the shine faces your mouse
    float soft = pow(max(dot(r, normalize(vec3(0.6, -0.2, 0.75))), 0.0), 8.0);
    float band = smoothstep(0.92, 1.0, r.y) * 0.5;

    vec3 col = body;
    col += tint * fr * (1.2 + uGlow);
    col += vec3(1.0) * key * 1.1;
    col += mix(vec3(1.0), uColor, 0.6) * (soft * 0.18 + band * 0.25);
    col += irid * uColor * pow(facing, 6.0) * 0.12 * (1.0 + uGlow);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// per state: how much the surface moves, how fast, how bright
const LOOK = {
  idle: { amp: 0.045, freq: 1.3, speed: 0.22, hue: 0.03, glow: 0.0, ripple: 0 },
  starting: { amp: 0.05, freq: 1.4, speed: 0.35, hue: 0.05, glow: 0.2, ripple: 0.006 },
  listening: { amp: 0.04, freq: 1.5, speed: 0.4, hue: 0.06, glow: 0.3, ripple: 0.012 },
  thinking: { amp: 0.07, freq: 1.9, speed: 1.2, hue: 0.35, glow: 0.45, ripple: 0 },
  speaking: { amp: 0.055, freq: 1.7, speed: 0.55, hue: 0.08, glow: 0.4, ripple: 0 },
};

export default function Globe({ state, levelRef, color, color2 }) {
  const wrapRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const colorRef = useRef({ color, color2 });
  colorRef.current = { color, color2 };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      wrap.classList.add("globe-flat"); // no WebGL: CSS draws a plain glowing globe instead
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    wrap.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(0, 0, 5);

    const uniforms = {
      uPhase: { value: 0 },
      uAmp: { value: LOOK.idle.amp },
      uFreq: { value: LOOK.idle.freq },
      uRipple: { value: 0 },
      uRipplePhase: { value: 0 },
      uHue: { value: 0 },
      uGlow: { value: 0 },
      uLight: { value: new THREE.Vector3(-0.5, 0.65, 0.55).normalize() },
      uColor: { value: new THREE.Color(colorRef.current.color) },
      uColor2: { value: new THREE.Color(colorRef.current.color2) },
    };
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 52),
      new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG })
    );
    scene.add(mesh);

    const fit = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    fit();

    // mouse tracking: px/py is where the pointer is (-0.5 to 0.5 across the screen),
    // mx/my eases after it so the globe follows smoothly instead of snapping
    let px = 0;
    let py = 0;
    let mx = 0;
    let my = 0;
    const onMove = (e) => {
      px = e.clientX / window.innerWidth - 0.5;
      py = e.clientY / window.innerHeight - 0.5;
    };
    const onLeave = () => {
      px = 0;
      py = 0;
    };
    window.addEventListener("pointermove", onMove);
    document.addEventListener("pointerleave", onLeave);

    const target = new THREE.Color();
    const target2 = new THREE.Color();
    let level = 0;
    let look = { ...LOOK.idle };
    let hue = 0;
    let ripplePhase = 0;
    let spin = 0;
    let last = performance.now();
    let raf;

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;
      const goal = LOOK[st] || LOOK.idle;
      const voiced = st === "listening" || st === "speaking";

      // voice level: raw RMS is about 0-0.2, so scale it up
      let raw = voiced ? Math.min(1, (levelRef?.current || 0) * 6) : 0;
      // the browser's fallback voice gives no level: fake a gentle talking pulse
      if (st === "speaking" && raw < 0.02) {
        const s = now / 1000;
        raw = 0.25 + 0.35 * Math.abs(Math.sin(s * 7.1) * Math.sin(s * 3.3));
      }
      level += (raw - level) * (raw > level ? 0.35 : 0.08);

      const k = 1 - Math.exp(-dt * 3);
      for (const key of Object.keys(look)) look[key] += (goal[key] - look[key]) * k;

      const calm = still ? 0.3 : 1;
      uniforms.uPhase.value += dt * (look.speed + (st === "speaking" ? level * 0.8 : 0)) * calm;
      uniforms.uAmp.value = (look.amp + (st === "speaking" ? level * 0.22 : st === "listening" ? level * 0.06 : 0)) * calm;
      uniforms.uFreq.value = look.freq + (st === "speaking" ? level * 0.6 : 0);
      ripplePhase += dt * (5 + level * 6);
      uniforms.uRipplePhase.value = ripplePhase;
      uniforms.uRipple.value = still ? 0 : look.ripple + (st === "listening" ? level * 0.035 : 0);
      hue += dt * look.hue;
      uniforms.uHue.value = hue;
      uniforms.uGlow.value = look.glow + level * 0.9;

      target.set(colorRef.current.color);
      target2.set(colorRef.current.color2);
      uniforms.uColor.value.lerp(target, k * 0.8);
      uniforms.uColor2.value.lerp(target2, k * 0.8);

      spin += dt * (st === "thinking" ? 0.5 : 0.08) * calm;
      // follow the mouse: turn to face it, drift a little toward it, and move the shine there
      const ease = 1 - Math.exp(-dt * (still ? 2 : 4));
      mx += (px - mx) * ease;
      my += (py - my) * ease;
      const reach = still ? 0.4 : 1;
      mesh.rotation.y = spin + mx * 1.1 * reach;
      mesh.rotation.x = my * 0.8 * reach;
      mesh.position.set(mx * 0.22 * reach, -my * 0.16 * reach, 0);
      uniforms.uLight.value.set(-0.25 + mx * 1.6, 0.45 - my * 1.6, 0.75).normalize();
      wrap.style.setProperty("--mx", mx.toFixed(3));
      wrap.style.setProperty("--my", my.toFixed(3));
      const scale = 1 + (st === "speaking" ? level * 0.06 : st === "listening" ? level * 0.03 : 0);
      mesh.scale.setScalar(scale);

      // for the CSS halo behind the canvas
      wrap.style.setProperty("--lvl", level.toFixed(3));
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      mesh.geometry.dispose();
      mesh.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [levelRef]);

  return (
    <div className={`globe g-${state}`} ref={wrapRef} aria-hidden="true">
      <div className="globe-halo" />
      <div className="globe-rings">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}
