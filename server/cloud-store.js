const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { Redis } = require('@upstash/redis');
const { createClient: createTursoClient } = require('@libsql/client');
const JsonStore = require('./json-store');

const schema = `
CREATE TABLE IF NOT EXISTS mario_users (id TEXT PRIMARY KEY, username TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, avatar TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mario_sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS mario_scores (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, game_title TEXT NOT NULL, score REAL NOT NULL, timestamp TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mario_achievements (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, achievement_name TEXT NOT NULL, description TEXT NOT NULL, unlocked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mario_activity (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, label TEXT NOT NULL, metadata TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mario_reset_codes (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, code TEXT NOT NULL, expires_at BIGINT NOT NULL);
`;

function id() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function json(value) { return JSON.stringify(value || {}); }
function parse(value, fallback) { try { return value == null ? fallback : JSON.parse(value); } catch (_) { return fallback; } }

async function createSqlRepository(engine) {
    const isMySql = engine === 'mysql';
    const db = isMySql
        ? await mysql.createConnection(process.env.MYSQL_URL)
        : new Pool({ connectionString: process.env.POSTGRES_URL, max: 3 });
    const query = async (sql, params = []) => {
        if (isMySql) { const [rows] = await db.execute(sql.replace(/\$(\d+)/g, '?'), params); return rows; }
        return (await db.query(sql, params)).rows;
    };
    const tableSchema = schema
        .replace(/TEXT PRIMARY KEY/g, isMySql ? 'VARCHAR(191) PRIMARY KEY' : 'TEXT PRIMARY KEY')
        .replace(/email TEXT NOT NULL UNIQUE/g, isMySql ? 'email VARCHAR(191) NOT NULL UNIQUE' : 'email TEXT NOT NULL UNIQUE');
    for (const statement of tableSchema.split(';').map(item => item.trim()).filter(Boolean)) await query(statement);
    if (isMySql) {
        try { await query('ALTER TABLE mario_users MODIFY email VARCHAR(191) NOT NULL'); } catch (_) { /* Already migrated. */ }
    }
    if (!isMySql) {
        try { await query('ALTER TABLE mario_sessions ALTER COLUMN expires_at TYPE BIGINT'); } catch (_) { /* Already migrated or provider does not require it. */ }
    }
    const close = async () => isMySql ? db.end() : db.end();
    return {
        async findUser(identity) {
            const sql = isMySql
                ? 'SELECT * FROM mario_users WHERE id=? OR LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?) LIMIT 1'
                : 'SELECT * FROM mario_users WHERE id=$1 OR LOWER(email)=LOWER($1) OR LOWER(username)=LOWER($1) LIMIT 1';
            const rows = await query(sql, isMySql ? [identity, identity, identity] : [identity]);
            return rows[0] && mapUser(rows[0]);
        },
        async insertUser(user) { await query('INSERT INTO mario_users (id,username,email,password_hash,avatar,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [user.id,user.username,user.email,user.passwordHash,user.avatar,user.createdAt]); return user; },
        async updateUser(user) { await query('UPDATE mario_users SET avatar=$1,password_hash=$2 WHERE id=$3', [user.avatar,user.passwordHash,user.id]); return user; },
        async insertSession(item) { await query('INSERT INTO mario_sessions (token,user_id,expires_at) VALUES ($1,$2,$3)', [item.token,item.userId,item.expiresAt]); return item; },
        async findSession(token) { const rows = await query('SELECT * FROM mario_sessions WHERE token=$1 AND expires_at>$2 LIMIT 1', [token,Date.now()]); return rows[0] && { token: rows[0].token, userId: rows[0].user_id, expiresAt: Number(rows[0].expires_at) }; },
        async deleteSession(token) { await query('DELETE FROM mario_sessions WHERE token=$1', [token]); },
        async insertResetCode(item) { await query('INSERT INTO mario_reset_codes (id,user_id,code,expires_at) VALUES ($1,$2,$3,$4)', [item.id,item.userId,item.code,item.expiresAt]); return item; },
        async findResetCode(userId, code) { const rows = await query('SELECT * FROM mario_reset_codes WHERE user_id=$1 AND code=$2 AND expires_at>$3 LIMIT 1', [userId, code, Date.now()]); return rows[0] && { id: rows[0].id, userId: rows[0].user_id, code: rows[0].code, expiresAt: Number(rows[0].expires_at) }; },
        async deleteResetCode(id) { await query('DELETE FROM mario_reset_codes WHERE id=$1', [id]); },
        async insertScore(item) { await query('INSERT INTO mario_scores (id,user_id,game_title,score,timestamp) VALUES ($1,$2,$3,$4,$5)', [item.id,item.userId,item.gameTitle,item.score,item.timestamp]); return item; },
        async scores(userId) { const rows = await query('SELECT * FROM mario_scores WHERE user_id=$1 ORDER BY timestamp DESC', [userId]); return rows.map(mapScore); },
        async leaderboard() { const rows = await query('SELECT s.*,u.username FROM mario_scores s JOIN mario_users u ON u.id=s.user_id ORDER BY s.score DESC LIMIT 20'); return rows.map(row => ({...mapScore(row), username: row.username})); },
        async insertAchievement(item) { await query('INSERT INTO mario_achievements (id,user_id,achievement_name,description,unlocked_at) VALUES ($1,$2,$3,$4,$5)', [item.id,item.userId,item.achievementName,item.description,item.unlockedAt]); return item; },
        async achievements(userId) { const rows = await query('SELECT * FROM mario_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC', [userId]); return rows.map(mapAchievement); },
        async insertActivity(item) { await query('INSERT INTO mario_activity (id,user_id,type,label,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6)', [item.id,item.userId,item.type,item.label,json(item.metadata),item.createdAt]); return item; },
        async activity(userId) { const rows = await query('SELECT * FROM mario_activity WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [userId]); return rows.map(row => ({id:row.id,userId:row.user_id,type:row.type,label:row.label,metadata:parse(row.metadata,{}),createdAt:row.created_at})); },
        close
    };
}

function mapUser(row) { return { id: row.id, username: row.username, email: row.email, passwordHash: row.password_hash, avatar: row.avatar || 'mario', createdAt: row.created_at }; }
function mapScore(row) { return { id: row.id, userId: row.user_id, gameTitle: row.game_title, score: Number(row.score), timestamp: row.timestamp }; }
function mapAchievement(row) { return { id: row.id, userId: row.user_id, achievementName: row.achievement_name, description: row.description, unlockedAt: row.unlocked_at }; }

async function createDocumentRepository(engine) {
    if (engine === 'mongodb') {
        const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 7000 });
        await client.connect();
        const db = client.db();
        return {
            async findUser(identity) { const row = await db.collection('mario_users').findOne({ $or: [{id: identity}, {email: new RegExp(`^${escape(identity)}$`, 'i')}, {username: new RegExp(`^${escape(identity)}$`, 'i')}] }); return row && mapUser(row); },
            async insertUser(item) { await db.collection('mario_users').insertOne(item); return item; },
            async updateUser(item) { await db.collection('mario_users').replaceOne({id:item.id}, item); return item; },
            async insertSession(item) { await db.collection('mario_sessions').insertOne(item); return item; },
            async findSession(token) { return db.collection('mario_sessions').findOne({token, expiresAt:{$gt:Date.now()}},{projection:{_id:0}}); },
            async deleteSession(token) { await db.collection('mario_sessions').deleteOne({token}); },
            async insertResetCode(item) { await db.collection('mario_reset_codes').insertOne(item); return item; },
            async findResetCode(userId, code) { return db.collection('mario_reset_codes').findOne({userId, code, expiresAt:{$gt:Date.now()}},{projection:{_id:0}}); },
            async deleteResetCode(id) { await db.collection('mario_reset_codes').deleteOne({id}); },
            async insertScore(item) { await db.collection('mario_scores').insertOne(item); return item; },
            async scores(userId) { return db.collection('mario_scores').find({userId},{projection:{_id:0}}).sort({timestamp:-1}).toArray(); },
            async leaderboard() { return db.collection('mario_scores').aggregate([{$sort:{score:-1}},{$limit:20},{$lookup:{from:'mario_users',localField:'userId',foreignField:'id',as:'user'}},{$unwind:'$user'},{$project:{_id:0,username:'$user.username',id:1,userId:1,gameTitle:1,score:1,timestamp:1}}]).toArray(); },
            async insertAchievement(item) { await db.collection('mario_achievements').insertOne(item); return item; },
            async achievements(userId) { return db.collection('mario_achievements').find({userId},{projection:{_id:0}}).sort({unlockedAt:-1}).toArray(); },
            async insertActivity(item) { await db.collection('mario_activity').insertOne(item); return item; },
            async activity(userId) { return db.collection('mario_activity').find({userId},{projection:{_id:0}}).sort({createdAt:-1}).limit(30).toArray(); },
            async close() { await client.close(); }
        };
    }
    const client = new Redis({url:process.env.UPSTASH_REDIS_REST_URL, token:process.env.UPSTASH_REDIS_REST_TOKEN});
    const key = name => `mario:${engine}:${name}`;
    const list = async name => parse(await client.get(key(name)), []);
    const save = async (name, value) => { await client.set(key(name), JSON.stringify(value)); return value; };
    const repo = {
        async findUser(identity) { return (await list('users')).find(item => item.id === identity || item.email.toLowerCase() === identity || item.username.toLowerCase() === identity); },
        async insertUser(item) { const all=await list('users'); all.push(item); await save('users',all); return item; },
        async updateUser(item) { const all=await list('users'); await save('users',all.map(x=>x.id===item.id?item:x)); return item; },
        async insertSession(item) { const all=await list('sessions'); all.push(item); await save('sessions',all); return item; },
        async findSession(token) { return (await list('sessions')).find(x=>x.token===token&&x.expiresAt>Date.now()); },
        async deleteSession(token) { await save('sessions',(await list('sessions')).filter(x=>x.token!==token)); },
        async insertResetCode(item) { const all=await list('resetCodes'); all.push(item); await save('resetCodes',all); return item; },
        async findResetCode(userId, code) { return (await list('resetCodes')).find(x=>x.userId===userId&&x.code===code&&x.expiresAt>Date.now()); },
        async deleteResetCode(id) { await save('resetCodes',(await list('resetCodes')).filter(x=>x.id!==id)); },
        async insertScore(item) { const all=await list('scores'); all.push(item); await save('scores',all); return item; },
        async scores(userId) { return (await list('scores')).filter(x=>x.userId===userId).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)); },
        async leaderboard() { const users=await list('users'); const byId=Object.fromEntries(users.map(x=>[x.id,x.username])); return (await list('scores')).sort((a,b)=>b.score-a.score).slice(0,20).map(x=>({...x,username:byId[x.userId]||'Jugador'})); },
        async insertAchievement(item) { const all=await list('achievements'); all.push(item); await save('achievements',all); return item; },
        async achievements(userId) { return (await list('achievements')).filter(x=>x.userId===userId); },
        async insertActivity(item) { const all=await list('activity'); all.push(item); await save('activity',all); return item; },
        async activity(userId) { return (await list('activity')).filter(x=>x.userId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30); },
        async close() {}
    };
    return repo;
}
function escape(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

async function createCloudRepository(engine) {
    if (engine === 'postgres' || engine === 'mysql' || engine === 'turso') {
        if (engine === 'turso') {
            const client = createTursoClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
            for (const statement of schema.split(';').map(item => item.trim()).filter(Boolean)) await client.execute(statement);
            return createSqlRepositoryFromTurso(client);
        }
        return createSqlRepository(engine);
    }
    if (engine === 'mongodb') return createDocumentRepository(engine);
    if (engine === 'redis') throw new Error('Redis está temporalmente deshabilitado hasta renovar sus credenciales de Upstash.');
    if (engine === 'local') return localRepository();
    throw new Error(`El motor ${engine} aún no tiene adaptador CRUD disponible.`);
}

async function createSqlRepositoryFromTurso(db) {
    const query = async (sql, params=[]) => (await db.execute({sql,args:params})).rows;
    return {
        async findUser(i){const r=await query('SELECT * FROM mario_users WHERE id=? OR LOWER(email)=LOWER(?) OR LOWER(username)=LOWER(?) LIMIT 1',[i,i,i]);return r[0]&&mapUser(r[0]);},
        async insertUser(u){await query('INSERT INTO mario_users VALUES (?,?,?,?,?,?)',[u.id,u.username,u.email,u.passwordHash,u.avatar,u.createdAt]);return u;},
        async updateUser(u){await query('UPDATE mario_users SET avatar=?,password_hash=? WHERE id=?',[u.avatar,u.passwordHash,u.id]);return u;},
        async insertSession(x){await query('INSERT INTO mario_sessions VALUES (?,?,?)',[x.token,x.userId,x.expiresAt]);return x;},
        async findSession(t){const r=await query('SELECT * FROM mario_sessions WHERE token=? AND expires_at>? LIMIT 1',[t,Date.now()]);return r[0]&&{token:r[0].token,userId:r[0].user_id,expiresAt:Number(r[0].expires_at)};},
        async deleteSession(t){await query('DELETE FROM mario_sessions WHERE token=?',[t]);},
        async insertResetCode(x){await query('INSERT INTO mario_reset_codes VALUES (?,?,?,?)',[x.id,x.userId,x.code,x.expiresAt]);return x;},
        async findResetCode(u,c){const r=await query('SELECT * FROM mario_reset_codes WHERE user_id=? AND code=? AND expires_at>? LIMIT 1',[u,c,Date.now()]);return r[0]&&{id:r[0].id,userId:r[0].user_id,code:r[0].code,expiresAt:Number(r[0].expires_at)};},
        async deleteResetCode(i){await query('DELETE FROM mario_reset_codes WHERE id=?',[i]);},
        async insertScore(x){await query('INSERT INTO mario_scores VALUES (?,?,?,?,?)',[x.id,x.userId,x.gameTitle,x.score,x.timestamp]);return x;},
        async scores(u){return (await query('SELECT * FROM mario_scores WHERE user_id=? ORDER BY timestamp DESC',[u])).map(mapScore);},
        async leaderboard(){return (await query('SELECT s.*,u.username FROM mario_scores s JOIN mario_users u ON u.id=s.user_id ORDER BY s.score DESC LIMIT 20')).map(x=>({...mapScore(x),username:x.username}));},
        async insertAchievement(x){await query('INSERT INTO mario_achievements VALUES (?,?,?,?,?)',[x.id,x.userId,x.achievementName,x.description,x.unlockedAt]);return x;},
        async achievements(u){return (await query('SELECT * FROM mario_achievements WHERE user_id=? ORDER BY unlocked_at DESC',[u])).map(mapAchievement);},
        async insertActivity(x){await query('INSERT INTO mario_activity VALUES (?,?,?,?,?,?)',[x.id,x.userId,x.type,x.label,json(x.metadata),x.createdAt]);return x;},
        async activity(u){return (await query('SELECT * FROM mario_activity WHERE user_id=? ORDER BY created_at DESC LIMIT 30',[u])).map(x=>({id:x.id,userId:x.user_id,type:x.type,label:x.label,metadata:parse(x.metadata,{}),createdAt:x.created_at}));},
        async close(){}
    };
}
function localRepository() {
    const store = new JsonStore();
    return {
        findUser: async i => store.collection('users').find(x=>x.id===i||x.email===i||x.username.toLowerCase()===i),
        insertUser: async x => store.insert('users',x), updateUser: async x => { store.save(); return x; },
        insertSession: async x => store.insert('sessions',x), findSession: async t => store.collection('sessions').find(x=>x.token===t&&x.expiresAt>Date.now()), deleteSession: async t => {store.data.sessions=store.collection('sessions').filter(x=>x.token!==t);store.save();},
        insertResetCode: async x => store.insert('resetCodes',x), findResetCode: async (u,c) => store.collection('resetCodes').find(x=>x.userId===u&&x.code===c&&x.expiresAt>Date.now()), deleteResetCode: async i => {store.data.resetCodes=store.collection('resetCodes').filter(x=>x.id!==i);store.save();},
        insertScore: async x => store.insert('scores',x), scores: async u => store.collection('scores').filter(x=>x.userId===u), leaderboard: async ()=>store.collection('scores'),
        insertAchievement: async x=>store.insert('achievements',x), achievements: async u=>store.collection('achievements').filter(x=>x.userId===u),
        insertActivity: async x=>store.insert('activity',x), activity: async u=>store.collection('activity').filter(x=>x.userId===u), close: async()=>{}
    };
}
module.exports = { createCloudRepository };
