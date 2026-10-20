// =============================================
// FX DE DISPARO — pools, clarão, rastro e impacto
// Independente das regras de dano e da rede.
// =============================================
const SHOT_STYLES = Object.freeze({
    PISTOL:  { color:0xffd273, light:2.8, flash:0.085, size:0.82, beam:0.095 },
    RIFLE:   { color:0xffed8d, light:3.5, flash:0.065, size:1.0, beam:0.080 },
    SHOTGUN: { color:0xff9e42, light:4.8, flash:0.125, size:1.65, beam:0.075 },
    RAILGUN: { color:0x67e8ff, light:5.5, flash:0.18,  size:1.85, beam:0.19 }
});
const SHOT_POOL_LIMITS = Object.freeze({ tracers:40, smoke:24, rings:20 });
const shotFX = {
    tracerPool:[], smokePool:[], ringPool:[], smoke:[], rings:[],
    tracerGeo:null, haloGeo:null, smokeGeo:null, ringGeo:null,
    localTimer:0, localMax:0, localLight:0, allyTimer:0, allyMax:0,
    fireCount:0, localScale:1
};

function shotStyle(weaponId) { return SHOT_STYLES[weaponId] || SHOT_STYLES.RIFLE; }
function recolorShotMaterial(material, color) {
    if (material.color && typeof material.color.setHex === 'function') material.color.setHex(color);
    else material.color = color;
}

// Chama-se só na construção dos modelos. Geometrias simples, sem texturas remotas.
function createMuzzleFlashVisual() {
    const flash = new THREE.Group();
    const make = (geometry, color, opacity) => new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color, transparent:true, opacity, depthWrite:false, blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide
    }));
    const core = make(new THREE.SphereGeometry(0.11,12,8),0xfff8de,0.96);
    core.scale.set(1,1,1.4);flash.add(core);
    const flame = make(new THREE.ConeGeometry(0.17,0.55,10,1),0xffb54a,0.8);
    flame.rotation.x=-Math.PI/2;flame.position.z=-0.21;flash.add(flame);
    const needle = make(new THREE.ConeGeometry(0.07,0.85,8,1),0xffffd9,0.80);
    needle.rotation.x=-Math.PI/2;needle.position.z=-0.38;flash.add(needle);
    for (let i=0;i<4;i++) {
        const spike=make(new THREE.PlaneGeometry(0.065,0.59),0xffda77,0.65);
        spike.position.z=-0.09;spike.rotation.z=i*Math.PI/4;flash.add(spike);
    }
    const corona=make(new THREE.SphereGeometry(0.24,12,8),0xff982e,0.17);
    corona.scale.set(1,1,0.85);flash.add(corona);
    flash.visible=false;
    return flash;
}

function activateLocalMuzzle(weaponId) {
    if (!muzzleFlash) return;
    const style=shotStyle(weaponId), variance=0.90+Math.random()*0.22;
    muzzleFlash.visible=true;
    muzzleFlash.rotation.z=Math.random()*Math.PI*2;
    shotFX.localScale=style.size*variance;
    muzzleFlash.scale.set(shotFX.localScale,shotFX.localScale,shotFX.localScale);
    const electric=weaponId==='RAILGUN';
    const palette=electric
        ? [0xffffff,0x43dfff,0xb2faff,0x7beaff,0x7beaff,0x7beaff,0x7beaff,0x2c9bd5]
        : [0xfff8de,0xffb54a,0xffffd9,0xffda77,0xffda77,0xffda77,0xffda77,0xff982e];
    muzzleFlash.children.forEach((mesh,i)=>recolorShotMaterial(mesh.material,palette[i]));
    shotFX.localTimer=style.flash;
    shotFX.localMax=style.flash;
    shotFX.localLight=style.light;
    if (muzzleLight) {
        if (muzzleLight.color && typeof muzzleLight.color.setHex==='function') muzzleLight.color.setHex(style.color);
        muzzleLight.intensity=style.light;
    }
}

function activateAllyMuzzle(weaponId='RIFLE') {
    if (!net.ally || !net.ally.muzzleFlash) return;
    const style=shotStyle(weaponId);
    const fx=net.ally.muzzleFlash;
    fx.visible=true;
    fx.rotation.z=Math.random()*Math.PI*2;
    fx.scale.set(style.size*0.75,style.size*0.75,style.size*0.75);
    shotFX.allyTimer=Math.max(style.flash,0.075);
    shotFX.allyMax=shotFX.allyTimer;
}

function ensureShotGeometry() {
    if (!shotFX.tracerGeo) {
        shotFX.tracerGeo=new THREE.CylinderGeometry(0.018,0.006,1,6,1,true);
        shotFX.haloGeo=new THREE.CylinderGeometry(0.068,0.02,1,6,1,true);
        shotFX.smokeGeo=new THREE.SphereGeometry(0.15,8,6);
        shotFX.ringGeo=new THREE.RingGeometry(0.18,0.27,16);
    }
}

// Rastros volumétricos aditivos. Um máximo de 40 malhas é reutilizado nas rajadas.
// Somente o visual é simulado: a lógica de acerto permanece hitscan.
function createBulletTracer(startPos, endPos, colorHex=0xffed8d, weaponId='RIFLE') {
    if (!scene) return;
    ensureShotGeometry();
    if (bulletTracers.length >= SHOT_POOL_LIMITS.tracers) return;
    const style=shotStyle(weaponId);
    let tracer=shotFX.tracerPool.pop();
    if (!tracer) {
        const coreMat=new THREE.MeshBasicMaterial({color:colorHex,transparent:true,opacity:0.93,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
        const haloMat=new THREE.MeshBasicMaterial({color:colorHex,transparent:true,opacity:0.19,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
        const core=new THREE.Mesh(shotFX.tracerGeo,coreMat);
        const halo=new THREE.Mesh(shotFX.haloGeo,haloMat);
        const beam=new THREE.Group();beam.add(core);beam.add(halo);
        tracer={line:beam,core,halo,mat:coreMat,haloMat,life:0,maxLife:0};
    }
    recolorShotMaterial(tracer.mat,colorHex);
    recolorShotMaterial(tracer.haloMat,colorHex);
    const direction=new THREE.Vector3().subVectors(endPos,startPos);
    const distance=direction.length();
    if (distance<=0.001) {shotFX.tracerPool.push(tracer);return;}
    const maxLength=weaponId==='RAILGUN'?110:56;
    const length=Math.min(distance,maxLength);
    direction.multiplyScalar(1/distance);
    tracer.line.position.copy(startPos).addScaledVector(direction,length*0.5);
    if (tracer.line.quaternion && typeof tracer.line.quaternion.setFromUnitVectors==='function') {
        tracer.line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
    }
    const width=weaponId==='RAILGUN'?2.6:weaponId==='SHOTGUN'?0.85:1;
    tracer.core.scale.set(width,length,width);
    tracer.halo.scale.set(width,length,width);
    tracer.halo.visible=currentGraphicsPreset().particles>=0.60;
    tracer.maxLife=style.beam;
    tracer.life=style.beam;
    tracer.mat.opacity=0.96;
    tracer.haloMat.opacity=0.21;
    scene.add(tracer.line);
    bulletTracers.push(tracer);
}

function releaseBulletTracer(tracer) {
    scene.remove(tracer.line);
    if (shotFX.tracerPool.length<SHOT_POOL_LIMITS.tracers) shotFX.tracerPool.push(tracer);
    else {
        tracer.mat.dispose();tracer.haloMat.dispose();
    }
}

function emitShotSmoke(pos, count=1, isImpact=false) {
    const q=currentGraphicsPreset().particles;
    if (q<0.60 || !scene) return;
    ensureShotGeometry();
    count=Math.min(3,Math.max(0,Math.round(count*q)));
    for(let i=0;i<count && shotFX.smoke.length<SHOT_POOL_LIMITS.smoke;i++) {
        let puff=shotFX.smokePool.pop();
        if(!puff) {
            const mat=new THREE.MeshBasicMaterial({color:0x9b9893,transparent:true,opacity:0.23,depthWrite:false});
            puff={mesh:new THREE.Mesh(shotFX.smokeGeo,mat),mat,life:0,maxLife:0,vel:new THREE.Vector3()};
        }
        puff.mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.10,Math.random()*.06,(Math.random()-.5)*.10));
        const size=(isImpact?.5:.62)+Math.random()*.3;
        puff.mesh.scale.set(size,size,size);
        puff.vel.set((Math.random()-.5)*.45,0.22+Math.random()*.50,isImpact?(Math.random()-.5)*.6:-.18);
        puff.maxLife=isImpact?.26+Math.random()*.16:.32+Math.random()*.24;
        puff.life=puff.maxLife;
        puff.mat.opacity=isImpact?0.28:0.20;
        scene.add(puff.mesh);shotFX.smoke.push(puff);
    }
}

function emitShotImpact(pos, weaponId='RIFLE', type='WALL', critical=false) {
    const q=currentGraphicsPreset().particles;
    if(q<0.45 || !scene) return;
    ensureShotGeometry();
    if(shotFX.rings.length>=SHOT_POOL_LIMITS.rings) return;
    const color=type==='FLESH'?(critical?0xff3150:0xcc3d28):weaponId==='RAILGUN'?0x67e8ff:0xffcf68;
    let ring=shotFX.ringPool.pop();
    if(!ring) {
        const mat=new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.75,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
        ring={mesh:new THREE.Mesh(shotFX.ringGeo,mat),mat,life:0,maxLife:0};
    }
    recolorShotMaterial(ring.mat,color);
    ring.mesh.position.copy(pos);
    // Face da marca voltada para o espectador, para ficar legível em qualquer parede.
    ring.mesh.lookAt(camera.position);
    const size=(weaponId==='RAILGUN'?1.7:weaponId==='SHOTGUN'?1.15:0.77)*(critical?1.25:1);
    ring.mesh.scale.set(size,size,size);
    ring.baseSize=size;
    ring.maxLife=weaponId==='RAILGUN'?0.24:0.16;
    ring.life=ring.maxLife;
    ring.mat.opacity=0.75;
    scene.add(ring.mesh);shotFX.rings.push(ring);
    if(type!=='FLESH' && shotFX.rings.length<=8) emitShotSmoke(pos,weaponId==='SHOTGUN'?2:1,true);
}

function updateShotEffects(dt) {
    if(shotFX.localTimer>0) {
        shotFX.localTimer=Math.max(0,shotFX.localTimer-dt);
        const phase=shotFX.localMax?shotFX.localTimer/shotFX.localMax:0;
        if(muzzleLight) muzzleLight.intensity=shotFX.localLight*phase*phase;
        if(muzzleFlash) {
            muzzleFlash.visible=phase>0;
            const s=shotFX.localScale*(0.65+0.35*phase);
            muzzleFlash.scale.set(s,s,s);
        }
    }
    if(shotFX.allyTimer>0) {
        shotFX.allyTimer=Math.max(0,shotFX.allyTimer-dt);
        if(net.ally && net.ally.muzzleFlash) net.ally.muzzleFlash.visible=shotFX.allyTimer>0;
    }
    for(let i=bulletTracers.length-1;i>=0;i--) {
        const beam=bulletTracers[i];beam.life-=dt;
        const phase=Math.max(0,beam.life/beam.maxLife);
        beam.mat.opacity=phase*0.96;
        beam.haloMat.opacity=phase*phase*0.21;
        if(beam.life<=0) {releaseBulletTracer(beam);bulletTracers.splice(i,1);}
    }
    for(let i=shotFX.smoke.length-1;i>=0;i--) {
        const puff=shotFX.smoke[i];puff.life-=dt;
        puff.mesh.position.addScaledVector(puff.vel,dt);
        const phase=Math.max(0,puff.life/puff.maxLife);
        puff.mat.opacity=phase*0.24;
        const increase=1+dt*.85;
        puff.mesh.scale.multiplyScalar(increase);
        if(puff.life<=0){scene.remove(puff.mesh);shotFX.smoke.splice(i,1);shotFX.smokePool.push(puff);}
    }
    for(let i=shotFX.rings.length-1;i>=0;i--) {
        const ring=shotFX.rings[i];ring.life-=dt;
        const progress=Math.min(1,Math.max(0,1-ring.life/ring.maxLife));
        const s=ring.baseSize*(1+progress*1.5);
        ring.mesh.scale.set(s,s,s);
        ring.mat.opacity=(1-progress)*.72;
        if(ring.life<=0){scene.remove(ring.mesh);shotFX.rings.splice(i,1);shotFX.ringPool.push(ring);}
    }
}

function clearShotEffects() {
    bulletTracers.forEach(releaseBulletTracer);
    bulletTracers=[];
    for(const puff of shotFX.smoke){scene.remove(puff.mesh);shotFX.smokePool.push(puff);}
    shotFX.smoke=[];
    for(const ring of shotFX.rings){scene.remove(ring.mesh);shotFX.ringPool.push(ring);}
    shotFX.rings=[];
    shotFX.localTimer=shotFX.allyTimer=0;
    shotFX.fireCount=0;
    if(muzzleFlash) muzzleFlash.visible=false;
    if(muzzleLight) muzzleLight.intensity=0;
    if(net.ally && net.ally.muzzleFlash) net.ally.muzzleFlash.visible=false;
}
