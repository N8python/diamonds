import * as THREE from 'https://cdn.skypack.dev/three@0.142.0';
import { EffectComposer } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'https://unpkg.com/three@0.142.0/examples/jsm/postprocessing/SMAAPass.js';
import { GammaCorrectionShader } from 'https://unpkg.com/three@0.142.0/examples/jsm/shaders/GammaCorrectionShader.js';
import { EffectShader } from "./EffectShader.js";
import { OrbitControls } from 'https://unpkg.com/three@0.142.0/examples/jsm/controls/OrbitControls.js';
import { AssetManager } from './AssetManager.js';
import { Stats } from "./stats.js";
import {
    MeshBVH,
    MeshBVHVisualizer,
    MeshBVHUniformStruct,
    FloatVertexAttributeTexture,
    shaderStructs,
    shaderIntersectFunction,
    SAH
} from 'https://unpkg.com/three-mesh-bvh@0.5.10/build/index.module.js';
import { GUI } from 'https://unpkg.com/three@0.138.0/examples/jsm/libs/lil-gui.module.min.js';
async function main() {
    // Setup basic renderer, controls, and profiler
    const clientWidth = window.innerWidth * 0.99;
    const clientHeight = window.innerHeight * 0.98;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, clientWidth / clientHeight, 0.1, 1000);
    camera.position.set(50, 75, 50);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(clientWidth, clientHeight);
    document.body.appendChild(renderer.domElement);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 25, 0);
    const stats = new Stats();
    stats.showPanel(0);
    document.body.appendChild(stats.dom);
    // Setup scene
    // Skybox
    const environment = await new THREE.CubeTextureLoader().loadAsync([
        "skybox/Box_Right.bmp",
        "skybox/Box_Left.bmp",
        "skybox/Box_Top.bmp",
        "skybox/Box_Bottom.bmp",
        "skybox/Box_Front.bmp",
        "skybox/Box_Back.bmp"
    ]);
    environment.encoding = THREE.sRGBEncoding;
    scene.background = environment;
    // Lighting
    const ambientLight = new THREE.AmbientLight(new THREE.Color(1.0, 1.0, 1.0), 0.25);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.35);
    directionalLight.position.set(150, 200, 50);
    // Shadows
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.left = -75;
    directionalLight.shadow.camera.right = 75;
    directionalLight.shadow.camera.top = 75;
    directionalLight.shadow.camera.bottom = -75;
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.bias = -0.001;
    directionalLight.shadow.blurSamples = 8;
    directionalLight.shadow.radius = 4;
    scene.add(directionalLight);
    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.15);
    directionalLight2.color.setRGB(1.0, 1.0, 1.0);
    directionalLight2.position.set(-50, 200, -150);
    scene.add(directionalLight2);
    // Objects
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100).applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2)), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide }));
    ground.castShadow = true;
    ground.receiveShadow = true;
    scene.add(ground);
    const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, color: new THREE.Color(1.0, 0.0, 0.0) }));
    box.castShadow = true;
    box.receiveShadow = true;
    box.position.y = 5.01;
    //scene.add(box);
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6.25, 32, 32), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: environment, metalness: 1.0, roughness: 0.25 }));
    sphere.position.y = 7.5;
    sphere.position.x = 25;
    sphere.position.z = 25;
    sphere.castShadow = true;
    sphere.receiveShadow = true;
    //scene.add(sphere);
    const torusKnot = new THREE.Mesh(new THREE.TorusKnotGeometry(5, 1.5, 200, 32), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, envMap: environment, metalness: 0.5, roughness: 0.5, color: new THREE.Color(0.0, 1.0, 0.0) }));
    torusKnot.position.y = 10;
    torusKnot.position.x = -25;
    torusKnot.position.z = -25;
    torusKnot.castShadow = true;
    torusKnot.receiveShadow = true;
    // scene.add(torusKnot);
    let diamondGeo = (await AssetManager.loadGLTFAsync("diamond.glb")).scene.children[0].children[0].children[0].children[0].children[0].geometry;
    diamondGeo.scale(10, 10, 10);
    diamondGeo.translate(0, 5, 0);
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCamera = new THREE.CubeCamera(1, 100000, cubeRenderTarget);
    scene.add(cubeCamera);
    cubeCamera.position.set(0, 5, 0);
    cubeCamera.update(renderer, scene);
    //scene.background = cubeRenderTarget.texture;
    const makeDiamond = (geo, {
            color = new THREE.Color(1, 1, 1),
            ior = 2.4
        } = {}) => {
            const mergedGeometry = geo;
            mergedGeometry.boundsTree = new MeshBVH(mergedGeometry.toNonIndexed(), { lazyGeneration: false, strategy: SAH });
            const collider = new THREE.Mesh(mergedGeometry);
            collider.material.wireframe = true;
            collider.material.opacity = 0.5;
            collider.material.transparent = true;
            collider.visible = false;
            collider.boundsTree = mergedGeometry.boundsTree;
            scene.add(collider);
            const visualizer = new MeshBVHVisualizer(collider, 20);
            visualizer.visible = false;
            visualizer.update();
            scene.add(visualizer);
            const diamond = new THREE.Mesh(geo, new THREE.ShaderMaterial({
                uniforms: {
                    envMap: { value: environment },
                    bvh: { value: new MeshBVHUniformStruct() },
                    bounces: { value: 3 },
                    color: { value: color },
                    ior: { value: ior },
                    correctMips: { value: true },
                    projectionMatrixInv: { value: camera.projectionMatrixInverse },
                    viewMatrixInv: { value: camera.matrixWorld },
                    chromaticAberration: { value: true },
                    aberrationStrength: { value: 0.01 },
                    resolution: { value: new THREE.Vector2(clientWidth, clientHeight) }
                },
                vertexShader: /*glsl*/ `
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            uniform mat4 viewMatrixInv;
            void main() {
                vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
                vNormal = (viewMatrixInv * vec4(normalMatrix * normal, 0.0)).xyz;
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            }
            `,
                fragmentShader: /*glsl*/ `
            precision highp isampler2D;
            precision highp usampler2D;
            varying vec3 vWorldPosition;
            varying vec3 vNormal;
            uniform samplerCube envMap;
            uniform float bounces;
            ${ shaderStructs }
            ${ shaderIntersectFunction }
            uniform BVH bvh;
            uniform float ior;
            uniform vec3 color;
            uniform bool correctMips;
            uniform bool chromaticAberration;
            uniform mat4 projectionMatrixInv;
            uniform mat4 viewMatrixInv;
            uniform mat4 modelMatrix;
            uniform vec2 resolution;
            uniform bool chromaticAbberation;
            uniform float aberrationStrength;
            vec3 totalInternalReflection(vec3 ro, vec3 rd, vec3 normal, float ior, mat4 modelMatrixInverse) {
                vec3 rayOrigin = ro;
                vec3 rayDirection = rd;
                rayDirection = refract(rayDirection, normal, 1.0 / ior);
                rayOrigin = vWorldPosition + rayDirection * 0.001;
                rayOrigin = (modelMatrixInverse * vec4(rayOrigin, 1.0)).xyz;
                rayDirection = normalize((modelMatrixInverse * vec4(rayDirection, 0.0)).xyz);
                for(float i = 0.0; i < bounces; i++) {
                    uvec4 faceIndices = uvec4( 0u );
                    vec3 faceNormal = vec3( 0.0, 0.0, 1.0 );
                    vec3 barycoord = vec3( 0.0 );
                    float side = 1.0;
                    float dist = 0.0;
                    bvhIntersectFirstHit( bvh, rayOrigin, rayDirection, faceIndices, faceNormal, barycoord, side, dist );
                    vec3 hitPos = rayOrigin + rayDirection * max(dist - 0.001, 0.0);
                   // faceNormal *= side;
                    vec3 tempDir = refract(rayDirection, faceNormal, ior);
                    if (length(tempDir) != 0.0) {
                        rayDirection = tempDir;
                        break;
                    }
                    rayDirection = reflect(rayDirection, faceNormal);
                    rayOrigin = hitPos + rayDirection * 0.01;
                }
                rayDirection = normalize((modelMatrix * vec4(rayDirection, 0.0)).xyz);
                return rayDirection;
            }
            void main() {
                mat4 modelMatrixInverse = inverse(modelMatrix);
                vec2 uv = gl_FragCoord.xy / resolution;
                vec3 directionCamPerfect = (projectionMatrixInv * vec4(uv * 2.0 - 1.0, 0.0, 1.0)).xyz;
                directionCamPerfect = (viewMatrixInv * vec4(directionCamPerfect, 0.0)).xyz;
                directionCamPerfect = normalize(directionCamPerfect);
                vec3 normal = vNormal;
                vec3 rayOrigin = cameraPosition;
                vec3 rayDirection = normalize(vWorldPosition - cameraPosition);
                vec3 finalColor;
                if (chromaticAberration) {
                vec3 rayDirectionR = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 - aberrationStrength), 1.0), modelMatrixInverse);
                vec3 rayDirectionG = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), modelMatrixInverse);
                vec3 rayDirectionB = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior * (1.0 + aberrationStrength), 1.0), modelMatrixInverse);
                float finalColorR = textureGrad(envMap, rayDirectionR, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).r;
                float finalColorG = textureGrad(envMap, rayDirectionG, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).g;
                float finalColorB = textureGrad(envMap, rayDirectionB, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).b;
                finalColor = vec3(finalColorR, finalColorG, finalColorB) * color;
                } else {
                    rayDirection = totalInternalReflection(rayOrigin, rayDirection, normal, max(ior, 1.0), modelMatrixInverse);
                    finalColor = textureGrad(envMap, rayDirection, dFdx(correctMips ? directionCamPerfect: rayDirection), dFdy(correctMips ? directionCamPerfect: rayDirection)).rgb;
                    finalColor *= color;
                }
                gl_FragColor = vec4(vec3(finalColor), 1.0);
            }
            `
            }));
            diamond.material.uniforms.bvh.value.updateFrom(collider.boundsTree);
            diamond.castShadow = true;
            diamond.receiveShadow = true;
            return diamond;
        }
        /*const gemGeo = new THREE.BufferGeometry();
        const baseX = 1;
        const baseY = 1;
        const height = 5;
        const heightTop = 3;
        const scale = 1.5;
        const positions = [];
        positions.push(baseX / 2, baseY / 2, 0);
        positions.push(baseX / 2, -baseY / 2, 0);
        positions.push(-baseX / 2, -baseY / 2, 0);
        positions.push(-baseX / 2, -baseY / 2, 0);
        positions.push(-baseX / 2, baseY / 2, 0);
        positions.push(baseX / 2, baseY / 2, 0);

        positions.push(baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(-baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(-baseX / 2, -baseY / 2, 0);
        positions.push(-baseX / 2, -baseY / 2, 0);
        positions.push(baseX / 2, -baseY / 2, 0);
        positions.push(baseX / 2 * scale, -baseY / 2 * scale, height);

        positions.push(baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(baseX / 2, -baseY / 2, 0);
        positions.push(baseX / 2, -baseY / 2, 0);
        positions.push(baseX / 2, baseY / 2, 0);
        positions.push(baseX / 2 * scale, baseY / 2 * scale, height);

        positions.push(-baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(baseX / 2, baseY / 2, 0);
        positions.push(baseX / 2, baseY / 2, 0);
        positions.push(-baseX / 2, baseY / 2, 0);
        positions.push(-baseX / 2 * scale, baseY / 2 * scale, height);

        positions.push(-baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(-baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(-baseX / 2, baseY / 2, 0);
        positions.push(-baseX / 2, baseY / 2, 0);
        positions.push(-baseX / 2, -baseY / 2, 0);
        positions.push(-baseX / 2 * scale, -baseY / 2 * scale, height);

        positions.push(-baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(0, 0, height + heightTop);
        positions.push(baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(0, 0, height + heightTop);
        positions.push(baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(-baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(0, 0, height + heightTop);
        positions.push(-baseX / 2 * scale, baseY / 2 * scale, height);
        positions.push(-baseX / 2 * scale, -baseY / 2 * scale, height);
        positions.push(0, 0, height + heightTop);

        gemGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
        gemGeo.computeVertexNormals();
        //gemGeo.scale(10, 10, 10);
        //gemGeo.rotateX(-Math.PI / 2);

        //const gem
        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                const clusterColor = new THREE.Vector3(Math.random(), Math.random(), Math.random());
                for (let i = 0; i < 10; i++) {
                    const newGeo = gemGeo.clone();
                    newGeo.scale(1.0 + Math.random(), 1.0 + Math.random(), 1.0 + Math.random());
                    newGeo.rotateX(-Math.PI / 2 * (0.85 + 0.3 * Math.random()));
                    newGeo.rotateZ((2.5 / 1.5) * (Math.random() - 0.5));
                    newGeo.rotateY((3.0 / 1.5) * (Math.random() - 0.5));
                    newGeo.translate(-32 + x * 16, 0, -32 + y * 16);
                    const diamond = makeDiamond(newGeo, {
                        color: clusterColor.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25)),
                    });
                    scene.add(diamond);
                }
            }
        }*/
    const diamond = makeDiamond(diamondGeo);
    scene.add(diamond);
    // Build postprocessing stack
    // Render Targets
    const defaultTexture = new THREE.WebGLRenderTarget(clientWidth, clientHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter
    });
    defaultTexture.depthTexture = new THREE.DepthTexture(clientWidth, clientHeight, THREE.FloatType);
    // Post Effects
    const composer = new EffectComposer(renderer);
    const smaaPass = new SMAAPass(clientWidth, clientHeight);
    const effectPass = new ShaderPass(EffectShader);
    composer.addPass(effectPass);
    composer.addPass(new ShaderPass(GammaCorrectionShader));
    composer.addPass(smaaPass);
    const effectController = {
        bounces: 3.0,
        ior: 2.4,
        correctMips: true,
        chromaticAberration: true,
        aberrationStrength: 0.01
    };
    const gui = new GUI();
    gui.add(effectController, "bounces", 1.0, 10.0, 1.0).name("Bounces");
    gui.add(effectController, "ior", 1.0, 5.0, 0.01).name("IOR");
    gui.add(effectController, "correctMips");
    gui.add(effectController, "chromaticAberration");
    gui.add(effectController, "aberrationStrength", 0.00, 1.0, 0.0001).name("Aberration Strength");

    function animate() {
        diamond.material.uniforms.bounces.value = effectController.bounces;
        diamond.material.uniforms.ior.value = effectController.ior;
        diamond.material.uniforms.correctMips.value = effectController.correctMips;
        diamond.material.uniforms.chromaticAberration.value = effectController.chromaticAberration;
        diamond.material.uniforms.aberrationStrength.value = effectController.aberrationStrength;
        diamond.rotation.y += 0.01;
        diamond.updateMatrix();
        diamond.updateMatrixWorld();
        renderer.setRenderTarget(defaultTexture);
        renderer.clear();
        renderer.render(scene, camera);
        effectPass.uniforms["sceneDiffuse"].value = defaultTexture.texture;
        composer.render();
        controls.update();
        stats.update();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
}
main();