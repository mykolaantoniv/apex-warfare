---
name: game-feel-engineer
description: Encodes "juice" and realism for Apex Warfare — camera shake, hitstop, knockback, recoil, particle/smoke bursts, damage numbers, tracers, audio layering, input responsiveness, easing curves. Read this for any FX, audio, screenshake, or combat-feel work.
---

# Game Feel Engineer

The bar: **feel better than Massive Warfare, and look super realistic.** Every hit must
have weight, every shot must have punch, every explosion must have smoke, light, and force.

## 0. The feel loop (every impactful event fires ALL of these)
A hit/kill is not one effect — it's a **stack** triggered together:
1. **Hitstop** (freeze) — sell the impact.
2. **Screenshake** (trauma) — kinetic energy.
3. **Knockback/recoil** — physical force.
4. **Particles** — spark/debris/smoke.
5. **Flash** — muzzle/impact/explosion light + bloom.
6. **Audio** — layered transient.
7. **Damage number** — readable feedback.
Centralize in a `FeelDirector` that exposes `impact(power, position, kind)` so callers
fire one call and get the whole stack, tier-scaled.

## 1. Hitstop (frame freeze)
- On meaningful hit, scale gameplay `deltaTime *= 0` (or 0.05) for **40–90ms**, scaled by
  damage. Render keeps running. Restore after.
- Use sparingly: only player-relevant hits + kills, never every pellet, or it feels laggy.
- Kill-cam: on final enemy of a mission, do a 250–400ms slow-mo (timeScale 0.25) + zoom.

## 2. Screenshake (trauma model)
- Keep a `trauma` float [0,1]; events `addTrauma(amount)`. Each frame:
  `shake = trauma^2` (quadratic so small hits barely shake), offset camera by
  `shake * maxOffset * perlin(t)` (rotation + position), then `trauma -= decay*dt`.
- Quadratic + decay prevents nausea. Cap `maxOffset`. Mobile: reduce by ~40%.
- Different events add different trauma: small hit .15, rocket .35, explosion .6, death .8.

## 3. Knockback & recoil (physical, via Havok)
- **Target knockback:** `body.applyImpulse(dir * power, hitPoint)` — off-center hits
  impart spin (realistic).
- **Shooter recoil:** small impulse opposite to fire dir + a visual kick (lerp weapon/
  camera back then return). Big guns (mortar) = bigger recoil + more shake.
- Explosions = radial impulse to all bodies in radius, falloff by distance.

## 4. Particles & SMOKE (realism focus — user priority)
Use **GPU particle systems** (`GPUParticleSystem`), pooled, tier-capped.
- **Muzzle flash:** 1–2 frame bright additive sprite + point light flash + tiny smoke puff.
- **Tracers:** stretched billboard or thin cylinder along projectile path; fade fast.
- **Impact:** spark burst (additive) + debris (lit) + small smoke + decal on surface.
- **Explosion:** core flash → fireball (animated sprite sheet) → **expanding smoke plume**
  (dark, soft, billowing) → embers → lingering smoke that drifts up and dissipates.
- **Realistic smoke recipe:** soft round texture, low emit rate but long lifetime (1.5–4s),
  size grows over life, alpha fades in then out, slight upward + outward velocity, gentle
  turbulence/noise, color albedo dark grey→light grey, **lit** (use `ParticleSystem` with
  ramp gradients; on high tier add a subtle light). Add **engine exhaust smoke** trailing
  damaged vehicles (more smoke as HP drops — great readability + realism).
- **Damage smoke states:** >66% HP none; 33–66% light trail; <33% heavy black smoke + sparks.
- Cap counts per tier (Low halves emit rates, disables lingering smoke lights).

## 5. Lighting flashes
- Pool a few `PointLight`s for muzzle/impact/explosion; enable for 2–4 frames, animate
  intensity down, then return to pool. Tie intensity to bloom for the "pop."

## 6. Damage numbers
- DOM/GUI billboard text at hit point: spawn → pop scale (overshoot ease) → rise + drift →
  fade over ~0.6s. Crits: larger, warm color, slight shake. Pool the elements.

## 7. Audio layering (Web Audio / Babylon Sound)
- **Buses:** engine loop (pitch & volume by throttle/speed), weapons, impacts, explosions,
  ambient room tone, UI, music. Master + ducking compressor.
- **Variation:** 3–4 samples per impact/fire, random pitch ±10%, to avoid machine-gun sameness.
- **Spatial:** position sounds in 3D (panner) relative to camera; distance attenuation.
- **Ducking:** explosions briefly duck music/engine so they punch.
- **Unlock** audio context on first user gesture (Play button).
- Realistic: doppler-ish pitch on fast passes (jet), low-pass when behind walls (optional high tier).

## 8. Input responsiveness (twin-stick, nipplejs)
- Poll sticks **every frame**; no input smoothing that adds latency. Map raw vector →
  desired velocity/aim immediately.
- **Deadzone** ~0.12, with radial (not square) clamping. Optional small response curve
  (input^1.3) for fine aim near center, full throw at edge.
- **Aim:** right stick sets aim direction instantly; firing auto-starts when stick is
  engaged past deadzone (configurable: hold-to-fire vs auto).
- Realistic weight comes from **physics inertia**, NOT from laggy input. Keep the control
  signal instant; let mass/damping create the weighty motion.

## 9. Easing & curves
- Keep a tiny `ease` lib: `easeOutQuad`, `easeOutBack` (overshoot for pops),
  `easeInOutCubic`, `smoothDamp` (critically damped). Use `smoothDamp` for camera + UI.
- Animate UI in/out (mission start banner, results) with easeOutBack for snappiness.

## 10. Combo / readability extras
- Hit markers (small X) on the reticle when you damage an enemy; bigger on kill.
- Kill feed / multi-kill callouts ("DOUBLE KILL") for score-attack juice.
- Low-health vignette pulse (red) + heartbeat audio when player HP < 25%.
- Speed lines / FOV widen at high speed (jet).

## Checklist (definition of done for feel tasks)
- [ ] `FeelDirector.impact()` fires the full stack, tier-scaled
- [ ] Hitstop 40–90ms on relevant hits; slow-mo on mission-final kill
- [ ] Trauma screenshake (quadratic, decaying, capped, mobile-reduced)
- [ ] Knockback + recoil via Havok impulses; radial explosion impulse
- [ ] Realistic layered smoke incl. damage-state engine smoke; pooled GPU particles
- [ ] Muzzle/impact/explosion flashes via pooled lights tied to bloom
- [ ] Damage numbers pooled with pop/rise/fade
- [ ] Layered, varied, spatial, ducked audio; unlocked on gesture
- [ ] Instant input, weight from physics not input lag
