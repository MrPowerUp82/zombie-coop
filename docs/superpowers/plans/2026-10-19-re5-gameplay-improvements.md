# RE5 Mercenaries Gameplay & Bugfix Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all movement, camera, reload, shop, pathfinding, and Co-op AI bugs in `index.html` while adding Resident Evil 5 Mercenaries combat mechanics (Head/Leg Stagger, Context-Sensitive Melee `[E]`, Physical Death Animations, Brute/Boss Charges, and Magnetic Enemy Loot Drops).

**Architecture:** `index.html` remains a self-contained single-file Three.js + Web Audio API application so it can be opened directly in any browser without a bundler. A zero-dependency Node test harness (`tests/gameplay.test.mjs` using `node:test` and `node:vm`) loads the inline script from `index.html` with minimal DOM/Three.js mocks to unit-test gameplay state transitions and physics logic directly.

**Tech Stack:** HTML5, Tailwind CSS (CDN), Three.js r128 (CDN), Web Audio API, Node.js built-in test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-19-re5-gameplay-improvements-design.md`

## Global Constraints

- Single-file browser runtime: all production HTML, CSS, and JS stay in `index.html` with no build step required.
- Invulnerability frames: Dash (`[Q]`) grants `0.35s` (`state.invulnTimer = 0.35`); Melee Finisher (`[E]`) grants `0.6s` (`state.invulnTimer = 0.6`).
- Stagger duration: `2.8s` (`zombie.staggerTimer = 2.8`), during which the zombie cannot move or attack.
- Melee Finisher (`[E]` within `3.8m` of a staggered zombie): `180` primary damage, `95` AoE damage within `3.8m`, `2.6m` radial knockback, `+75` bonus score on kill.
- Defensive Shove (`[E]` with no staggered target, cooldown `1.8s`, range `2.6m`): `35` damage and `1.6m` knockback.
- Max Combo multiplier: `10x` (raised from `8x`).

## Review Focus

- Holding both `A` and `D` simultaneously must result in `moveRight === 0` (no horizontal drift).
- Switching weapons while `state.isReloading === true` must cancel the pending reload timer so the previous weapon's timer does not complete later.
- Shooting above a zombie's head at its floating health bar (`hpBg`/`hpFill`) or stagger ring must not register a hit on the zombie.
- When both the player (`state.isDowned`) and the Co-op AI partner (`net.ally.isDowned`) are downed simultaneously, `triggerGameOver()` must fire immediately instead of softlocking.
- When `state.invulnTimer > 0` (during Dash or Melee Finisher), `takePlayerDamage()` must deal `0` damage.

---

### Task 1: Controls, Movement, Directional Dash, Safe Reload & Shop Pause

**Files:**
- Create: `tests/gameplay.test.mjs`
- Modify: `index.html:697-730`, `index.html:1439-1452`, `index.html:1646-1661`, `index.html:1838-1856`, `index.html:1889-1998`, `index.html:2346-2355`, `index.html:2458-2528`, `index.html:2624-2645`

**Interfaces:**
- Produces:
  - `state.invulnTimer: number` (initialized to `0`, decremented by `dt` in `updatePlayer(dt)`)
  - `state.reloadTimerId: number | null` (initialized to `null`, cleared on weapon switch / game start / game over)
  - `computeMoveInput() -> { moveForward: number, moveRight: number }` or corrected symmetrical movement in `updatePlayer(dt)`
  - `performTacticalDash()` using active movement direction + setting `state.invulnTimer = 0.35`

- [ ] **Step 1: Create `tests/gameplay.test.mjs` with failing tests for Task 1 bugs**

Create `tests/gameplay.test.mjs` that extracts the `<script>` tag from `index.html`, runs it in a `node:vm` context with stubbed `THREE`, `document`, `window`, and `performance`, and tests:
1. `strafe_symmetry`: pressing `keys.a = true` moves left at the exact same magnitude as `keys.d = true` moves right, and `keys.a = true, keys.d = true` produces zero X displacement.
2. `directional_dash_and_iframes`: `performTacticalDash()` while `keys.a = true` dashes left (along `-rightVec`), sets `state.invulnTimer = 0.35`, and `takePlayerDamage(25)` while `state.invulnTimer > 0` leaves `state.health` unchanged.
3. `reload_cancel_on_switch`: calling `reloadWeapon()` then `switchWeapon(2)` clears `state.reloadTimerId` and prevents the old weapon's mag from being refilled when the timer would have elapsed.
4. `shop_pauses_zombies_in_solo`: in Solo/Bot mode (`state.status === 'SHOP'`), zombies do not advance or deal damage during the frame loop, and lethal damage while in `SHOP` (P2P mode) hides `dom.shopModal`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gameplay.test.mjs`
Expected: FAIL (`strafe_symmetry` fails because `keys.a` doubles movement; `directional_dash_and_iframes` fails because `invulnTimer` is undefined and dash only goes forward; `reload_cancel_on_switch` fails).

- [ ] **Step 3: Implement control, movement, dash, reload, and shop fixes in `index.html`**

Modify `index.html`:
- Add `invulnTimer: 0`, `reloadTimerId: null`, `meleeCooldown: 0` to `state` (lines 697-729).
- In `takePlayerDamage(amount)` (line 1889): return early if `state.isDowned || state.invulnTimer > 0`. In `triggerGameOver()` (line 2423): also add `dom.shopModal.classList.add('hidden')`.
- In `updatePlayer(dt)` (lines 1906-1998):
  - Remove `if (keys.a) moveRight -= 1;` (line 1909).
  - Decrement `if (state.invulnTimer > 0) state.invulnTimer = Math.max(0, state.invulnTimer - dt);`.
- In `performTacticalDash()` (lines 1646-1661):
  - Compute `moveForward = (keys.w ? 1 : 0) - (keys.s ? 1 : 0)` and `moveRight = (keys.d ? 1 : 0) - (keys.a ? 1 : 0)` (or `mobileInput` when active).
  - Build `dashDir` from `forwardVec * moveForward + rightVec * moveRight`; if `dashDir.lengthSq() < 0.01`, fallback to `forwardVec`. Normalize `dashDir`, step 8 times by `0.68`, and set `state.invulnTimer = 0.35`.
- In `reloadWeapon()` (lines 1838-1856) and `switchWeapon(index)` (lines 1439-1451):
  - Store `state.reloadTimerId = setTimeout(...)` in `reloadWeapon()`.
  - Create helper `cancelReload()` that clears `state.reloadTimerId`, sets `state.reloadTimerId = null`, and sets `state.isReloading = false`. Call `cancelReload()` inside `switchWeapon()`, `startGame()`, and `triggerGameOver()`.
- In `setupEventListeners()` (lines 2458-2528 & 2627):
  - Remove `if (state.status === 'PLAYING' && !document.pointerLockElement) fireWeapon();` from `Space` keydown (line 2468).
  - In `mousemove` (lines 2506-2520): only rotate when `document.pointerLockElement === renderer.domElement` or `mouse.isDown` is true.
  - In `btnWeapon` touchstart (line 2627): use `(state.currentWeaponIdx + 1) % WEAPONS.length`.
- In `animate()` (lines 2639-2645): only run `updateZombies(dt, elapsedTime)` when `state.status === 'PLAYING' || (state.status === 'SHOP' && net.connected && !net.botActive)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gameplay.test.mjs`
Expected: PASS (all 4 tests in Task 1 pass).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/gameplay.test.mjs
git commit -m "fix(gameplay): fix strafe bug, directional dash i-frames, reload cancel, and shop pause"
```

---

### Task 2: Segmented Hitboxes, Safe Spawning, Obstacle Steering, Brute/Boss Charge & Sheva AI Fixes

**Files:**
- Modify: `index.html:1470-1557`, `index.html:1726-1767`, `index.html:1889-2149`
- Test: `tests/gameplay.test.mjs`

**Interfaces:**
- Consumes: `checkObstacleCollision(x, z, radius)`
- Produces:
  - Anatomical mesh `userData` on zombie parts: `{ isZombiePart: true, hitZone: 'HEAD' | 'BODY' | 'LEG', isHead: boolean, isLeg: boolean, zombieRef: zombieObj }` (excluding `hpBg`, `hpFill`, and `staggerRing`)
  - `steerZombieMove(x, z, dirX, dirZ, speed, dt, radius) -> { x: number, z: number }`
  - Brute/Boss charge state on `zombieObj`: `{ chargeCooldown: number, chargeState: 'IDLE' | 'WINDUP' | 'CHARGING', chargeTimer: number, chargeDirX: number, chargeDirZ: number }`

- [ ] **Step 1: Write failing tests in `tests/gameplay.test.mjs` for Task 2**

Add tests to `tests/gameplay.test.mjs`:
1. `segmented_hitboxes_exclude_ui`: `spawnZombie()` assigns `zombieRef` and `hitZone` (`'HEAD'`, `'BODY'`, `'LEG'`) to body meshes, and `hpBg.userData.zombieRef` / `hpFill.userData.zombieRef` remain `undefined`.
2. `safe_spawn_avoids_obstacles`: spawning 50 zombies never places a zombie inside any obstacle bounding box (`checkObstacleCollision(z.mesh.position.x, z.mesh.position.z, 0.45 * z.scale) === false`).
3. `zombie_obstacle_steering`: a zombie placed directly behind an obstacle with the player on the other side changes its lateral coordinate (`x` or `z`) to steer around the obstacle instead of remaining at the exact same position.
4. `sheva_ai_facing_revive_and_mutual_downed`:
   - When a zombie is at `(net.ally.x, net.ally.z + 10)`, `updateCoopBotAI(0.1)` sets `net.ally.yaw` to `Math.atan2(0, -10)` (`-Math.PI` / `Math.PI`, facing `+Z` with `-Z` forward mesh), not `0`.
   - When the player revives a downed ally (`net.ally.isDowned = true, net.ally.hp = 0`), `updatePlayer(0.016)` restores `net.ally.hp` to `Math.round(net.ally.maxHp * 0.65)`.
   - When both `state.isDowned` and `net.ally.isDowned` become `true`, `state.status` transitions to `'GAMEOVER'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gameplay.test.mjs`
Expected: FAIL on the 4 new Task 2 tests.

- [ ] **Step 3: Implement hitboxes, safe spawn, obstacle steering, Brute/Boss charge, and Sheva AI fixes in `index.html`**

Modify `index.html`:
- In `createZombieMesh(typeConfig, isAcid)` (lines 1470-1510):
  - Tag `leftLeg` and `rightLeg` with `userData = { isZombiePart: true, hitZone: 'LEG', isHead: false, isLeg: true }`.
  - Tag `torso`, `leftArm`, `rightArm` with `userData = { isZombiePart: true, hitZone: 'BODY', isHead: false, isLeg: false }`.
  - Tag `head` with `userData = { isZombiePart: true, hitZone: 'HEAD', isHead: true, isLeg: false }`.
  - Tag `hpBg` and `hpFill` with `userData = { isUI: true }`.
  - In `spawnZombie()` (line 1551): only assign `child.userData.zombieRef = zombieObj` when `child.userData && child.userData.isZombiePart`.
- In `spawnZombie(forcedData)` (lines 1527-1538):
  - Loop up to 12 tries to sample `(spawnX, spawnZ)` where `!checkObstacleCollision(spawnX, spawnZ, 0.65 * baseType.scale)`.
  - Initialize `chargeCooldown: 4.5 + Math.random() * 2.5, chargeState: 'IDLE', chargeTimer: 0, chargeDirX: 0, chargeDirZ: 0` on `zombieObj`.
- Add `steerEntityMove(x, z, dirX, dirZ, stepDist, radius)`:
  - Try direct step `(x + dirX * stepDist, z + dirZ * stepDist)`. If blocked, try axis-aligned slides, then test rotated angles `[Math.PI/4, -Math.PI/4, Math.PI/2, -Math.PI/2]` around `(dirX, dirZ)` and apply the first collision-free step.
- In `updateZombies(dt, elapsedTime)` (lines 2098-2149):
  - Use `const attackRange = 1.1 + 0.45 * z.scale;`.
  - For `BRUTE` and `BOSS`, when `z.chargeState === 'IDLE'`, `dist > 6 && dist < 22`, and `z.chargeCooldown <= 0`: enter `'WINDUP'` for `0.55s` (`z.chargeDirX = dirX; z.chargeDirZ = dirZ;`), then `'CHARGING'` for `0.9s` at `2.3x` speed.
  - Use `steerEntityMove` for zombie movement.
  - Check vertical proximity `Math.abs(camera.position.y - (state.isDowned ? 0.65 : CONFIG.playerHeight)) < 1.3` before dealing melee damage to local player.
- In `updateCoopBotAI(dt)` (lines 2000-2055) and `updatePlayer(dt)` (lines 1991-1998):
  - If `state.isDowned && (!net.connected || !net.ally.active || net.ally.isDowned)`, call `triggerGameOver()` and return.
  - When player revives ally (line 1994): set `net.ally.hp = Math.round((net.ally.maxHp || 120) * 0.65)`.
  - When Sheva moves to revive player (line 2007): use `steerEntityMove(net.ally.x, net.ally.z, dx / dist, dz / dist, 7.5 * dt, 0.6)`.
  - When Sheva aims at `nearestZ` (line 2033): set `net.ally.yaw = Math.atan2(-zdx, -zdz)`.
  - When a zombie damages Sheva and `net.ally.hp <= 0` while `state.isDowned` is already `true`, call `triggerGameOver()`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gameplay.test.mjs`
Expected: PASS (all 8 tests pass).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/gameplay.test.mjs
git commit -m "fix(ai): add segmented hitboxes, obstacle steering, boss charge, and Sheva AI fixes"
```

---

### Task 3: RE5 Mercenaries Combat — Stagger, Context Melee (`[E]`), Death Physics & Magnetic Loot Drops

**Files:**
- Modify: `index.html:227-232`, `index.html:315-357`, `index.html:489-497`, `index.html:609-675`, `index.html:940-975`, `index.html:1470-1557`, `index.html:1750-1836`, `index.html:2098-2258`, `index.html:2470-2486`, `index.html:2580-2633`
- Test: `tests/gameplay.test.mjs`

**Interfaces:**
- Consumes: `zombieObj` with `hitZone` (`'HEAD' | 'BODY' | 'LEG'`), `state.invulnTimer`
- Produces:
  - `zombieObj.staggerTimer: number`, `zombieObj.staggerType: 'HEAD' | 'KNEE' | null`
  - `damageZombie(zombie, amount, hitPoint, isHeadshot, fromNetwork = false, hitZone = 'BODY')`
  - `performMeleeAttack() -> boolean`
  - `dyingZombies: Array<{ mesh, vel, rotVelX, rotVelZ, life }>`
  - `lootDrops: Array<{ mesh, type: 'GOLD' | 'AMMO' | 'HERB' | 'COMBO', value: number, velY: number, life: number, phase: number }>`
  - `spawnLootDrop(pos, guaranteed = false, isBoss = false)`

- [ ] **Step 1: Write failing tests in `tests/gameplay.test.mjs` for Task 3**

Add tests to `tests/gameplay.test.mjs`:
1. `head_and_leg_stagger`: calling `damageZombie(z, 20, pos, true, false, 'HEAD')` (with deterministic `Math.random = () => 0.1`) sets `z.staggerTimer === 2.8` and `z.staggerType === 'HEAD'`; calling with `hitZone = 'LEG'` sets `z.staggerType === 'KNEE'` and reduces leg damage by `0.85x`; staggered zombies do not move or attack in `updateZombies()`.
2. `melee_finisher_and_shove`:
   - With a staggered zombie within `3.8m`, `performMeleeAttack()` deals `180` damage to the primary target, `95` AoE damage + knockback to nearby zombies within `3.8m`, sets `state.invulnTimer = 0.6`, and awards `+75` bonus score on kill.
   - With no staggered zombie and an unstaggered zombie at `2.0m`, `performMeleeAttack()` performs a defensive shove (`35` damage, knockback, `state.meleeCooldown = 1.8`).
3. `dying_zombies_and_magnetic_loot_drops`:
   - `killZombie(z, true)` removes `z` from `zombies`, adds an entry to `dyingZombies` with `life > 0` (and hides `z.parts.head` on headshot), and spawns a loot drop in `lootDrops`.
   - In `updateEffectsAndCrates(dt, elapsedTime)`, a loot drop within `3.6m` moves closer to `camera.position` and is collected within `1.3m` (increasing score/ammo/health/combo up to `10x`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/gameplay.test.mjs`
Expected: FAIL on the 3 new Task 3 tests.

- [ ] **Step 3: Implement Stagger, Melee Finisher/Shove (`[E]`), Dying Zombie Physics, and Magnetic Loot Drops in `index.html`**

Modify `index.html`:
- **Audio (`SoundSystem`):** Add `playMelee()` synthesizing a low-end punch + crunch oscillator/noise burst.
- **UI & Controls:**
  - Add `#melee-prompt` banner above `#center-alert` (`🥊 [E] GOLPE FÍSICO B.S.A.A.!`), update bottom HUD and start modal controls legend to mention `[E] Golpe Físico`, and add `#mobile-melee-btn` (`GOLPE`) in `#mobile-controls`.
  - Bind `KeyE` in `keydown` and `#mobile-melee-btn` touchstart to `performMeleeAttack()`.
- **Stagger Visuals & Logic (`createZombieMesh`, `spawnZombie`, `damageZombie`, `updateZombies`):**
  - Add a golden torus/ring `staggerRing` at `y = 2.45 * s` (`visible = false`, `userData = { isUI: true }`) inside `createZombieMesh`.
  - Initialize `staggerTimer: 0, staggerType: null` on `zombieObj`.
  - In `fireWeapon()`: pass `hit.object.userData.hitZone || (isHead ? 'HEAD' : 'BODY')` into `damageZombie()`, scaling base damage by `0.85` when `hitZone === 'LEG'`.
  - In `damageZombie(zombie, amount, hitPoint, isHeadshot, fromNetwork = false, hitZone = null)`: if `zombie.hp > 0 && zombie.staggerTimer <= 0`, roll stagger chance (`HEAD`: `0.65` standard, `0.35` BRUTE, `0.20` BOSS; `LEG`: `0.75` standard, `0.40` BRUTE). When triggered, set `zombie.staggerTimer = 2.8`, `zombie.staggerType = resolvedZone === 'LEG' ? 'KNEE' : 'HEAD'`, and show `staggerRing`.
  - In `updateZombies(dt, elapsedTime)`: if `z.staggerTimer > 0`, decrement `z.staggerTimer`, animate stagger pose (`'HEAD'` tilts torso `-0.35`, `'KNEE'` drops `z.mesh.position.y = -0.32 * z.scale`), rotate `staggerRing`, and skip movement/attacks; reset pose when `z.staggerTimer <= 0`. Show `#melee-prompt` when any staggered zombie is within `3.8m` of the player.
- **Melee Execution (`performMeleeAttack`):**
  - Find closest staggered zombie within `3.8m`.
  - If found (**Finisher**): step player `0.8m` toward target (if collision-free), set `state.invulnTimer = 0.6`, `state.meleeCooldown = 0.9`, `state.screenShake = 0.22`, play `sound.playMelee()`, spawn shockwave ring (`3.8m`), deal `180` damage to primary target (marking `killedByMelee = true`), and deal `95` damage + `2.6m` radial knockback to all other zombies within `3.8m`.
  - Else if `state.meleeCooldown <= 0` (**Defensive Shove**): set `state.meleeCooldown = 1.8`, play `sound.playMelee()`, and for all zombies within `2.6m` in front of player (`dot > 0.1`), deal `35` damage, push back `1.6m`, and set `z.attackCooldown = 1.1`.
- **Death Tumble & Loot Drops (`killZombie`, `spawnLootDrop`, `updateEffectsAndCrates`):**
  - In `killZombie(zombie, isHeadshot, isMelee = false)`:
    - Raise max combo cap from `8` to `10`. If `isMelee`, add `+75` bonus score, `+1` extra combo, and `state.comboTimer = 5.5`.
    - If `isHeadshot || isMelee`, set `zombie.parts.head.visible = false` and spawn `14` extra head-burst particles.
    - Hide `hpBg`, `hpFill`, and `staggerRing`. Push `{ mesh: zombie.mesh, vel: knockbackVel, rotVelX, rotVelZ, life: 1.1 }` to `dyingZombies` instead of calling `scene.remove(zombie.mesh)` immediately.
    - Call `spawnLootDrop(zombie.mesh.position, isMelee || zombie.type === 'BRUTE' || zombie.type === 'BOSS', zombie.type === 'BOSS')`.
  - In `updateEffectsAndCrates(dt, elapsedTime)`:
    - Update `dyingZombies` (gravity, ground clamp at `y = 0`, tilt rotation, remove from `scene` when `life <= 0`).
    - Update `lootDrops` (bobbing/spinning, magnetic pull toward `camera.position` when `dist < 3.6`, pickup at `dist < 1.3` applying `GOLD`, `AMMO`, `HERB`, or `COMBO` reward).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/gameplay.test.mjs`
Expected: PASS (all 11 tests pass).

- [ ] **Step 5: Commit**

```bash
git add index.html tests/gameplay.test.mjs
git commit -m "feat(combat): add RE5 stagger, melee finisher, death physics, and magnetic loot drops"
```
