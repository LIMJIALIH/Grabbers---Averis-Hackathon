"use client";

/* CRTWarp from React Bits (reactbits.dev), ported to TypeScript. One change: the phosphor colour is a
   diagonal gradient, `color` (top-left) → `color2` (bottom-right), instead of a single colour. */
import { useEffect, useRef } from "react";
import * as THREE from "three";

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const fragmentShader = `
precision highp float;

varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uBackgroundColor;
uniform float uCurvature;
uniform float uScanlineStrength;
uniform float uScanlineFrequency;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uBloom;
uniform float uBloomRadius;
uniform float uNoise;
uniform float uVignette;
uniform float uBrightness;
uniform float uPixelation;
uniform float uRgbShift;
uniform vec2 uPointer;
uniform float uMouseStrength;
uniform float uMouseReact;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec2 crtCurve(vec2 uv, float radius) {
  vec2 p = (uv - 0.5) * 2.0;
  float safeRadius = max(radius, 1.415);
  float cornerScale = safeRadius / sqrt(max(safeRadius * safeRadius - 2.0, 0.001));
  p = safeRadius * p / sqrt(max(safeRadius * safeRadius - dot(p, p), 0.001));
  p /= cornerScale;
  return p * 0.5 + 0.5;
}

float referencePlasma(vec2 uv, float t) {
  float frequencyScale = max(uWaveFrequency / 2.2, 0.001);
  uv = (uv - 0.5) * frequencyScale + 0.5;

  float scanline = 0.5 - 0.5 * cos(uv.y * 3.14159265 * uScanlineFrequency);
  scanline = mix(1.0, scanline, uScanlineStrength);

  uv *= vec2(80.0, 24.0);
  uv = ceil(uv);
  uv /= vec2(80.0, 24.0);

  float amplitude = uWaveAmplitude / 0.28;
  float field = 0.0;
  field += 0.7 * sin(0.5 * uv.x + t / 5.0);
  field += 3.0 * sin(1.6 * uv.y + t / 5.0);
  field += sin(10.0 * (uv.y * sin(t / 2.0) + uv.x * cos(t / 5.0)) + t / 2.0);

  float cx = uv.x + 0.5 * sin(t / 2.0);
  float cy = uv.y + 0.5 * cos(t / 4.0);
  field += 0.4 * sin(sqrt(100.0 * cx * cx + 100.0 * cy * cy + 1.0) + t);
  field += 0.9 * sin(sqrt(75.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field -= 1.4 * sin(sqrt(256.0 * cx * cx + 25.0 * cy * cy + 1.0) + t);
  field += 0.3 * sin(0.5 * uv.y + uv.x + sin(t));

  return scanline * floor(3.0 * (0.5 + 0.499 * sin(field * amplitude))) / 3.0;
}

void main() {
  vec2 uv = vUv;
  if (uPixelation > 1.001) {
    vec2 cells = max(uResolution / uPixelation, vec2(1.0));
    uv = (floor(uv * cells) + 0.5) / cells;
  }

  float curveRadius = 1.1 + 0.42 / max(uCurvature, 0.001);
  if (uMouseReact > 0.5) {
    curveRadius *= exp(-uPointer.y * uMouseStrength * 0.4);
  }
  vec2 curvedUv = crtCurve(uv, curveRadius);
  if (uMouseReact > 0.5) {
    curvedUv.x -= uPointer.x * uMouseStrength * 0.035;
  }

  float signal = referencePlasma(curvedUv, uTime);
  float radius = 0.01 * uBloomRadius;
  float glow = signal * 0.2;
  glow += referencePlasma(curvedUv + vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(radius, 0.0), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv - vec2(0.0, radius), uTime) * 0.12;
  glow += referencePlasma(curvedUv + vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv - vec2(radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(radius, -radius), uTime) * 0.08;
  glow += referencePlasma(curvedUv + vec2(-radius, radius), uTime) * 0.08;

  float redSignal = referencePlasma(curvedUv + vec2(uRgbShift, 0.0), uTime);
  float blueSignal = referencePlasma(curvedUv - vec2(uRgbShift, 0.0), uTime);
  vec3 channelSignal = vec3(redSignal, signal, blueSignal);
  // Diagonal gradient: uColor top-left -> uColor2 bottom-right.
  vec3 tint = mix(uColor, uColor2, smoothstep(0.0, 1.0, (vUv.x + 1.0 - vUv.y) * 0.5));
  vec3 waveColor = tint * (0.3 + signal * 0.7 + glow * uBloom * 0.65);
  waveColor += (channelSignal - signal) * 0.42;

  float edge = clamp(1.0 - dot(vUv - 0.5, vUv - 0.5) * 2.0, 0.0, 1.0);
  float edgeFade = mix(1.0, smoothstep(0.0, 1.0, edge), uVignette);
  float waveMask = clamp(signal * 0.82 + glow * 0.52, 0.0, 1.0) * edgeFade;

  float grain = hash21(gl_FragCoord.xy + vec2(fract(uTime) * 173.0));
  waveColor = max(waveColor * uBrightness, vec3(0.0));
  vec3 color = mix(uBackgroundColor, waveColor, waveMask);
  color += (grain - 0.5) * uNoise;
  gl_FragColor = vec4(max(color, vec3(0.0)), 1.0);
}
`;

type Props = {
  color?: string;
  color2?: string;
  backgroundColor?: string;
  speed?: number;
  curvature?: number;
  scanlineStrength?: number;
  scanlineFrequency?: number;
  waveAmplitude?: number;
  waveFrequency?: number;
  bloom?: number;
  bloomRadius?: number;
  noise?: number;
  vignette?: number;
  brightness?: number;
  pixelation?: number;
  rgbShift?: number;
  mouseReact?: boolean;
  mouseStrength?: number;
  dpr?: number;
  fps?: number;
  paused?: boolean;
  className?: string;
  style?: React.CSSProperties;
};

export default function CRTWarp({
  color = "#c755f7",
  color2 = color,
  backgroundColor = "#05010a",
  speed = 0.5,
  curvature = 0.25,
  scanlineStrength = 0.25,
  scanlineFrequency = 200,
  waveAmplitude = 0.3,
  waveFrequency = 2.5,
  bloom = 1.5,
  bloomRadius = 1,
  noise = 0.1,
  vignette = 0,
  brightness = 1.25,
  pixelation = 1,
  rgbShift = 0.015,
  mouseReact = true,
  mouseStrength = 0.5,
  dpr = 1,
  fps = 30,
  paused = false,
  className,
  style,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pausedRef = useRef(paused);
  const fpsRef = useRef(fps);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { fpsRef.current = Math.max(1, fps); }, [fps]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      // Seeded from the mount-time props so the first frame is already in the right colours; the effect below keeps them in sync.
      uniforms: {
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uSpeed: { value: speed },
        uColor: { value: new THREE.Color(color) },
        uColor2: { value: new THREE.Color(color2) },
        uBackgroundColor: { value: new THREE.Color(backgroundColor) },
        uCurvature: { value: curvature },
        uScanlineStrength: { value: scanlineStrength },
        uScanlineFrequency: { value: scanlineFrequency },
        uWaveAmplitude: { value: waveAmplitude },
        uWaveFrequency: { value: waveFrequency },
        uBloom: { value: bloom },
        uBloomRadius: { value: bloomRadius },
        uNoise: { value: noise },
        uVignette: { value: vignette },
        uBrightness: { value: brightness },
        uPixelation: { value: pixelation },
        uRgbShift: { value: rgbShift },
        uPointer: { value: new THREE.Vector2(0, 0) },
        uMouseStrength: { value: mouseStrength },
        uMouseReact: { value: mouseReact ? 1 : 0 },
      },
    });
    materialRef.current = material;
    scene.add(new THREE.Mesh(geometry, material));

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "low-power" });
    rendererRef.current = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
    Object.assign(renderer.domElement.style, { width: "100%", height: "100%", display: "block" });
    container.appendChild(renderer.domElement);

    const resize = () => {
      renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1), false);
      material.uniforms.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let visible = true;
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    visibilityObserver.observe(container);

    const pointerTarget = new THREE.Vector2(0, 0);
    const pointerCurrent = new THREE.Vector2(0, 0);
    let frame = 0;
    let last = 0;
    let prev = performance.now(); // frame timing without THREE.Clock (deprecated in three r18x)
    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (!visible || document.hidden) return;
      const interval = 1000 / fpsRef.current;
      if (now - last < interval) return;
      last = now - ((now - last) % interval);
      const delta = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      if (!pausedRef.current) material.uniforms.uTime.value += delta * material.uniforms.uSpeed.value;
      pointerCurrent.lerp(pointerTarget, 0.08);
      material.uniforms.uPointer.value.copy(pointerCurrent);
      renderer.render(scene, camera);
    };
    renderer.render(scene, camera); // first frame now, so the background is never blank (or a still under reduced motion)
    frame = requestAnimationFrame(render);

    const onPointerMove = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      pointerTarget.set(((e.clientX - r.left) / Math.max(r.width, 1)) * 2 - 1, -(((e.clientY - r.top) / Math.max(r.height, 1)) * 2 - 1));
    };
    const onPointerLeave = () => pointerTarget.set(0, 0);
    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerleave", onPointerLeave);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      materialRef.current = null;
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- build the scene once; prop changes go through the effect below
  }, []);

  useEffect(() => {
    const material = materialRef.current;
    const renderer = rendererRef.current;
    if (!material || !renderer) return;
    const u = material.uniforms;
    u.uColor.value.set(color);
    u.uColor2.value.set(color2);
    u.uBackgroundColor.value.set(backgroundColor);
    u.uSpeed.value = speed;
    u.uCurvature.value = curvature;
    u.uScanlineStrength.value = scanlineStrength;
    u.uScanlineFrequency.value = scanlineFrequency;
    u.uWaveAmplitude.value = waveAmplitude;
    u.uWaveFrequency.value = waveFrequency;
    u.uBloom.value = bloom;
    u.uBloomRadius.value = bloomRadius;
    u.uNoise.value = noise;
    u.uVignette.value = vignette;
    u.uBrightness.value = brightness;
    u.uPixelation.value = pixelation;
    u.uRgbShift.value = rgbShift;
    u.uMouseReact.value = mouseReact ? 1 : 0;
    u.uMouseStrength.value = mouseStrength;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpr));
    const container = containerRef.current;
    if (container) {
      renderer.setSize(Math.max(container.clientWidth, 1), Math.max(container.clientHeight, 1), false);
      u.uResolution.value.set(renderer.domElement.width, renderer.domElement.height);
    }
  }, [backgroundColor, bloom, bloomRadius, brightness, color, color2, curvature, dpr, mouseReact, mouseStrength, noise,
    pixelation, rgbShift, scanlineFrequency, scanlineStrength, speed, vignette, waveAmplitude, waveFrequency]);

  return <div ref={containerRef} className={`relative size-full overflow-hidden ${className ?? ""}`} style={style} />;
}
