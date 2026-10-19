# Design Spec: RE5 Mercenaries Gameplay & Bugfix Overhaul

**Date:** 2026-10-19
**Target File:** `index.html`
**Topic:** Core Gameplay Bug Fixes & Resident Evil 5 Mercenaries Combat Mechanics

---

## 1. Context & Goals

`index.html` is a single-file 3D survival/co-op shooter built with Three.js and Web Audio API inspired by *Resident Evil 5* (Kijuju zone).

The goal of this design is twofold:
1. **Fix critical gameplay bugs** affecting player movement, camera aiming, reload state, shop safety, zombie spawning/navigation, hitboxes, and AI partner (Sheva) behavior.
2. **Increase combat fun and tactile feedback** by introducing signature *Resident Evil 5: Mercenaries* mechanics: limb/head stagger states, context-sensitive melee finishers (`[E]`), physical death animations, boss/brute charge attacks, and magnetic enemy loot drops.

---

## 2. Core Bug Fixes & Control Improvements

### 2.1 Movement & Directional Tactical Dash (`[Q]`)
- **Fix Strafe Left Bug (`updatePlayer`):** Remove the duplicate `if (keys.a) moveRight -= 1;` statement so left and right strafing have symmetrical speed (`1.0`) and holding `A + D` cancels out to `0`.
- **Directional Dash (`performTacticalDash`):**
  - Compute dash direction from active `WASD` / mobile joystick input relative to `state.yaw`. If no directional input is active, dash forward along the camera's horizontal facing vector.
  - Grant `state.invulnTimer = 0.35` seconds of invulnerability frames (i-frames) during a dash.

### 2.2 Camera, Aiming, Reloading & Mobile Weapon Switch
- **Camera Rotation Guard:** Only rotate `state.yaw` and `state.pitch` via `mousemove` when `document.pointerLockElement === renderer.domElement` or when `mouse.isDown` is true, preventing erratic camera jumps when closing modals or moving the cursor outside pointer lock. Reset `mouse.prevX` and `mouse.prevY` on pointer lock change and `mousedown`.
- **Remove Accidental `Space` Firing:** Remove `fireWeapon()` from the `Space` keydown handler so `Space` exclusively jumps.
- **Safe Reload Timer (`reloadWeapon`):** Store the active timeout ID in `state.reloadTimerId`. Cancel `clearTimeout(state.reloadTimerId)` inside `switchWeapon()`, `startGame()`, and `triggerGameOver()` so switching weapons mid-reload never reloads the wrong weapon or corrupts `state.isReloading`.
- **Mobile Weapon Cycle:** Change `(state.currentWeaponIdx + 1) % 3` to `(state.currentWeaponIdx + 1) % WEAPONS.length` so mobile players can equip all 4 weapons (including the PSG-1 Sniper).

### 2.3 Tactical Shop Pause (`[B]`)
- When `state.status === 'SHOP'`:
  - In **Solo** or **Bot Co-op** (`!net.connected || net.botActive`), pause `updateZombies(dt, elapsedTime)` so zombies do not move or damage the player while shopping.
  - In **Human P2P Co-op** (`net.connected && !net.botActive`), keep the world running so the partner is not frozen, and automatically close `shopModal` if the player takes lethal damage or is downed.

---

## 3. Zombie Hitboxes, Navigation, Boss Attacks & Co-op AI

### 3.1 Segmented Hitboxes (`createZombieMesh` & `spawnZombie`)
- Exclude floating UI meshes (`hpBg`, `hpFill`, and stagger indicator meshes) from receiving `userData.zombieRef` so shots above the zombie's head do not register as hits.
- Tag anatomical parts explicitly:
  - `head`: `userData = { isZombiePart: true, hitZone: 'HEAD', isHead: true }`
  - `torso`, `leftArm`, `rightArm`: `userData = { isZombiePart: true, hitZone: 'BODY', isHead: false }`
  - `leftLeg`, `rightLeg`: `userData = { isZombiePart: true, hitZone: 'LEG', isHead: false }`

### 3.2 Safe Spawning & Obstacle Avoidance Steering
- **Safe Spawn (`spawnZombie`):** When spawning without forced network coordinates, sample up to 12 candidate positions around the arena perimeter/player radius and verify `!checkObstacleCollision(spawnX, spawnZ, 0.65 * baseType.scale)` before placing the zombie.
- **Obstacle Steering (`updateZombies`):** When direct movement `(moveX, moveZ)` toward the target is blocked on either axis by `checkObstacleCollision`, evaluate steering angles ($\pm 45^\circ$, $\pm 90^\circ$) around the target vector and apply the first collision-free tangential step so zombies smoothly walk around containers and crates.

### 3.3 Scaled Attack Reach & Brute/Boss Charge Attack
- **Attack Reach:** Replace hardcoded `dist > 1.35` with `const attackRange = 1.1 + 0.45 * z.scale;` so large enemies (`BRUTE` scale `1.45`, `BOSS` scale `2.3`) hit consistently at their physical boundary. Also require vertical proximity (`Math.abs(camera.position.y - CONFIG.playerHeight) < 1.3`) for ground attacks.
- **Brute & Boss Charge (`chargeTimer`, `chargeState`):**
  - `BRUTE` and `BOSS` enemies periodically initiate a **Tactical Charge** when within `6m–22m` of their target (cooldown `6.5s`).
  - Telegraph for `0.55s` (emissive flash + warning ring), then surge forward at `2.3x` base speed for `0.9s`, dealing knockback and heavy damage on contact.

### 3.4 Sheva AI Partner & Downed State Fixes
- **Facing Direction Fix (`updateCoopBotAI`):** Change `net.ally.yaw = Math.atan2(zdx, zdz)` to `net.ally.yaw = Math.atan2(-zdx, -zdz)` when aiming at a zombie so the avatar faces `-Z` (toward the target) matching her weapon and muzzle flash orientation.
- **Revive HP Restoration (`updatePlayer` & `updateCoopBotAI`):**
  - When the player revives the ally (`distAlly < 2.8`), set `net.ally.isDowned = false` and restore `net.ally.hp = Math.round(net.ally.maxHp * 0.65)`.
  - Apply obstacle steering to Sheva when moving to revive a downed player.
- **Mutual Downed Game Over Check:** If `state.isDowned && (!net.connected || !net.ally.active || net.ally.isDowned)`, immediately call `triggerGameOver()` to prevent a permanent softlock.

---

## 4. RE5 Mercenaries Combat Mechanics

### 4.1 Stagger System (Head & Knee Stagger)
- **State Properties on Zombie:** `staggerTimer: 0`, `staggerType: null` (`'HEAD'` | `'KNEE'`), `staggerRingMesh`.
- **Trigger Conditions in `damageZombie(zombie, amount, hitPoint, hitZone, fromNetwork)`:**
  - **Head Hit (`hitZone === 'HEAD'`):** Applies weapon `headshotMult`. If the zombie survives and `staggerTimer <= 0`, triggers `'HEAD'` stagger with probability `65%` for standard zombies (`WALKER`, `RUNNER`, `ACID`), `35%` for `BRUTE`, and `20%` for `BOSS`.
  - **Leg Hit (`hitZone === 'LEG'`):** Applies `0.85x` base damage. If the zombie survives and `staggerTimer <= 0`, triggers `'KNEE'` stagger with probability `75%` for standard zombies and `40%` for `BRUTE`.
- **Visual & Behavioral Effect:**
  - Stagger lasts `2.8s`. While `staggerTimer > 0`, the zombie cannot move or attack.
  - `'HEAD'` stagger tilts the torso/head backward (`torso.rotation.x = -0.35`) and raises arms.
  - `'KNEE'` stagger drops the zombie's vertical offset (`mesh.position.y = -0.32 * z.scale`) and bends legs.
  - A pulsing amber ring/marker above the zombie indicates it is vulnerable to a melee finisher.

### 4.2 Context-Sensitive Melee Action (`[E]` & Mobile Button)
- **Controls:** Key `KeyE` on desktop, plus a dedicated `🥊 GOLPE` button on mobile touch controls and HUD prompt.
- **Mode A — RE5 Finisher (`performMeleeAttack` with staggered target within `3.8m`):**
  - HUD displays a prominent prompt (`🥊 [E] FINALIZAÇÃO B.S.A.A.!`) whenever a staggered zombie is within `3.8m`.
  - Pressing `E` dashes the player slightly toward the target, grants `0.6s` of invulnerability (`state.invulnTimer = 0.6`), triggers camera punch + heavy impact sound (`sound.playMelee()`), and spawns a golden-orange shockwave ring.
  - Deals **180 damage** to the primary staggered target and **95 AoE damage** + strong radial knockback (`2.6m`) to all other zombies within `3.8m`.
  - Kills via melee grant **+75 bonus points**, +1 extra combo stack, refresh `state.comboTimer = 5.5`, and guarantee a loot drop.
- **Mode B — Defensive Shove (no staggered target, cooldown `1.8s`):**
  - Pressing `E` performs a quick rifle butt / kick in front of the player (`2.6m` range), dealing **35 damage**, pushing nearby zombies back (`1.6m`), and briefly interrupting their attack cooldown.

### 4.3 Physical Death Animations (`dyingZombies`)
- Instead of removing `zombie.mesh` immediately in `killZombie()`:
  - Remove the zombie from the active `zombies` array so it no longer blocks shots or attacks.
  - If killed by a **Headshot** or **Melee Finisher**, hide `zombie.parts.head` and spawn an extra burst of crimson/amber particles at head height.
  - Push the zombie into `dyingZombies` with backward/upward velocity (`vel`), angular velocity (`rotVelX`, `rotVelZ`), and `life: 1.1` seconds.
  - Update `dyingZombies` each frame in `updateEffectsAndCrates(dt)`: apply gravity, ground bounce at `y = 0`, tilt rotation up to $90^\circ$ (falling flat), and dispose/remove from scene when `life <= 0`.

### 4.4 Dynamic Enemy Loot Drops (`lootDrops`)
- **Spawn Logic (`spawnLootDrop(pos, guaranteed)`):**
  - Triggered in `killZombie()`. Drop chance is `55%` on normal kills and `100%` on `BRUTE`, `BOSS`, or **Melee Finisher** kills (capped at 12 active drops on the ground).
  - Weighted drop table:
    - `GOLD` (35%): Amber diamond mesh — grants `+150` to `+350` B.S.A.A. Credits/Pts (`BOSS` drops `+600` Pts).
    - `AMMO` (30%): Orange ammo pack — restores `+30` Rifle, `+8` Shotgun, and `+4` Sniper reserve ammo.
    - `HERB` (20%): Emerald green herb mesh — restores `+25 HP` immediately.
    - `COMBO` (15%): Cyan/Red Mercenaries crystal — adds `+2` to `state.combo` (max combo raised from `8x` to `10x`) and sets `state.comboTimer = 6.5`.
- **Magnetic Pickup (`updateEffectsAndCrates`):**
  - Drops pop upward on spawn, bob/spin on the ground, and last `18s`.
  - When the player is within `3.6m`, the drop accelerates magnetically toward the player's position and triggers pickup at `1.3m` with sound and floating HUD notification.

---

## 5. Verification & Testing Criteria

1. **Movement & Controls:** Pressing `A` and `D` moves at identical speeds; holding `A+D` stops horizontal movement; pressing `Q` while holding `A`, `S`, or `D` dashes in that direction with i-frames; pressing `Space` only jumps; switching weapons mid-reload cancels the reload cleanly.
2. **Shop & AI Partner:** Opening the shop (`B`) in Solo/Bot mode pauses zombie attacks; Sheva faces zombies when shooting; reviving Sheva restores her HP to 65%; both players going down triggers Game Over.
3. **RE5 Combat Loop:** Shooting a zombie's head or legs triggers visible stagger; approaching a staggered zombie displays the `[E]` prompt and executes the AoE finisher with knockback; killed zombies tumble to the ground and drop magnetic loot items (`GOLD`, `AMMO`, `HERB`, `COMBO`).
