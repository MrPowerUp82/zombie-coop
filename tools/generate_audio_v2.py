"""Biblioteca de efeitos originais, gerados localmente para Zombie Co-op.
Nenhuma gravação ou arquivo de terceiros é usado. Requer numpy e scipy para regenerar.
O WAV original da escopeta não é modificado.
"""
from pathlib import Path
import wave
import numpy as np
from scipy.signal import butter, sosfilt

RATE = 32000
OUT = Path(__file__).resolve().parents[1] / 'assets' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261020)

def tvec(duration): return np.arange(round(duration * RATE)) / RATE

def noise(duration, low=0, high=0):
    n = round(duration * RATE)
    x = rng.standard_normal(n)
    if high and low:
        x = sosfilt(butter(2, [low, high], fs=RATE, btype='bandpass', output='sos'), x)
    elif low:
        x = sosfilt(butter(2, low, fs=RATE, btype='highpass', output='sos'), x)
    elif high:
        x = sosfilt(butter(2, high, fs=RATE, btype='lowpass', output='sos'), x)
    return x

def add(dest, src, time=0, level=1):
    start = max(0, round(time * RATE))
    length = min(len(src), len(dest) - start)
    if length > 0: dest[start:start+length] += src[:length] * level

def burst(duration, tau=.03, low=0, high=0, attack=.0007):
    t = tvec(duration)
    env = (1-np.exp(-t/max(.0001,attack))) * np.exp(-t/tau)
    return noise(duration, low, high) * env

def boom(duration, start=100, end=38, tau=.15, strength=1):
    t = tvec(duration)
    frequency = end + (start-end)*np.exp(-t/.045)
    phase = np.cumsum(frequency)/RATE*2*np.pi
    return np.sin(phase) * np.exp(-t/tau)*strength

def echo(x, delay, amount):
    offset = round(delay*RATE)
    if offset < len(x): x[offset:] += x[:-offset]*amount
    return x

def save(name, audio, loudness=.84):
    x = np.asarray(audio,dtype='float64')
    x = np.nan_to_num(x)
    x = np.tanh(x*.95)
    peak = max(1e-7, np.max(np.abs(x)))
    x = x/peak*loudness
    # 1.5ms fade at both ends prevents pops on short clips
    fade = min(len(x)//4, int(.0015*RATE))
    if fade: x[:fade] *= np.linspace(0,1,fade);x[-fade:] *= np.linspace(1,0,fade)
    with wave.open(str(OUT/(name+'.wav')), 'wb') as f:
        f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE)
        f.writeframes((np.clip(x,-1,1)*32767).astype('<i2').tobytes())

# Disparos secos, graves e com reverberação curta para ambiente industrial.
# Diferenciar a massa do ferrolho, do estrondo e da reflexão, sem usar o mesmo ruído em todos.
pistol=np.zeros(round(.49*RATE))
add(pistol,burst(.07,.009,320,10500),0,2.2)
add(pistol,boom(.24,195,65,.065,1.1),.004)
add(pistol,burst(.24,.065,70,2900),.005,1.0)
add(pistol,burst(.018,.004,1600,12000),.052,.6) # ferrolho
for off, level in [(.072,.12),(.147,.07),(.240,.045)]: echo(pistol,off,level)
save('pistol_fire',pistol)

rifle=np.zeros(round(.51*RATE))
add(rifle,burst(.045,.006,420,14000),0,2.6)
add(rifle,burst(.22,.040,120,3500),0,2.15)
add(rifle,boom(.28,178,55,.08,1.6),.006)
add(rifle,burst(.02,.006,1100,7000),.045,.44) # ação de alimentação
add(rifle,noise(.2,80,1600)*np.exp(-tvec(.2)/.082),.042,.33)
for off, level in [(.094,.16),(.187,.095),(.32,.055)]: echo(rifle,off,level)
save('rifle_fire',rifle)

rail=np.zeros(round(.67*RATE)); t=tvec(.6)
chirp=np.sin(2*np.pi*np.cumsum(260+2750*np.exp(-t/.085))/RATE)
add(rail,chirp*np.exp(-t/.13),0,1.1)
add(rail,burst(.10,.017,1000,12000),0,1.2)
add(rail,boom(.46,132,32,.18,1.6),.028)
add(rail,burst(.38,.12,220,2700),.028,.85)
add(rail,np.sin(2*np.pi*np.cumsum(72+460*np.exp(-t/.23))/RATE)*np.exp(-t/.22),.02,.42)
for off,level in [(.09,.12),(.21,.09)]: echo(rail,off,level)
save('railgun_fire',rail)

# Mecânica: ruídos metálicos em 2/3 batidas com suporte grave (sem bipes synth).
def mech(name, timing, duration=.55, pitch=1, heavy=.5):
    x=np.zeros(round(duration*RATE))
    for off,vel in timing:
        add(x,burst(.065,.009,650*pitch,9000),off,vel*1.4)
        add(x,boom(.10,380*pitch,95*pitch,.018,vel*heavy),off+.001)
        add(x,burst(.115,.024,100,2100),off+.012,vel*.45)
    save(name,x,.61)
mech('pistol_reload',[(.0,.85),(.13,.52),(.37,1)],.58,1.3,.38)
mech('rifle_reload',[(.0,.8),(.20,.78),(.43,1)],.7,.9,.73)
mech('weapon_bolt',[(.0,1),(.105,.75)],.29,1.35,.42)
mech('railgun_reload',[(0,.78),(.17,.7),(.4,1)],.66,1.3,.55)
mech('shotgun_shell',[(.0,.7),(.13,1)],.28,.85,.35)
mech('shotgun_pump',[(0,.75),(.18,1)],.36,.75,.9)
mech('weapon_equip',[(0,.5),(.09,.55)],.23,.9,.35)
mech('weapon_empty',[(0,1)],.11,1.6,.27)

# Sons materiais — passos em areia e poeira (2 variações), salto e aterrissagem.
for i in range(1,5):
    t=tvec(.27)
    grit=burst(.24,.045,450,7000,attack=.003)
    dirt=noise(.27,60,1200)*np.exp(-t/.067)
    x=np.zeros(len(t));add(x,grit,0,.48+rng.uniform(-.08,.08));add(x,dirt,.008,.95)
    if i%2: add(x,burst(.065,.016,1900,11000),.027,.22)
    save(f'footstep_{i}',x,.51)
landing=boom(.35,135,55,.09,1.2)+burst(.35,.105,80,3800)*1.1
save('land',landing,.63)
save('jump',burst(.20,.067,190,4500)+boom(.20,200,90,.045,.45),.49)

# Impactos e colisões
save('impact_body',burst(.33,.06,110,3600)*1.4+boom(.33,110,40,.075,1.15),.65)
save('impact_head',burst(.24,.037,380,7000)*1.1+boom(.24,170,55,.045,.8),.60)
save('impact_metal',burst(.38,.055,600,10000)+np.sin(2*np.pi*1980*tvec(.38))*np.exp(-tvec(.38)/.071)*.28,.56)
save('melee_swing',burst(.30,.08,250,4900)*1.1+boom(.30,310,80,.070,.26),.48)
save('melee_hit',burst(.28,.036,90,3200)*1.25+boom(.28,140,30,.066,1),.59)
save('damage_player',burst(.42,.125,130,2500)*.9+boom(.42,190,50,.2,1.15),.55)
save('death_player',boom(1.15,170,29,.4,1.3)+burst(1.15,.32,100,1700),.71)
save('grenade_throw',burst(.33,.072,350,6500)+boom(.33,280,130,.065,.2),.48)
save('grenade_bounce',burst(.15,.025,300,9000)+boom(.15,470,155,.030,.35),.35)
save('explosion',boom(1.25,135,26,.32,2)+burst(1.25,.29,50,2500)*1.6+burst(1.25,.07,700,12000)*.6,.87)
save('turret_fire',burst(.24,.015,600,11000)*1.4+boom(.24,255,85,.036,.6),.53)
save('flashlight',burst(.12,.011,1100,11000)*.8+boom(.12,950,490,.021,.22),.44)

# Zumbis: pulsos de formantes, distorção de garganta, variação de duração e timbre.
for idx,(f0,duration) in enumerate([(73,1.45),(102,1.1),(65,1.70),(55,2.20)],1):
    t=tvec(duration)
    wobble=1+.065*np.sin(2*np.pi*(1.1+idx*.19)*t)
    ph=np.cumsum(f0*wobble)/RATE*2*np.pi
    voice=np.sin(ph)*.7+np.sin(ph*2.04)*.35+np.sin(ph*3.12)*.25
    growl=np.tanh(voice*2.2)
    breath=noise(duration,100,2700)*.24
    e=np.minimum(1,t/.13)*np.minimum(1,(duration-t)/.27) * (.7+.3*np.sin(2*np.pi*2.1*t)**2)
    save(f'zombie_groan_{idx}',(growl+breath)*e,.52)
save('zombie_attack',boom(.46,145,60,.17,1)+burst(.46,.11,100,2400)*1.4,.70)
save('zombie_die',boom(.97,117,36,.24,1)+burst(.97,.28,100,1900)*.78,.62)

# HUD / itens, interface. Nota: curtos, baixos e específicos.
def chord(name,notes,length=.35,level=.55):
    t=tvec(length); x=np.zeros(len(t))
    for idx,(frequency,delay) in enumerate(notes):
        ii=round(delay*RATE)
        tt=t[:len(t)-ii]
        env=(1-np.exp(-tt/.004))*np.exp(-tt/.09)
        x[ii:]+=np.sin(2*np.pi*frequency*tt)*env*.55
        x[ii:]+=np.sin(2*np.pi*(frequency*2)*tt)*env*.11
    save(name,x,level)
chord('pickup',[(520,0),(745,.085)],.3,.38)
chord('heal',[(390,0),(520,.095),(655,.2)],.49,.48)
chord('ui_click',[(470,0)],.105,.25)
chord('ui_confirm',[(520,0),(780,.09)],.25,.33)
chord('ui_deny',[(300,0),(235,.10)],.28,.32)
chord('ping',[(720,0),(1000,.12)],.42,.42)
chord('wave_start',[(300,0),(440,.21),(590,.36)],.85,.58)
chord('wave_clear',[(660,0),(820,.15),(1010,.28)],.60,.46)
chord('sentry_deploy',[(280,0),(390,.10)],.25,.34)
chord('boss_alarm',[(210,0),(170,.27),(200,.58)],1.0,.48)
# Ventos e ruídos industriais distantes, laço com crossfade natural.
dur=8.0;t=tvec(dur)
wind=noise(dur,60,800)*(.34+.09*np.sin(2*np.pi*t/.68))
industrial=np.sin(2*np.pi*52*t)*(.06+.025*np.sin(2*np.pi*t/3))
amb=wind*.39+industrial
n=round(.4*RATE);f=np.linspace(0,1,n)
amb[:n] = amb[:n]*f+amb[-n:]*(1-f)
save('ambient_industrial',amb,.25)
print('Original sound assets created:',len(list(OUT.glob('*.wav'))),'(shotgun_fire kept)')
