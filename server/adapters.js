const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const { Redis } = require('@upstash/redis');
const { createClient: createTursoClient } = require('@libsql/client');
const dns = require('dns').promises;

const ENGINE_ENV = {
    postgres: 'POSTGRES_URL',
    mysql: 'MYSQL_URL',
    mongodb: 'MONGO_URI',
    redis: 'UPSTASH_REDIS_REST_URL',
    turso: 'TURSO_DATABASE_URL',
    cassandra: 'ASTRA_DB_TOKEN'
};

function configured(name) {
    return Boolean(process.env[ENGINE_ENV[name]]);
}

function createAdapters() {
    const adapters = {};

    // ==================== 1. POSTGRESQL / NEON ====================
    adapters.postgres = {
        name: 'PostgreSQL / Neon',
        configured: configured('postgres'),
        async ping() {
            const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1 });
            const result = await pool.query('SELECT 1 AS ok');
            await pool.end();
            return result.rows[0].ok === 1;
        },
        async saveUser(user) {
            const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1 });
            try {
                await pool.query(`
                    CREATE TABLE IF NOT EXISTS mario_users (
                        id VARCHAR(100) PRIMARY KEY,
                        username VARCHAR(100) UNIQUE NOT NULL,
                        email VARCHAR(150) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        avatar VARCHAR(50) DEFAULT 'mario',
                        created_at VARCHAR(100) DEFAULT CURRENT_TIMESTAMP
                    );
                `);
                await pool.query(
                    `INSERT INTO mario_users (id, username, email, password_hash, avatar, created_at)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash;`,
                    [
                        user.id || String(Date.now()),
                        user.username,
                        user.email,
                        user.passwordHash || user.password,
                        user.avatar || 'mario',
                        user.createdAt || new Date().toISOString()
                    ]
                );
            } finally {
                await pool.end();
            }
        }
    };

    // ==================== 2. MYSQL / AIVEN ====================
    adapters.mysql = {
        name: 'MySQL / Aiven',
        configured: configured('mysql'),
        async ping() {
            const connection = await mysql.createConnection(process.env.MYSQL_URL);
            await connection.query('SELECT 1 AS ok');
            await connection.end();
            return true;
        },
        async saveUser(user) {
            const connection = await mysql.createConnection(process.env.MYSQL_URL);
            try {
                await connection.query(`
                    CREATE TABLE IF NOT EXISTS mario_users (
                        id VARCHAR(100) PRIMARY KEY,
                        username VARCHAR(100) UNIQUE NOT NULL,
                        email VARCHAR(150) UNIQUE NOT NULL,
                        password_hash VARCHAR(255) NOT NULL,
                        avatar VARCHAR(50) DEFAULT 'mario',
                        created_at VARCHAR(100)
                    );
                `);
                await connection.query(
                    `INSERT INTO mario_users (id, username, email, password_hash, avatar, created_at)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE username = VALUES(username), password_hash = VALUES(password_hash);`,
                    [
                        user.id || String(Date.now()),
                        user.username,
                        user.email,
                        user.passwordHash || user.password,
                        user.avatar || 'mario',
                        user.createdAt || new Date().toISOString()
                    ]
                );
            } finally {
                await connection.end();
            }
        }
    };

    // ==================== 3. MONGODB ATLAS ====================
    adapters.mongodb = {
        name: 'MongoDB Atlas',
        configured: configured('mongodb'),
        async ping() {
            const connect = async () => {
                const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
                try {
                    await client.connect();
                    await client.db().command({ ping: 1 });
                    return true;
                } finally {
                    await client.close();
                }
            };
            try {
                return await connect();
            } catch (error) {
                if (String(error.message).includes('querySrv') || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
                    dns.setServers(['1.1.1.1', '8.8.8.8']);
                    return await connect();
                }
                throw error;
            }
        },
        async saveUser(user) {
            const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
            try {
                await client.connect();
                const db = client.db();
                const usersCollection = db.collection('mario_users');
                await usersCollection.updateOne(
                    { email: user.email },
                    {
                        $set: {
                            id: user.id || String(Date.now()),
                            username: user.username,
                            email: user.email,
                            passwordHash: user.passwordHash || user.password,
                            avatar: user.avatar || 'mario',
                            createdAt: user.createdAt || new Date().toISOString(),
                            updatedAt: new Date()
                        }
                    },
                    { upsert: true }
                );
            } finally {
                await client.close();
            }
        }
    };

    // ==================== 4. REDIS / UPSTASH ====================
    adapters.redis = {
        name: 'Redis / Upstash',
        configured: configured('redis') && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        async ping() {
            const client = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN
            });
            return (await client.ping()) === 'PONG';
        },
        async saveUser(user) {
            const client = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN
            });
            await client.set(`user:${user.email}`, JSON.stringify(user));
        }
    };

    // ==================== 5. TURSO SQLITE ====================
    adapters.turso = {
        name: 'SQLite Cloud / Turso',
        configured: configured('turso') && Boolean(process.env.TURSO_AUTH_TOKEN),
        async ping() {
            const client = createTursoClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });
            const result = await client.execute('SELECT 1 AS ok');
            return result.rows[0].ok === 1;
        },
        async saveUser(user) {
            const client = createTursoClient({
                url: process.env.TURSO_DATABASE_URL,
                authToken: process.env.TURSO_AUTH_TOKEN
            });
            await client.execute(`
                CREATE TABLE IF NOT EXISTS mario_users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    avatar TEXT DEFAULT 'mario',
                    created_at TEXT
                );
            `);
            await client.execute({
                sql: `INSERT INTO mario_users (id, username, email, password_hash, avatar, created_at)
                      VALUES (?, ?, ?, ?, ?, ?)
                      ON CONFLICT(email) DO UPDATE SET username=excluded.username, password_hash=excluded.password_hash;`,
                args: [
                    user.id || String(Date.now()),
                    user.username,
                    user.email,
                    user.passwordHash || user.password,
                    user.avatar || 'mario',
                    user.createdAt || new Date().toISOString()
                ]
            });
        }
    };

    // ==================== 6. CASSANDRA / ASTRA DB ====================
    adapters.cassandra = {
        name: 'Cassandra / Astra DB',
        configured: configured('cassandra') && Boolean(process.env.ASTRA_DB_CLIENT_ID),
        async ping() {
            throw new Error('Configura ASTRA_DB_SECURE_CONNECT_BUNDLE para abrir Cassandra/Astra de forma segura.');
        }
    };

    return adapters;
}

// ==================== FUNCIÓN HELPER MULTICLOUD ====================
async function syncUserAllDatabases(user) {
    const adapters = createAdapters();
    const results = [];

    for (const [engineKey, adapter] of Object.entries(adapters)) {
        if (adapter.configured && typeof adapter.saveUser === 'function') {
            try {
                await adapter.saveUser(user);
                results.push({ engine: adapter.name, status: 'OK' });
            } catch (err) {
                console.error(`Error guardando en ${adapter.name}:`, err.message);
                results.push({ engine: adapter.name, status: 'ERROR', error: err.message });
            }
        }
    }
    return results;
}

module.exports = { createAdapters, syncUserAllDatabases, ENGINE_ENV };