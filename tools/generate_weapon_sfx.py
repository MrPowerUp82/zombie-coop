"""Reproducible original CC0-like (authored in-project) synthesized FPS audio.
Requires numpy for generation only; the game plays generated WAVs directly.
No third-party sound recordings are included.
"""
from pathlib import Path
import wave
import numpy as np

RATE = 22050
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7421)

def noise(n):
    return rng.standard_normal(n).astype(np.float64)

def impulse(duration, crack=1, bass=0.5, tail=0.16, resonance=80, metallic=0.08):
    n = int(RATE * duration)
    t = np.arange(n) / RATE
    w = noise(n)
    # Sharp transient + moving low-pass for short high frequency impact.
    hp = w - np.convolve(w, np.ones(19) / 19, mode='same')
    lp = np.convolve(w, np.ones(35) / 35, mode='same')
    hit = (hp * np.exp(-t / 0.010) * crack + lp * np.exp(-t / tail) * bass)
    hit += np.sin(2 * np.pi * (resonance * t + 70 * t * t)) * np.exp(-t / 0.09) * bass * 0.6
    hit += np.sin(2 * np.pi * 930 * t) * np.exp(-t / 0.022) * metallic
    return hit

def finalize(raw, filename, gain=0.9, stereo=True):
    raw = np.tanh(raw * 1.9)
    raw /= (max(1e-6, np.max(np.abs(raw))) * 1.05)
    raw *= gain
    if stereo:
        # Small interaural difference and one subtle wall reflection.
        late = np.zeros_like(raw)
        delay = int(RATE * .027)
        late[delay:] = raw[:-delay] * .18
        left = raw + late
        right = raw * .94 + np.roll(late, int(RATE * .007)) * .9
        pcm = np.column_stack([left, right])
    else:
        pcm = raw
    pcm = np.clip(pcm, -1, 1)
    with wave.open(str(OUT / filename), 'wb') as f:
        f.setnchannels(2 if stereo else 1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes((pcm * 32767).astype('<i2').tobytes())

def gunshot(name, duration, crack, bass, resonance, echo=False):
    data = impulse(duration, crack, bass, duration / 3.9, resonance, .14)
    if echo:
        for delay, amount in [(0.075, .19), (.135, .10), (.2, .07)]:
            d = int(RATE * delay)
            if d < data.size: data[d:] += data[:-d] * amount
    finalize(data, name)

def clack(name, length, frequency=1000, low=.35):
    n = int(RATE * length)
    s = np.zeros(n)
    for sec, level, pitch in [(0.0, .9, frequency), (.065, .55, frequency * .6), (.18, .33, frequency * .8)]:
        i = int(sec * RATE)
        if i >= n: continue
        end = min(n - i, int(RATE * .05))
        t = np.arange(end) / RATE
        seg = noise(end) * np.exp(-t / .008) * level
        seg += np.sin(2*np.pi*pitch*t) * np.exp(-t/.012) * low*level
        s[i:i+end] += seg
    finalize(s, name, .6)

# The playback layers the reports and mechanics depending on the firearm.
gunshot('pistol_fire.wav', .23, 1.35, .6, 160)
gunshot('rifle_fire.wav', .26, 1.45, .82, 115)
gunshot('shotgun_fire.wav', .59, 2.0, 1.5, 70, echo=True)
# Energy rifle: a descending chirp plus the attack of a heavy kinetic report.
rail = impulse(.48, .48, .24, .16, 100)
t = np.arange(rail.size) / RATE
phase = 2 * np.pi * (1100 * t - 1450 * t * t)
rail += (np.sin(phase) * .38 + np.sin(phase * .5) * .25) * np.exp(-t / .27)
finalize(rail, 'railgun_fire.wav', .8)
clack('pistol_reload.wav', .34, 1100)
clack('rifle_reload.wav', .32, 680)
clack('shotgun_shell.wav', .32, 820)
clack('shotgun_pump.wav', .31, 740)
clack('railgun_reload.wav', .31, 1300)
clack('weapon_bolt.wav', .24, 1230)
clack('weapon_equip.wav', .16, 950)
print('Generated', len(list(OUT.glob('*.wav'))), 'original wave files')
