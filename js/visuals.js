// ============================================================
// CINEMATIC PIPELINE — Three.js r128, sem dependências adicionais
// Bloom (bright-pass + gaussian blur), vinheta, grão discreto,
// color grading e aberração cromática leve; preset ALTO desliga
// os render targets e usa a renderização tradicional.
// ============================================================

let cinematicPost = null;

function initializeCinematicPost() {
    if (typeof THREE.WebGLRenderTarget !== 'function' || typeof THREE.ShaderMaterial !== 'function') return;
    try {
        const fullscreenVertex = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `;
        function material(fragment, uniforms) {
            return new THREE.ShaderMaterial({
                uniforms, vertexShader: fullscreenVertex, fragmentShader: fragment,
                depthTest: false, depthWrite: false,
                blending: THREE.NoBlending,
                toneMapped: false
            });
        }
        const brightMaterial = material(`
            uniform sampler2D tDiffuse;
            varying vec2 vUv;
            void main() {
                vec3 c = texture2D(tDiffuse, vUv).rgb;
                float l = max(max(c.r, c.g), c.b);
                float mask = smoothstep(0.56, 1.08, l);
                gl_FragColor = vec4(c * mask, 1.0);
            }
        `, { tDiffuse: { value: null } });
        const blurMaterial = material(`
            uniform sampler2D tDiffuse;
            uniform vec2 uTexel;
            uniform vec2 uDirection;
            varying vec2 vUv;
            void main() {
                vec3 sum = vec3(0.0);
                sum += texture2D(tDiffuse, vUv).rgb * 0.227027;
                sum += texture2D(tDiffuse, vUv + uDirection * uTexel * 1.384615).rgb * 0.316216;
                sum += texture2D(tDiffuse, vUv - uDirection * uTexel * 1.384615).rgb * 0.316216;
                sum += texture2D(tDiffuse, vUv + uDirection * uTexel * 3.230769).rgb * 0.070270;
                sum += texture2D(tDiffuse, vUv - uDirection * uTexel * 3.230769).rgb * 0.070270;
                gl_FragColor = vec4(sum, 1.0);
            }
        `, {tDiffuse:{value:null},uTexel:{value:new THREE.Vector2(1,1)},uDirection:{value:new THREE.Vector2(1,0)}});
        const composeMaterial = material(`
            uniform sampler2D tScene;
            uniform sampler2D tBloom;
            uniform float uTime;
            uniform vec2 uResolution;
            varying vec2 vUv;
            float hash(vec2 n) { return fract(sin(dot(n,vec2(12.9898,78.233)))*43758.5453); }
            void main() {
                vec2 uv = vUv;
                vec2 ca = (uv - 0.5) * 0.002;
                vec3 col;
                col.r = texture2D(tScene, uv + ca).r;
                col.g = texture2D(tScene, uv).g;
                col.b = texture2D(tScene, uv - ca).b;
                vec3 bloom = texture2D(tBloom, uv).rgb;
                col += bloom * 0.65;
                // Graduação quente de meio-tom e sombras ligeiramente frias.
                float luma = dot(col,vec3(0.2126,0.7152,0.0722));
                col *= mix(vec3(0.97,1.005,1.04), vec3(1.075,1.015,0.96), smoothstep(0.12,0.86,luma));
                float vignette = 1.0-smoothstep(0.18,0.87,length((uv-0.5)*vec2(1.1,0.95)));
                col *= mix(0.71,1.025,vignette);
                float grain = hash(floor(uv*uResolution*0.62)+floor(uTime*36.0)) - 0.5;
                col += grain * 0.017;
                col = max(col,vec3(0.0));
                gl_FragColor = vec4(col,1.0);
            }
        `, {
            tScene:{value:null},tBloom:{value:null},uTime:{value:0},
            uResolution:{value:new THREE.Vector2(1,1)}
        });
        const fsScene = new THREE.Scene();
        const fsCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2,2), brightMaterial);
        quad.frustumCulled=false;
        fsScene.add(quad);
        const makeRT = () => new THREE.WebGLRenderTarget(1,1,{
            minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
            format:THREE.RGBAFormat, depthBuffer:false, stencilBuffer:false
        });
        const sceneTarget = new THREE.WebGLRenderTarget(1,1,{
            minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
            format:THREE.RGBAFormat, depthBuffer:true, stencilBuffer:false
        });
        cinematicPost={sceneTarget,brightTarget:makeRT(),blurXTarget:makeRT(),blurYTarget:makeRT(),
            fsScene,fsCamera,quad,brightMaterial,blurMaterial,composeMaterial};
        resizeCinematicPost();
    } catch(err) {
        console.warn('Pós-processamento desativado: fallback WebGL padrão',err);
        if(cinematicPost) {
            for(const key of ['sceneTarget','brightTarget','blurXTarget','blurYTarget']) cinematicPost[key].dispose();
        }
        cinematicPost=null;
    }
}

function resizeCinematicPost() {
    if(!cinematicPost || !renderer) return;
    const pixelRatio=renderer.getPixelRatio();
    const w=Math.max(1,Math.floor(window.innerWidth*pixelRatio));
    const h=Math.max(1,Math.floor(window.innerHeight*pixelRatio));
    const bloomW=Math.max(1,Math.floor(w/4));
    const bloomH=Math.max(1,Math.floor(h/4));
    cinematicPost.sceneTarget.setSize(w,h);
    for(const target of [cinematicPost.brightTarget,cinematicPost.blurXTarget,cinematicPost.blurYTarget])
        target.setSize(bloomW,bloomH);
    cinematicPost.blurMaterial.uniforms.uTexel.value.set(1/bloomW,1/bloomH);
    cinematicPost.composeMaterial.uniforms.uResolution.value.set(w,h);
}

function renderCinematicFrame(dt,elapsedTime) {
    if(!cinematicPost || !currentGraphicsPreset().bloom) {
        renderer.render(scene,camera);
        return;
    }
    const fx=cinematicPost;
    renderer.setRenderTarget(fx.sceneTarget);
    renderer.render(scene,camera);
    fx.quad.material=fx.brightMaterial;
    fx.brightMaterial.uniforms.tDiffuse.value=fx.sceneTarget.texture;
    renderer.setRenderTarget(fx.brightTarget);
    renderer.render(fx.fsScene,fx.fsCamera);
    fx.quad.material=fx.blurMaterial;
    fx.blurMaterial.uniforms.tDiffuse.value=fx.brightTarget.texture;
    fx.blurMaterial.uniforms.uDirection.value.set(1,0);
    renderer.setRenderTarget(fx.blurXTarget);
    renderer.render(fx.fsScene,fx.fsCamera);
    fx.blurMaterial.uniforms.tDiffuse.value=fx.blurXTarget.texture;
    fx.blurMaterial.uniforms.uDirection.value.set(0,1);
    renderer.setRenderTarget(fx.blurYTarget);
    renderer.render(fx.fsScene,fx.fsCamera);
    fx.quad.material=fx.composeMaterial;
    fx.composeMaterial.uniforms.tScene.value=fx.sceneTarget.texture;
    fx.composeMaterial.uniforms.tBloom.value=fx.blurYTarget.texture;
    fx.composeMaterial.uniforms.uTime.value=elapsedTime;
    renderer.setRenderTarget(null);
    renderer.render(fx.fsScene,fx.fsCamera);
}


// Pré-compilação antes da primeira missão. renderer.compile() prepara programas GLSL
// presentes na cena, e o render offscreen antecipa upload de buffers/texturas.
// O compilador do Three r128 é síncrono; este trabalho ocorre no carregamento,
// nunca em um timer recorrente durante a partida.
let shadersPrewarmed = false;
function prewarmGameShaders() {
    if (shadersPrewarmed || !renderer || !scene || !camera || typeof renderer.compile !== 'function') return false;
    const previewObjects = [];
    const temporarilyVisible = [];
    let target = null;
    const oldShadow = renderer.shadowMap.enabled;
    const oldCastShadow = scene.userData.sunLight ? scene.userData.sunLight.castShadow : false;
    const oldTarget = typeof renderer.getRenderTarget === 'function' ? renderer.getRenderTarget() : null;
    try {
        // Armas ocultas também precisam de buffers/shaders preparados antes do primeiro uso.
        const weaponVisuals = [...(typeof weaponModels !== 'undefined' ? weaponModels : []),
            typeof muzzleFlash !== 'undefined' ? muzzleFlash : null,
            net.ally && net.ally.muzzleFlash ? net.ally.muzzleFlash : null,
            typeof flashlightBeam !== 'undefined' ? flashlightBeam : null];
        weaponVisuals.forEach(object => {
            if (object && !object.visible) {
                temporarilyVisible.push(object);
                object.visible = true;
            }
        });
        // Tipos distintos de inimigos usam materiais e geometrias próprias.
        let i = 0;
        for (const [name, archetype] of Object.entries(ZOMBIE_TYPES)) {
            const preview = createZombieMesh(archetype, name === 'ACID');
            preview.group.position.set((i++ - 2) * 1.3, -0.8, -8);
            if (preview.parts.staggerRing) preview.parts.staggerRing.visible = true;
            scene.add(preview.group);
            previewObjects.push(preview.group);
        }
        // Shaders de partículas aditivas, decals, projéteis e efeitos básicos.
        const warmObjects = [
            new THREE.Mesh(new THREE.SphereGeometry(0.3,8,6), new THREE.MeshBasicMaterial({color:0xff6633,transparent:true,opacity:0.5,depthWrite:false,blending:THREE.AdditiveBlending})),
            new THREE.Mesh(new THREE.RingGeometry(0.3,0.5,16),new THREE.MeshBasicMaterial({color:0xffdd88,side:THREE.DoubleSide,transparent:true,opacity:0.8,blending:THREE.AdditiveBlending})),
            new THREE.Mesh(new THREE.CircleGeometry(0.4,10),new THREE.MeshBasicMaterial({color:0x662211,transparent:true,depthWrite:false})),
            new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.2,6),new THREE.MeshStandardMaterial({color:0xffcc77,metalness:0.85,roughness:0.2})),
            new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(0,0,1)]), new THREE.LineBasicMaterial({color:0xffd855,transparent:true,opacity:0.85})),
            // Rastros volumétricos, fumaça e pulso de impacto usam shaders distintos.
            new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.007,1,6,1,true),new THREE.MeshBasicMaterial({color:0xffed8d,transparent:true,opacity:0.9,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false})),
            new THREE.Mesh(new THREE.SphereGeometry(0.15,8,6),new THREE.MeshBasicMaterial({color:0x9b9893,transparent:true,opacity:0.2,depthWrite:false})),
            new THREE.Mesh(new THREE.RingGeometry(0.18,0.27,16),new THREE.MeshBasicMaterial({color:0x67e8ff,transparent:true,opacity:0.7,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,depthWrite:false}))
        ];
        warmObjects.forEach((obj, index) => {
            obj.position.set(-1.5+index,-0.5,-4);
            scene.add(obj); previewObjects.push(obj);
        });
        // Compila combinações dos perfis com/sem sombras e com/sem luminárias.
        for (const lamps of [true, false]) {
            if (scene.userData.localLights) scene.userData.localLights.forEach(light => {light.visible = lamps;});
            for (const enabled of [true,false]) {
                renderer.shadowMap.enabled = enabled;
                if (scene.userData.sunLight) scene.userData.sunLight.castShadow = enabled;
                renderer.shadowMap.needsUpdate = true;
                renderer.compile(scene,camera);
            }
        }
        if (cinematicPost) {
            const fx=cinematicPost;
            for (const material of [fx.brightMaterial,fx.blurMaterial,fx.composeMaterial]) {
                fx.quad.material = material;
                renderer.compile(fx.fsScene,fx.fsCamera);
            }
            fx.quad.material = fx.composeMaterial;
        }
        if (typeof THREE.WebGLRenderTarget === 'function' && typeof renderer.setRenderTarget === 'function') {
            target = new THREE.WebGLRenderTarget(8,8,{depthBuffer:true,stencilBuffer:false});
            renderer.setRenderTarget(target);
            renderer.render(scene,camera);
        }
        shadersPrewarmed = true;
        const label = document.getElementById('shader-warmup-status');
        if (label) label.textContent = 'Shaders pré-compilados ✓';
        return true;
    } catch (err) {
        console.warn('Pré-compilação parcial: shaders restantes serão compilados sob demanda.',err);
        const label = document.getElementById('shader-warmup-status');
        if (label) label.textContent = 'Shaders carregados parcialmente';
        return false;
    } finally {
        if (typeof renderer.setRenderTarget === 'function') renderer.setRenderTarget(oldTarget);
        renderer.shadowMap.enabled = oldShadow;
        renderer.shadowMap.needsUpdate = true;
        if (scene.userData.sunLight) scene.userData.sunLight.castShadow = oldCastShadow;
        if (scene.userData.localLights) scene.userData.localLights.forEach(light => {light.visible = currentGraphicsPreset().lamps;});
        temporarilyVisible.forEach(object => {object.visible = false;});
        previewObjects.forEach(root => {
            scene.remove(root);
            // Descartar só os materiais clonados e as geometrias temporárias;
            // geometrias de protótipos são preservadas no cache.
            if (typeof disposeVisualObject === 'function') disposeVisualObject(root);
            if (root.isLine) {
                root.geometry.dispose(); root.material.dispose();
            }
        });
        if (target) target.dispose();
    }
}
