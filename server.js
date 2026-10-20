const express = require('express');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { hashPassword, verifyPassword, createToken } = require('./server/security');
const { createAdapters } = require('./server/adapters');
const { createCloudRepository } = require('./server/cloud-store');

try {
    if (process.loadEnvFile) process.loadEnvFile(path.join(__dirname, '.env'));
} catch (error) {
    console.warn('No se pudo cargar .env:', error.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const adapters = createAdapters();
const repositories = new Map();
const cloudRecoveryEngines = new Set(['postgres', 'mysql', 'mongodb', 'turso']);

app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
    const origin = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Database-Engine, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
});

function cookieValue(req, name) {
    const cookies = String(req.headers.cookie || '').split(';');
    const value = cookies.find(item => item.trim().startsWith(`${name}=`));
    return value ? decodeURIComponent(value.trim().slice(name.length + 1)) : null;
}

function bearerToken(req) {
    const authorization = String(req.headers.authorization || '');
    return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : null;
}

async function repository(req) {
    const engine = String(req.headers['x-database-engine'] || 'local');
    if (engine === 'redis') throw new Error('Redis está temporalmente deshabilitado hasta renovar sus credenciales de Upstash.');
    if (!repositories.has(engine)) repositories.set(engine, createCloudRepository(engine));
    return repositories.get(engine);
}

async function recoveryRepository(req) {
    const requested = String(req.headers['x-database-engine'] || 'postgres');
    if (!cloudRecoveryEngines.has(requested)) {
        throw new Error('La recuperación de contraseña requiere PostgreSQL, MySQL, MongoDB o Turso.');
    }
    return repository({ ...req, headers: { ...req.headers, 'x-database-engine': requested } });
}

async function sessionUser(req) {
    const token = bearerToken(req) || cookieValue(req, 'mario_session');
    if (!token) return null;
    return (await repository(req)).findSession(token);
}

async function requireAuth(req, res, next) {
    const session = await sessionUser(req);
    if (!session) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.user = await (await repository(req)).findUser(session.userId);
    if (!req.user) return res.status(401).json({ error: 'Sesión inválida.' });
    next();
}

async function award(req, userId, name, description) {
    const repo = await repository(req);
    const achievements = await repo.achievements(userId);
    if (achievements.some(item => item.achievementName === name)) return null;
    const achievement = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userId, achievementName: name, description, unlockedAt: new Date().toISOString()
    };
    await repo.insertAchievement(achievement);
    return achievement;
}

const achievementCatalog = [
    { id: 'welcome', category: 'cloud', name: '¡Bienvenido al Reino!', description: 'Inicia sesión en el Gaming Hub.', icon: '🍄' },
    { id: 'first-score', category: 'games', name: 'Primer Paso', description: 'Registra tu primer puntaje en un juego.', icon: '🪙' },
    { id: 'record', category: 'games', name: 'Super Champiñón', description: 'Supera los 1.000 puntos en una partida.', icon: '🏆' },
    { id: 'collector', category: 'games', name: 'Coleccionista de Monedas', description: 'Registra cinco puntajes en el Hub.', icon: '⭐' },
    { id: 'champion', category: 'games', name: 'Campeón del Reino', description: 'Alcanza 5.000 puntos acumulados.', icon: '👑' },
    { id: 'cineasta', category: 'videos', name: 'Cineasta de Mario', description: 'Mira un video local.', icon: '🎬' },
    { id: 'maraton', category: 'videos', name: 'Maratón Retro', description: 'Mira cinco videos o reproduce contenido de YouTube.', icon: '📽️' },
    { id: 'melomano', category: 'music', name: 'Melómano del Reino', description: 'Escucha una pista local.', icon: '🎵' },
    { id: 'dj-koopa', category: 'music', name: 'DJ Koopa', description: 'Escucha cinco pistas locales.', icon: '🎧' },
    { id: 'explorer', category: 'radar', name: 'Explorador del Radar', description: 'Abre y usa el radar.', icon: '🗺️' },
    { id: 'student', category: 'academy', name: 'Estudiante Estrella', description: 'Visita la Academia.', icon: '🎓' },
    { id: 'technician', category: 'tools', name: 'Técnico SENA', description: 'Usa una herramienta del Hub.', icon: '🛠️' },
    { id: 'multicloud', category: 'cloud', name: 'Viajero Multicloud', description: 'Cambia de motor de datos tres veces.', icon: '☁️' },
    { id: 'cloud-master', category: 'cloud', name: 'Maestro Cloud', description: 'Guarda datos en los siete motores.', icon: '🌐' }
];

async function recordActivity(req, userId, type, label, metadata = {}) {
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, userId, type, label, metadata, createdAt: new Date().toISOString() };
    await (await repository(req)).insertActivity(item);
    return item;
}

function achievementById(id) {
    return achievementCatalog.find(item => item.id === id);
}

app.get('/api/health', (req, res) => res.json({
    ok: true,
    activeEngine: req.headers['x-database-engine'] || 'local',
    engines: Object.fromEntries(Object.entries(adapters).map(([key, adapter]) => [
        key, { name: adapter.name, configured: adapter.configured }
    ]))
}));

app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (username.length < 3 || !email.includes('@') || password.length < 8) {
        return res.status(400).json({ error: 'Usuario, correo o contraseña no válidos.' });
    }
    const repo = await repository(req);
    if (await repo.findUser(email) || await repo.findUser(username)) {
        return res.status(409).json({ error: 'El usuario o correo ya existe.' });
    }
    const user = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        username, email, passwordHash: hashPassword(password), avatar: 'mario', createdAt: new Date().toISOString()
    };
    await repo.insertUser(user);
    const token = createToken();
    await repo.insertSession({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    const achievement = await award(req, user.id, '¡Bienvenido al Reino!', 'Inicia sesión en el Gaming Hub.');
    await recordActivity(req, user.id, 'cloud', 'Cuenta creada');
    res.setHeader('Set-Cookie', `mario_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
    res.status(201).json({ user: { id: user.id, username, email }, achievement, sessionToken: token });
});

app.post('/api/auth/login', async (req, res) => {
    const identity = String(req.body.identity || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await (await repository(req)).findUser(identity);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    const token = createToken();
    await (await repository(req)).insertSession({ token, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 });
    const achievement = await award(req, user.id, '¡Bienvenido al Reino!', 'Inicia sesión en el Gaming Hub.');
    await recordActivity(req, user.id, 'cloud', 'Inicio de sesión');
    res.setHeader('Set-Cookie', `mario_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`);
    res.json({ user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar || 'mario' }, achievement, sessionToken: token });
});

app.post('/api/auth/logout', async (req, res) => {
    const token = cookieValue(req, 'mario_session');
    if (token) await (await repository(req)).deleteSession(token);
    res.setHeader('Set-Cookie', 'mario_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.sendStatus(204);
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email, avatar: req.user.avatar || 'mario' } });
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const repo = await recoveryRepository(req);
    const user = await repo.findUser(email);
    if (!user) return res.json({ message: 'Si el correo existe, recibirás un código.' });
    const code = String(crypto.randomInt(100000, 1000000));
    await repo.insertResetCode({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        userId: user.id,
        code,
        expiresAt: Date.now() + 15 * 60 * 1000
    });
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = nodemailer.createTransport({
            service: process.env.EMAIL_SERVICE || 'gmail',
            auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        await transporter.sendMail({
            from: process.env.EMAIL_USER, to: user.email,
            subject: 'Código de recuperación - Mario Hub',
            text: `Tu código de recuperación es: ${code}. Expira en 15 minutos.`,
            html: `
                <div style="margin:0;background:#071b4d;padding:32px 16px;font-family:Arial,sans-serif;color:#17213c">
                    <div style="max-width:560px;margin:auto;background:#fff;border:5px solid #e52521;border-radius:18px;overflow:hidden">
                        <div style="background:#e52521;color:#fff;padding:22px;text-align:center">
                            <div style="font-size:42px">🍄 ⭐ 🪙</div>
                            <h1 style="margin:8px 0 0;font-size:24px">Mario Gaming Hub</h1>
                        </div>
                        <div style="padding:28px;text-align:center">
                            <h2 style="color:#0020c2;margin-top:0">¡Código de rescate!</h2>
                            <p>Usa este código para recuperar tu acceso al Reino Champiñón:</p>
                            <div style="display:inline-block;background:#fbd000;border:3px solid #17213c;border-radius:12px;padding:14px 24px;font-size:32px;font-weight:700;letter-spacing:8px">${code}</div>
                            <p style="color:#666">Este código expira en 15 minutos. Si no solicitaste este cambio, ignora este mensaje.</p>
                        </div>
                    </div>
                </div>`
        });
    } else {
        console.warn(`EMAIL_USER/EMAIL_PASS no configurados; código de desarrollo: ${code}`);
    }
    res.json({ message: 'Si el correo existe, recibirás un código.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');
    const repo = await recoveryRepository(req);
    const user = await repo.findUser(email);
    const reset = user && await repo.findResetCode(user.id, code);
    if (!reset || password.length < 8) return res.status(400).json({ error: 'Código o contraseña no válidos.' });
    user.passwordHash = hashPassword(password);
    await repo.updateUser(user);
    await repo.deleteResetCode(reset.id);
    res.json({ message: 'Contraseña actualizada.' });
});

app.post('/api/scores', requireAuth, async (req, res) => {
    const score = Number(req.body.score);
    const gameTitle = String(req.body.gameTitle || '').trim();
    if (!gameTitle || !Number.isFinite(score) || score < 0) return res.status(400).json({ error: 'Puntaje inválido.' });
    const repo = await repository(req);
    const existing = await repo.scores(req.user.id);
    const item = await repo.insertScore({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, userId: req.user.id, gameTitle, score, timestamp: new Date().toISOString() });
    await recordActivity(req, req.user.id, 'games', `Puntaje guardado: ${gameTitle}`);
    const firstScore = existing.length === 0 ? await award(req, req.user.id, 'Primer Paso', 'Registra tu primer puntaje en un juego.') : null;
    const record = score >= 1000 ? await award(req, req.user.id, 'Super Champiñón', 'Supera los 1.000 puntos en una partida.') : null;
    res.status(201).json({ score: item, achievement: record || firstScore, persistence: req.headers['x-database-engine'] || 'local' });
});

app.get('/api/scores', requireAuth, async (req, res) => {
    const scores = await (await repository(req)).scores(req.user.id);
    res.json({ scores });
});

app.get('/api/leaderboard', async (req, res) => {
    const scores = await (await repository(req)).leaderboard();
    res.json({ leaderboard: scores });
});

app.get('/api/achievements', requireAuth, async (req, res) => {
    const repo = await repository(req);
    const unlocked = await repo.achievements(req.user.id);
    const scores = await repo.scores(req.user.id);
    const totalScore = scores.reduce((sum, item) => sum + Number(item.score || 0), 0);
    const unlockedNames = new Set(unlocked.map(item => item.achievementName));
    const progress = achievementCatalog.map(item => {
        const isUnlocked = unlockedNames.has(item.name);
        let current = isUnlocked ? 1 : 0;
        let target = 1;
        if (item.id === 'first-score') { current = Math.min(scores.length, 1); target = 1; }
        if (item.id === 'record') { current = scores.some(item => Number(item.score) >= 1000) ? 1 : 0; target = 1; }
        if (item.id === 'collector') { current = Math.min(scores.length, 5); target = 5; }
        if (item.id === 'champion') { current = Math.min(totalScore, 5000); target = 5000; }
        return {
            ...item,
            unlocked: isUnlocked,
            current,
            target,
            unlockedAt: unlocked.find(entry => entry.achievementName === item.name)?.unlockedAt || null
        };
    });

    res.json({ achievements: unlocked, catalog: progress, stats: { scores: scores.length, totalScore, unlocked: progress.filter(item => item.unlocked).length, total: progress.length } });
});

app.get('/api/profile', requireAuth, async (req, res) => {
    const activities = await (await repository(req)).activity(req.user.id);
    res.json({ user: { id: req.user.id, username: req.user.username, email: req.user.email, avatar: req.user.avatar || 'mario' }, activities });
});

app.put('/api/profile/avatar', requireAuth, async (req, res) => {
    const avatar = String(req.body.avatar || '').trim();
    if (!/^(mario|luigi|peach|bowser|yoshi|toad)$/.test(avatar) && !avatar.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Avatar no válido.' });
    }
    if (avatar.startsWith('data:image/') && avatar.length > 700000) return res.status(413).json({ error: 'La imagen es demasiado grande.' });
    req.user.avatar = avatar;
    await (await repository(req)).updateUser(req.user);
    await recordActivity(req, req.user.id, 'cloud', 'Avatar actualizado');
    res.json({ avatar });
});

app.get('/api/activity', requireAuth, async (req, res) => {
    res.json({ activities: await (await repository(req)).activity(req.user.id) });
});

app.post('/api/events', requireAuth, async (req, res) => {
    const event = String(req.body.event || '').trim();
    const engine = String(req.headers['x-database-engine'] || 'local');
    const mapping = {
        game_start: 'first-score', coin_collected: 'collector', video_local: 'cineasta',
        video_youtube: 'maraton', audio_local: 'melomano', audio_five: 'dj-koopa',
        radar_open: 'explorer', academy_open: 'student', tool_used: 'technician',
        cloud_switch: 'multicloud', cloud_save: 'cloud-master'
    };
    await recordActivity(req, req.user.id, event.startsWith('cloud') ? 'cloud' : event.split('_')[0], event, { engine });
    const userActivity = await (await repository(req)).activity(req.user.id);
    const count = (name) => userActivity.filter(item => item.label === name).length;
    let achievementId = mapping[event];
    if (event === 'coin_collected' && count('coin_collected') < 5) achievementId = null;
    if (event === 'audio_five' && count('audio_local') < 5) achievementId = null;
    if (event === 'video_youtube' && count('video_youtube') < 1) achievementId = null;
    if (event === 'cloud_switch' && count('cloud_switch') < 3) achievementId = null;
    if (event === 'cloud_save') {
        const engines = new Set(userActivity.filter(item => item.label === 'cloud_save').map(item => item.metadata?.engine));
        if (engines.size < 7) achievementId = null;
    }
    const catalogItem = achievementById(achievementId);
    const achievement = catalogItem ? await award(req, req.user.id, catalogItem.name, catalogItem.description) : null;
    res.status(201).json({ achievement, recorded: true });
});

app.get('/api/cloud/status', async (req, res) => {
    const result = {};
    for (const [key, adapter] of Object.entries(adapters)) {
        result[key] = { name: adapter.name, configured: adapter.configured, online: false };
        if (adapter.configured && req.headers['x-database-engine'] === key) {
            try { result[key].online = await adapter.ping(); } catch (error) { result[key].error = error.message; }
        }
    }
    res.json({ engines: result });
});

app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint API no encontrado.' });
});

app.use((error, req, res, next) => {
    console.error('Error de API:', error);
    if (res.headersSent) return next(error);
    if (req.path.startsWith('/api')) {
        return res.status(error.statusCode || 500).json({ error: 'Error interno del servidor.' });
    }
    res.status(error.statusCode || 500).send('Error interno del servidor.');
});

// Servir archivos estáticos de la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`🎮 Servidor corriendo en http://localhost:${PORT}`);
});