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
    if(!cinematicPost || gfxQuality !== 'ULTRA') {
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
