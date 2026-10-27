/* ==========================================================================
1. CONTROLADOR DE REPRODUCTOR DE AUDIO LOCAL
   ========================================================================== */
let audioActual = null;
let audiosReproducidos = Number(localStorage.getItem('mario-audios') || 0);

// Función para pausar otros audios y reproducir el seleccionado al hacer clic
function reproducirAudio(tarjeta) {
    const audio = tarjeta.querySelector('audio');
    if (!audio) return;

    // Si hay otro audio sonando, lo pausa y reinicia
    if (audioActual && audioActual !== audio) {
        audioActual.pause();
        audioActual.currentTime = 0;
    }

    // Alterna entre reproducir y pausar
    if (audio.paused) {
        audio.play();
        audioActual = audio;
        audiosReproducidos += 1;
        localStorage.setItem('mario-audios', String(audiosReproducidos));
        window.MarioHub?.track('audio_local', 'Pista local reproducida');
        if (audiosReproducidos >= 5) window.MarioHub?.track('audio_five', 'Cinco pistas reproducidas');
    } else {
        audio.pause();
    }
}

/* ==========================================================================
   2. CARGADOR DE ARCHIVOS PDF LOCALES Y DERECHOS DE AUTOR
   ========================================================================== */
function cargarPDF() {
    const fileInput = document.getElementById('pdfFileInput');
    const visor = document.getElementById('visorPdf');
    const placeholder = document.getElementById('pdfPlaceholder');
    const labelNombre = document.getElementById('nombreArchivoPdf');

    if (fileInput && fileInput.files && fileInput.files[0]) {
        const archivo = fileInput.files[0];
        const fileURL = URL.createObjectURL(archivo);

        if (visor) {
            visor.src = fileURL;
            visor.style.display = 'block';
        }
        if (placeholder) placeholder.style.display = 'none';
        if (labelNombre) labelNombre.textContent = archivo.name;
    } else {
        alert('Por favor, selecciona un archivo PDF de tu equipo primero.');
    }
}

/* ========================================================================
   MAPA Y TRADUCCIÓN DE NOMBRES DE PERSONAJES DESDE LA BASE DE DATOS
   ======================================================================== */
const avatarNames = {
    mario: 'Mario',
    luigi: 'Luigi',
    peach: 'Peach',
    bowser: 'Bowser',
    yoshi: 'Yoshi',
    toad: 'Toad'
};

function updateAvatarDisplayName(avatarKey) {
    const nameSpan = document.getElementById('current-avatar-name');
    if (nameSpan) {
        nameSpan.textContent = avatarNames[avatarKey] || 'Personalizado';
    }
}

/* ========================================================================
   CUENTA DEL JUGADOR, LOGROS Y SELECTOR MULTICLOUD
   ======================================================================== */
(function inicializarCuenta() {
    const state = { user: null, engine: localStorage.getItem('mario-engine') || 'local' };
    let achievementItems = [];
    let cloudSwitches = Number(localStorage.getItem('mario-cloud-switches') || 0);
    let highestGameScoreSubmitted = 0;
    const engineNames = {
        local: 'Local seguro', postgres: 'PostgreSQL / Neon', mysql: 'MySQL / Aiven',
        mongodb: 'MongoDB Atlas', firebase: 'Firebase Firestore',
        turso: 'SQLite Cloud / Turso', cassandra: 'Cassandra / Astra DB'
    };

    const $ = (selector) => document.querySelector(selector);
    const alertBox = $('#cuenta-alerta');
    const showMessage = (message, type = 'ok') => {
        if (!alertBox) return;
        alertBox.textContent = message;
        alertBox.className = `cuenta-alerta ${type}`;
        window.setTimeout(() => { alertBox.className = 'cuenta-alerta'; }, 5000);
    };
    const api = async (url, options = {}) => {
        const loading = $('#loading-screen');
        if (loading) loading.classList.remove('oculto');
        const started = performance.now();
        const sessionToken = localStorage.getItem('mario-session-token');
        const headers = {
            'Content-Type': 'application/json',
            'X-Database-Engine': state.engine,
            ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
            ...(options.headers || {})
        };
        try {
            const response = await fetch(url, { credentials: 'include', ...options, headers });
            const data = response.status === 204 ? null : await response.json();
            if (!response.ok) throw new Error(data && data.error ? data.error : 'No se pudo completar la operación.');
            logTerminal(`${state.engine.toUpperCase()}: ${options.method || 'GET'} ${url} [${Math.round(performance.now() - started)}ms]`);
            return data;
        } finally {
            if (loading) loading.classList.add('oculto');
        }
    };
    const formData = (form) => Object.fromEntries(new FormData(form).entries());
    const saveSession = (result) => {
        if (result?.sessionToken) localStorage.setItem('mario-session-token', result.sessionToken);
    };

    function notifyAchievement(achievement) {
        if (!achievement) return;
        const toast = $('#notificacion-logro');
        const text = $('#notificacion-texto');
        if (!toast || !text) return;
        text.textContent = achievement.achievementName;
        toast.classList.add('visible');
        try { document.getElementById('sonido-logro')?.play(); } catch (_) { /* autoplay bloqueado */ }
        window.setTimeout(() => toast.classList.remove('visible'), 5000);
    }

    function logTerminal(line) {
        const terminal = $('#terminal-lines');
        const inline = $('#terminal-inline');
        if (terminal) terminal.textContent = line;
        if (inline) inline.textContent = line;
    }

    async function track(event, label) {
        if (!state.user) return;
        try {
            const result = await api('/api/events', { method: 'POST', body: JSON.stringify({ event }) });
            recordActivityClient(label || event);
            if (result.achievement) {
                notifyAchievement(result.achievement);
                loadDashboard().catch(() => {});
            }
        } catch (_) { /* No bloquea navegación */ }
    }

    function recordActivityClient(label) {
        const list = $('#actividad-reciente');
        if (!list) return;
        const item = document.createElement('div');
        item.className = 'actividad-item';
        item.innerHTML = `<span>⭐</span><div><strong>${escapeHtml(label)}</strong><small>${new Date().toLocaleString('es-CO')}</small></div>`;
        list.prepend(item);
        while (list.children.length > 5) list.lastElementChild.remove();
    }

    function setAuthView(view) {
        document.querySelectorAll('.auth-form').forEach(form => form.classList.add('oculto'));
        const target = $(`#form-${view}`);
        if (target) target.classList.remove('oculto');
        document.querySelectorAll('.cuenta-tab').forEach(tab => tab.classList.toggle('activa', tab.dataset.authView === view));
    }

    function renderAchievements(items, stats) {
        const list = $('#lista-logros');
        if (!list) return;
        const unlocked = items.filter(item => item.unlocked).length;
        if ($('#progreso-logros')) $('#progreso-logros').textContent = `${Math.round((unlocked / (items.length || 1)) * 100)}%`;
        achievementItems = items;
        list.innerHTML = items.length ? items.map(item => {
            const percent = Math.min(100, Math.round((item.current / item.target) * 100));
            return `<div class="logro-item ${item.unlocked ? '' : 'locked'}"><span class="logro-icono">${item.icon}</span><div><strong>${escapeHtml(item.name)} ${item.unlocked ? '✓' : '🔒'}</strong><small>${escapeHtml(item.description)}</small><span class="logro-progreso"><span style="width:${percent}%"></span></span></div></div>`;
        }).join('') : '<p class="texto-ayuda">Juega, consigue puntos y desbloquea tu primer logro.</p>';
        if ($('#stat-puntajes')) $('#stat-puntajes').textContent = stats?.scores || 0;
        if ($('#stat-puntos')) $('#stat-puntos').textContent = Number(stats?.totalScore || 0).toLocaleString('es-CO');
        if ($('#stat-logros')) $('#stat-logros').textContent = `${unlocked}/${items.length}`;
        const level = Math.max(1, Math.floor(unlocked / 3) + 1);
        const xp = (unlocked % 3) * 100 / 3;
        if ($('#rango-jugador')) $('#rango-jugador').textContent = `Nivel ${level} - ${level >= 3 ? 'Mario Estelar' : level === 2 ? 'Héroe del Reino' : 'Hongo Novato'}`;
        if ($('#xp-label')) $('#xp-label').textContent = `${unlocked} / ${items.length} logros`;
        if ($('#xp-progress')) $('#xp-progress').style.width = `${unlocked === items.length ? 100 : xp}%`;
    }

    function renderLeaderboard(items) {
        const list = $('#tabla-leaderboard');
        if (!list) return;
        list.innerHTML = items.length ? items.map((item, index) => `
            <div class="fila-ranking"><span class="puesto-ranking">#${index + 1}</span><strong>${escapeHtml(item.username)}</strong><span class="puntos-ranking">${Number(item.score).toLocaleString('es-CO')} pts</span></div>
        `).join('') : '<p class="texto-ayuda">Aún no hay puntajes registrados.</p>';
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
    }

    async function loadDashboard() {
        const [achievements, leaderboard, profile] = await Promise.all([api('/api/achievements'), api('/api/leaderboard'), api('/api/profile')]);
        state.user = { ...state.user, ...profile.user };
        if ($('#nombre-jugador')) $('#nombre-jugador').textContent = profile.user.username;
        if ($('#correo-jugador')) $('#correo-jugador').textContent = profile.user.email;
        if ($('#perfil-nombre')) $('#perfil-nombre').textContent = profile.user.username;
        if ($('#perfil-correo')) $('#perfil-correo').textContent = profile.user.email;
        if ($('#jugador-mini-nombre')) $('#jugador-mini-nombre').textContent = profile.user.username;
        updateCloudBadge();
        renderAchievements(achievements.catalog || [], achievements.stats);
        renderLeaderboard(leaderboard.leaderboard || []);
        renderActivity(profile.activities || []);
        updateAvatar(profile.user.avatar || 'mario');
    }

    function renderActivity(items) {
        const list = $('#actividad-reciente');
        if (!list) return;
        list.innerHTML = items.length ? items.map(item => `<div class="actividad-item"><span>⭐</span><div><strong>${escapeHtml(item.label)}</strong><small>${new Date(item.createdAt).toLocaleString('es-CO')}</small></div></div>`).join('') : '<p class="texto-ayuda">Aún no hay actividad registrada.</p>';
    }

    function updateAvatar(avatar) {
        document.querySelectorAll('.avatar-mario, .mini-avatar').forEach(element => {
            element.textContent = avatar.startsWith('data:image/') ? '' : ({ mario: '🍄', luigi: '🟢', peach: '👸', bowser: '🐢', yoshi: '🦖', toad: '🍄' }[avatar] || '🍄');
            if (avatar.startsWith('data:image/')) element.style.background = `url("${avatar}") center/cover`;
        });
        document.querySelectorAll('[data-avatar]').forEach(button => button.classList.toggle('selected', button.dataset.avatar === avatar));

        // Traduce la clave guardada en BD al nombre visible en el perfil
        updateAvatarDisplayName(avatar);
    }

    function showPlayer(user) {
        state.user = user;
        $('#panel-auth')?.classList.add('oculto');
        $('#panel-jugador')?.classList.remove('oculto');
        if ($('#nombre-jugador')) $('#nombre-jugador').textContent = user.username;
        if ($('#correo-jugador')) $('#correo-jugador').textContent = user.email;
        if ($('#perfil-nombre')) $('#perfil-nombre').textContent = user.username;
        if ($('#perfil-correo')) $('#perfil-correo').textContent = user.email;
        if ($('#jugador-mini-nombre')) $('#jugador-mini-nombre').textContent = user.username;
        $('#jugador-mini')?.classList.remove('oculto');
        updateCloudBadge();
        loadDashboard().catch(error => showMessage(error.message, 'error'));
    }

    function updateCloudBadge() {
        const icons = { local: '💾', postgres: '🐘', mysql: '🐬', mongodb: '🍃', firebase: '🔥', turso: '📜', cassandra: '☁️' };
        const badge = `${icons[state.engine] || '💾'} ${engineNames[state.engine]}`;
        if ($('#jugador-mini-db')) $('#jugador-mini-db').textContent = badge;
        if ($('#perfil-cloud-icon')) $('#perfil-cloud-icon').textContent = icons[state.engine] || '💾';
        if ($('#perfil-cloud-name')) $('#perfil-cloud-name').textContent = engineNames[state.engine];
    }

    function unlockPortal(user) {
        state.user = user;
        document.body.classList.remove('app-bloqueada');
        $('#auth-gate')?.classList.add('oculto');
        showPlayer(user);
    }

    function gateView(view) {
        document.querySelectorAll('.gate-form').forEach(form => form.classList.add('oculto'));
        const target = $(`#gate-${view}-form`);
        if (target) target.classList.remove('oculto');
        document.querySelectorAll('.gate-tab').forEach(tab => tab.classList.toggle('activa', tab.dataset.gateView === view));
    }

    function gateMessage(message, type = '') {
        const messageBox = $('#gate-message');
        if (!messageBox) return;
        messageBox.textContent = message;
        messageBox.className = `gate-message ${type}`;
    }

    async function checkSession() {
        try {
            const result = await api('/api/auth/me');
            unlockPortal(result.user);
        } catch (_) {
            document.body.classList.add('app-bloqueada');
        }
    }

    $('#gate-login-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
            saveSession(result);
            unlockPortal(result.user);
            notifyAchievement(result.achievement);
        } catch (error) { gateMessage(error.message); }
    });
    $('#gate-register-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
            saveSession(result);
            localStorage.removeItem('mario-audios');
            localStorage.removeItem('mario-cloud-switches');
            unlockPortal(result.user);
            notifyAchievement(result.achievement);
        } catch (error) { gateMessage(error.message); }
    });
    $('#gate-forgot-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
            gateMessage('Si el correo existe, recibirás un código. Ingresa el código recibido.', 'ok');
            gateView('reset');
        } catch (error) { gateMessage(error.message); }
    });
    $('#gate-reset-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
            await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) });
            gateMessage('Contraseña actualizada. Ya puedes iniciar sesión.', 'ok');
            gateView('login');
        } catch (error) { gateMessage(error.message); }
    });
    document.querySelectorAll('[data-gate-view]').forEach(tab => tab.addEventListener('click', () => gateView(tab.dataset.gateView)));

    $('#form-login')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) }); saveSession(result); showPlayer(result.user); showMessage(`¡Bienvenido, ${result.user.username}!`); }
        catch (error) { showMessage(error.message, 'error'); }
    });
    $('#form-register')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) }); saveSession(result); showPlayer(result.user); notifyAchievement(result.achievement); showMessage('Cuenta creada. ¡Tu aventura comienza ahora!'); }
        catch (error) { showMessage(error.message, 'error'); }
    });
    $('#form-forgot')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) }); showMessage('Si el correo existe, recibirás un código. Completa el formulario de cambio de contraseña.'); setAuthView('reset'); }
        catch (error) { showMessage(error.message, 'error'); }
    });
    $('#form-reset')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify(formData(event.currentTarget)) }); showMessage('Contraseña actualizada. Ya puedes iniciar sesión.'); setAuthView('login'); }
        catch (error) { showMessage(error.message, 'error'); }
    });
    document.querySelectorAll('.cuenta-tab').forEach(tab => tab.addEventListener('click', () => setAuthView(tab.dataset.authView)));
    $('#btn-logout')?.addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' });
        state.user = null;
        localStorage.removeItem('mario-session-token');
        localStorage.removeItem('mario-audios');
        localStorage.removeItem('mario-cloud-switches');
        document.body.classList.add('app-bloqueada');
        $('#auth-gate')?.classList.remove('oculto');
        $('#panel-jugador')?.classList.add('oculto');
        $('#panel-auth')?.classList.remove('oculto');
        gateView('login');
        gateMessage('Sesión cerrada. ¡Vuelve pronto!', 'ok');
    });

    const cloudMenu = $('#cloud-menu');
    $('#jugador-mini')?.addEventListener('click', () => mostrarPestana('pestana-cuenta', document.querySelector('[onclick*="pestana-cuenta"]')));
    $('#btn-cloud')?.addEventListener('click', () => cloudMenu?.classList.toggle('oculto'));
    document.querySelectorAll('input[name="cloud-engine"]').forEach(input => {
        input.checked = input.value === state.engine;
        input.addEventListener('change', () => {
            state.engine = input.value;
            localStorage.setItem('mario-engine', state.engine);
            cloudSwitches += 1;
            localStorage.setItem('mario-cloud-switches', String(cloudSwitches));
            updateCloudBadge();
            track('cloud_switch', `Motor cambiado a ${engineNames[state.engine]}`);
            if ($('#motor-activo')) $('#motor-activo').textContent = engineNames[state.engine];
            if (state.user) loadDashboard().catch(error => showMessage(error.message, 'error'));
        });
    });
    if ($('#motor-activo')) $('#motor-activo').textContent = engineNames[state.engine];
    updateCloudBadge();
    $('#btn-cloud-status')?.addEventListener('click', async () => {
        const status = $('#cloud-status');
        if (!status) return;
        status.textContent = 'Consultando motores...';
        const started = performance.now();
        try {
            const result = await api('/api/cloud/status');
            const latency = Math.round(performance.now() - started);
            if ($('#perfil-cloud-latency')) $('#perfil-cloud-latency').textContent = `${latency} ms`;
            const active = result.engines[state.engine];
            if ($('#perfil-cloud-state')) $('#perfil-cloud-state').textContent = active?.online ? '🟢 Conectado y guardando' : '🟠 Configurado, sin respuesta';
            status.innerHTML = Object.entries(result.engines).map(([key, value]) => {
                const detail = value.error ? ` — ${escapeHtml(value.error)}` : '';
                const stateLabel = key !== state.engine ? '⚪ no comprobado' : (value.online ? '🟢 conectado' : `🟠 no responde${detail}`);
                return `${escapeHtml(value.name)}: ${value.configured ? stateLabel : '⚪ sin configurar'}`;
            }).join('<br>');
        } catch (error) { status.textContent = error.message; }
    });
    document.querySelectorAll('.achievement-filters button').forEach(button => button.addEventListener('click', () => {
        document.querySelectorAll('.achievement-filters button').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        const filter = button.dataset.filter;
        renderAchievements(filter === 'all' ? achievementItems : achievementItems.filter(item => item.category === filter), { scores: $('#stat-puntajes')?.textContent || 0, totalScore: $('#stat-puntos')?.textContent || 0 });
    }));

    // EVENTO REPARADO: Escuchador universal para actualizar avatar en la base de datos
    document.querySelectorAll('[data-avatar]').forEach(button => button.addEventListener('click', async () => {
        try {
            const avatarKey = button.dataset.avatar;
            updateAvatarDisplayName(avatarKey);
            const result = await api('/api/profile/avatar', { method: 'PUT', body: JSON.stringify({ avatar: avatarKey }) });
            updateAvatar(result.avatar);
            logTerminal(`[${state.engine.toUpperCase()}] AVATAR UPDATED: ${avatarKey}`);
        } catch (error) { showMessage(error.message, 'error'); }
    }));

    $('#avatar-upload')?.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                updateAvatarDisplayName('custom');
                const result = await api('/api/profile/avatar', { method: 'PUT', body: JSON.stringify({ avatar: reader.result }) });
                updateAvatar(result.avatar);
            } catch (error) { showMessage(error.message, 'error'); }
        };
        reader.readAsDataURL(file);
    });
    $('#btn-export-data')?.addEventListener('click', async () => {
        const data = { user: state.user, achievements: achievementItems, exportedAt: new Date().toISOString(), engine: state.engine };
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        link.download = 'mario-hub-perfil.json';
        link.click();
        await track('cloud_save', 'Datos del perfil exportados');
    });
    $('#terminal-toggle')?.addEventListener('click', () => $('#arcade-terminal')?.classList.toggle('collapsed'));
    document.querySelectorAll('.toggle-password').forEach(button => button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordTarget);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
    }));
    window.MarioHub = { track, notifyAchievement, logTerminal };
    window.addEventListener('message', event => {
        if (event.origin !== window.location.origin || event.data?.source !== 'mario-game') return;
        const type = event.data.type;
        const payload = event.data.payload || {};
        if (type === 'game_started') {
            highestGameScoreSubmitted = 0;
            track('game_start', 'Partida iniciada');
        }
        if (type === 'coin_collected') track('coin_collected', `Moneda recogida: ${payload.coins || 0}`);
        if (type === 'score_updated' && Number(payload.score) > highestGameScoreSubmitted) {
            const score = Number(payload.score);
            highestGameScoreSubmitted = score;
            api('/api/scores', {
                method: 'POST',
                body: JSON.stringify({ gameTitle: 'Infinite Mario', score })
            }).then(result => {
                logTerminal(`[${state.engine.toUpperCase()}] SCORE INSERT SUCCESS (${result.persistence || state.engine})`);
                if (result.achievement) notifyAchievement(result.achievement);
                loadDashboard().catch(() => {});
            }).catch(error => logTerminal(`SCORE WRITE ERROR: ${error.message}`));
        }
    });
    checkSession();
})();

/* ==========================================================================
   3. PIZARRA DE DIBUJO CON HTML5 CANVAS (FANART STUDIO)
   ========================================================================== */
window.addEventListener('load', () => {
    const canvas = document.getElementById('pizarra');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Ajusta el ancho dinámicamente según el contenedor
    canvas.width = canvas.parentElement.clientWidth - 50;

    let dibujando = false;
    let herramienta = 'pen';

    const colorPicker = document.getElementById('colorPicker');
    const sizePicker = document.getElementById('sizePicker');
    const toolPicker = document.getElementById('toolPicker');
    const clearBtn = document.getElementById('clearBtn');

    if (toolPicker) toolPicker.addEventListener('change', (e) => herramienta = e.target.value);
    if (clearBtn) clearBtn.addEventListener('click', () => ctx.clearRect(0, 0, canvas.width, canvas.height));

    function obtenerPosicion(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        dibujando = true;
        const pos = obtenerPosicion(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!dibujando) return;
        const pos = obtenerPosicion(e);

        ctx.lineWidth = sizePicker.value;
        ctx.lineCap = 'round';

        if (herramienta === 'pen') {
            ctx.strokeStyle = colorPicker.value;
        } else {
            ctx.strokeStyle = '#ffffff';
        }

        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    });

    canvas.addEventListener('mouseup', () => dibujando = false);
    canvas.addEventListener('mouseleave', () => dibujando = false);
});

/* ==========================================================================
   4. BLOQUEO DE DESPLAZAMIENTO (SCROLL) DE PANTALLA AL JUGAR
   ========================================================================== */
window.addEventListener('keydown', function(e) {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].indexOf(e.code) > -1) {
        e.preventDefault();
    }
}, false);

/* ==========================================================================
   5. FUNCIÓN DE PANTALLA COMPLETA PARA EL JUEGO
   ========================================================================== */
function pantallaCompleta() {
    const iframe = document.getElementById('marioIframe');
    if (!iframe) return;

    if (iframe.requestFullscreen) {
        iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) {
        iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
        iframe.msRequestFullscreen();
    }
}

/* ==========================================================================
   CONTROLADOR DEL BOTÓN FLOTANTE DE AUDIO DE FONDO
   ========================================================================== */
const videoFondo = document.getElementById('videoFondo');

function mutearVideoFondo() {
    if (!videoFondo) return;
    const btn = document.getElementById('btnMuteFlotante');
    videoFondo.muted = !videoFondo.muted;

    if (videoFondo.muted) {
        btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    } else {
        btn.innerHTML = '<i class="fas fa-volume-up"></i>';
    }
}

document.addEventListener('play', function(e) {
    if (e.target !== videoFondo && videoFondo) {
        videoFondo.muted = true;
        const btn = document.getElementById('btnMuteFlotante');
        if (btn) btn.innerHTML = '<i class="fas fa-volume-mute"></i>';
    }
}, true);

/* ==========================================================================
   FUNCIÓN PARA CAMBIAR DE PESTAÑA DINÁMICAMENTE
   ========================================================================== */
function mostrarPestana(idPestana, boton) {
    const pestanas = document.querySelectorAll('.contenido-tab');
    pestanas.forEach(p => p.classList.remove('activa'));

    const botones = document.querySelectorAll('.btn-tab');
    botones.forEach(b => b.classList.remove('activa'));

    const pestanaSeleccionada = document.getElementById(idPestana);
    if (pestanaSeleccionada) {
        pestanaSeleccionada.classList.add('activa');
    }

    if (boton) {
        boton.classList.add('activa');
    }

    if (idPestana === 'pestana-radar' && window.invalidateMarioMap) {
        window.invalidateMarioMap();
    }
    const events = { 'pestana-juego': 'game_start', 'pestana-radar': 'radar_open', 'pestana-clases': 'academy_open', 'pestana-recursos': 'tool_used' };
    if (events[idPestana]) window.MarioHub?.track(events[idPestana], `Módulo abierto: ${idPestana}`);
}

/* ==========================================================================
   LÓGICA DE LA PIZARRA Y CONTROLES
   ========================================================================== */
function seleccionarColor(color) {
    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) colorPicker.value = color;
}

function guardarDibujo() {
    const canvas = document.getElementById('pizarra');
    if (!canvas) return;
    const enlace = document.createElement('a');
    enlace.download = 'mi-fanart-mario.png';
    enlace.href = canvas.toDataURL();
    enlace.click();
}

/* ==========================================================================
   LÓGICA DEL EDITOR DE NIVELES Y DIBUJO DE FIGURAS
   ========================================================================== */
const canvas = document.getElementById('pizarra');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let dibujando = false;
    let startX = 0;
    let startY = 0;
    let snapshot;

    function iniciarDibujo(e) {
        dibujando = true;
        const rect = canvas.getBoundingClientRect();
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    function dibujar(e) {
        if (!dibujando) return;
        const rect = canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;

        const tool = document.getElementById('toolPicker').value;
        const color = document.getElementById('colorPicker').value;
        const size = document.getElementById('sizePicker').value;

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = size;
        ctx.lineCap = 'round';

        if (tool === 'pen' || tool === 'eraser') {
            ctx.strokeStyle = tool === 'eraser' ? '#0f111a' : color;
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
        } else {
            ctx.putImageData(snapshot, 0, 0);
            ctx.beginPath();
            if (tool === 'rect') {
                ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
            } else if (tool === 'circle') {
                const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
                ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (tool === 'line') {
                ctx.moveTo(startX, startY);
                ctx.lineTo(currentX, currentY);
                ctx.stroke();
            }
        }
    }

    function detenerDibujo() {
        dibujando = false;
        ctx.beginPath();
    }

    canvas.addEventListener('mousedown', iniciarDibujo);
    canvas.addEventListener('mousemove', dibujar);
    canvas.addEventListener('mouseup', detenerDibujo);

    document.getElementById('clearBtn')?.addEventListener('click', () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    });
}

function cambiarFondoLienzo(color) {
    const contenedor = document.querySelector('.contenedor-lienzo-pro');
    if (contenedor) contenedor.style.backgroundColor = color;
}

function cargarPDFDemo(url, nombre) {
    const visor = document.getElementById('visorPdf');
    const placeholder = document.getElementById('pdfPlaceholder');
    const labelNombre = document.getElementById('nombreArchivoPdf');

    if (visor && placeholder) {
        visor.src = url;
        visor.style.display = 'block';
        placeholder.style.display = 'none';
        if (labelNombre) labelNombre.textContent = nombre;
    }
}

function toggleRadio() {
    const audio = document.getElementById('audioEmisora');
    const icono = document.getElementById('iconoRadio');
    const ecualizador = document.getElementById('ecualizador');

    if (audio.paused) {
        audio.play();
        icono.className = 'fas fa-pause';
        ecualizador.classList.add('sonando');
    } else {
        audio.pause();
        icono.className = 'fas fa-play';
        ecualizador.classList.remove('sonando');
    }
}