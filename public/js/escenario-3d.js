// =========================================================
// ESCENARIO 3D INTERACTIVO CON THREE.JS - MARIO BROS HUB
// =========================================================

(function () {
    let scene, camera, renderer, controls;
    let autoRotate = true;
    let isNight = true;
    let dirLight, ambientLight, coinMesh, questionBlock;

    function init3D() {
        const container = document.getElementById('contenedor-3d');
        const loading = document.getElementById('loading3d');
        if (!container) return;

        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;

        // 1. Escena
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f111a);

        // 2. Cámara
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        camera.position.set(0, 12, 28);

        // 3. Renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // Ocultar mensaje de carga y agregar canvas
        if (loading) loading.style.display = 'none';
        container.appendChild(renderer.domElement);

        // 4. Controles OrbitControls (Rotación y Zoom)
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 - 0.05; // No atravesar el suelo
        controls.minDistance = 10;
        controls.maxDistance = 50;

        // 5. Iluminación
        ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        dirLight = new THREE.DirectionalLight(0xffddaa, 1.2);
        dirLight.position.set(15, 25, 15);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        scene.add(dirLight);

        // 6. Construcción del Nivel de Mario en 3D
        crearSuelo();
        crearTuberias();
        crearBloques();
        crearCastillo();

        // 7. Eventos de Interacción (Clics y Botones)
        window.addEventListener('resize', onWindowResize);
        setupControlesUI();
        setupRaycaster(container);

        // 8. Bucle de Animación
        animate();
    }

    // --- CONSTRUCCIÓN DE OBJETOS 3D ---

    function crearSuelo() {
        // Suelo verde / ladrillos
        const geometry = new THREE.BoxGeometry(30, 2, 20);
        const material = new THREE.MeshStandardMaterial({ color: 0xe60012, roughness: 0.8 });
        const floor = new THREE.Mesh(geometry, material);
        floor.position.set(0, -1, 0);
        floor.receiveShadow = true;
        scene.add(floor);

        // Capa de hierba verde superior
        const grassGeo = new THREE.BoxGeometry(30.2, 0.4, 20.2);
        const grassMat = new THREE.MeshStandardMaterial({ color: 0x28a745, roughness: 0.6 });
        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.position.set(0, 0.1, 0);
        grass.receiveShadow = true;
        scene.add(grass);
    }

    function crearTuberias() {
        const matTuberia = new THREE.MeshStandardMaterial({ color: 0x00cc44, roughness: 0.3, metalness: 0.2 });

        function hacerTuberia(x, z, altura) {
            const grupo = new THREE.Group();

            // Cuerpo
            const cuerpoGeo = new THREE.CylinderGeometry(1.2, 1.2, altura, 32);
            const cuerpo = new THREE.Mesh(cuerpoGeo, matTuberia);
            cuerpo.position.y = altura / 2;
            cuerpo.castShadow = true;
            cuerpo.receiveShadow = true;
            grupo.add(cuerpo);

            // Borde superior
            const bordeGeo = new THREE.CylinderGeometry(1.45, 1.45, 0.8, 32);
            const borde = new THREE.Mesh(bordeGeo, matTuberia);
            borde.position.y = altura;
            borde.castShadow = true;
            grupo.add(borde);

            grupo.position.set(x, 0.2, z);
            grupo.userData = { tipo: 'tuberia' };
            scene.add(grupo);
        }

        hacerTuberia(-8, 2, 4);
        hacerTuberia(8, -3, 6);
    }

    function crearBloques() {
        const matBloque = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4, metalness: 0.3 });
        const matLadrillo = new THREE.MeshStandardMaterial({ color: 0xb33c00, roughness: 0.9 });

        // Bloque Misterioso `?`
        const blockGeo = new THREE.BoxGeometry(2, 2, 2);
        questionBlock = new THREE.Mesh(blockGeo, matBloque);
        questionBlock.position.set(0, 6, 2);
        questionBlock.castShadow = true;
        questionBlock.userData = { tipo: 'bloque_pregunta' };
        scene.add(questionBlock);

        // Bloque Ladrillo
        const brickGeo = new THREE.BoxGeometry(2, 2, 2);
        const brick = new THREE.Mesh(brickGeo, matLadrillo);
        brick.position.set(-2.2, 6, 2);
        brick.castShadow = true;
        scene.add(brick);

        // Moneda Giratoria sobre el bloque `?`
        const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.15, 24);
        const coinMat = new THREE.MeshStandardMaterial({ color: 0xffe600, metalness: 0.8, roughness: 0.2 });
        coinMesh = new THREE.Mesh(coinGeo, coinMat);
        coinMesh.rotation.x = Math.PI / 2;
        coinMesh.position.set(0, 8.5, 2);
        coinMesh.castShadow = true;
        scene.add(coinMesh);
    }

    function crearCastillo() {
        const matCastillo = new THREE.MeshStandardMaterial({ color: 0x888899, roughness: 0.7 });
        const grupoCastillo = new THREE.Group();

        // Torre Central
        const torre = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 5), matCastillo);
        torre.position.set(0, 3.5, -6);
        torre.castShadow = true;
        grupoCastillo.add(torre);

        // Puerta
        const puertaMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
        const puerta = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 0.2), puertaMat);
        puerta.position.set(0, 1.5, -3.4);
        grupoCastillo.add(puerta);

        scene.add(grupoCastillo);
    }

    // --- CONTROLES Y ANIMACIÓN ---

    function setupControlesUI() {
        const btnReset = document.getElementById('btn3dReset');
        const btnLuz = document.getElementById('btn3dLuz');
        const btnGiro = document.getElementById('btn3dGiro');

        if (btnReset) {
            btnReset.onclick = () => {
                camera.position.set(0, 12, 28);
                controls.target.set(0, 0, 0);
            };
        }

        if (btnLuz) {
            btnLuz.onclick = () => {
                isNight = !isNight;
                scene.background.setHex(isNight ? 0x0f111a : 0x60a0ff);
                ambientLight.intensity = isNight ? 0.6 : 0.9;
                btnLuz.innerHTML = isNight ? '<i class="fas fa-moon"></i> Modo Noche' : '<i class="fas fa-sun"></i> Modo Día';
            };
        }

        if (btnGiro) {
            btnGiro.onclick = () => {
                autoRotate = !autoRotate;
                btnGiro.innerHTML = autoRotate ? '<i class="fas fa-redo"></i> Auto-Rotación: ON' : '<i class="fas fa-pause"></i> Auto-Rotación: OFF';
            };
        }
    }

    function setupRaycaster(container) {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        container.addEventListener('click', (e) => {
            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            if (intersects.length > 0) {
                let obj = intersects[0].object;
                while (obj.parent && !obj.userData.tipo && obj.parent !== scene) {
                    obj = obj.parent;
                }
                if (obj.userData.tipo === 'bloque_pregunta') {
                    // Animación de salto del bloque
                    obj.position.y += 0.5;
                    setTimeout(() => obj.position.y -= 0.5, 150);
                    if (window.MarioHub) window.MarioHub.track('coin_collected', 'Moneda 3D tocada');
                }
            }
        });
    }

    function onWindowResize() {
        const container = document.getElementById('contenedor-3d');
        if (!container || !renderer || !camera) return;
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    function animate() {
        requestAnimationFrame(animate);

        // Rotación de la moneda
        if (coinMesh) coinMesh.rotation.z += 0.04;

        // Auto-rotación de la cámara
        if (autoRotate && controls) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 1.5;
        } else if (controls) {
            controls.autoRotate = false;
        }

        if (controls) controls.update();
        if (renderer && scene && camera) renderer.render(scene, camera);
    }

    // Inicializar al cargar el DOM
    document.addEventListener('DOMContentLoaded', () => {
        // Inicializar cuando la pestaña 3D se muestre
        const tab3D = document.getElementById('pestana-3d');
        if (tab3D) {
            const observer = new MutationObserver(() => {
                if (tab3D.classList.contains('activa') && !renderer) {
                    init3D();
                }
            });
            observer.observe(tab3D, { attributes: true, attributeFilter: ['class'] });
            if (tab3D.classList.contains('activa')) init3D();
        }
    });
})();

