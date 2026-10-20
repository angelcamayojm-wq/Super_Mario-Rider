const { Pool } = require('pg');
const mysql = require('mysql2/promise');
const { MongoClient } = require('mongodb');
const admin = require('firebase-admin');
const { Redis } = require('@upstash/redis');
const { createClient: createTursoClient } = require('@libsql/client');
const cassandra = require('cassandra-driver');
const dns = require('dns').promises;

const ENGINE_ENV = {
    postgres: 'POSTGRES_URL',
    mysql: 'MYSQL_URL',
    mongodb: 'MONGO_URI',
    firebase: 'FIREBASE_SERVICE_ACCOUNT_KEY',
    redis: 'UPSTASH_REDIS_REST_URL',
    turso: 'TURSO_DATABASE_URL',
    cassandra: 'ASTRA_DB_TOKEN'
};

function configured(name) {
    return Boolean(process.env[ENGINE_ENV[name]]);
}

function createAdapters() {
    const adapters = {};
    adapters.postgres = {
        name: 'PostgreSQL / Neon',
        configured: configured('postgres'),
        async ping() {
            const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1 });
            const result = await pool.query('SELECT 1 AS ok');
            await pool.end();
            return result.rows[0].ok === 1;
        }
    };
    adapters.mysql = {
        name: 'MySQL / Aiven',
        configured: configured('mysql'),
        async ping() {
            const connection = await mysql.createConnection(process.env.MYSQL_URL);
            await connection.query('SELECT 1 AS ok');
            await connection.end();
            return true;
        }
    };
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
                if (error.code !== 'ECONNREFUSED' || !String(error.message).includes('querySrv')) throw error;
                dns.setServers(['1.1.1.1', '8.8.8.8']);
                return connect();
            }
        }
    };
    adapters.firebase = {
        name: 'Firebase Firestore',
        configured: configured('firebase'),
        async ping() {
            const credentialPath = require('path').resolve(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '');
            const fs = require('fs');
            if (!fs.existsSync(credentialPath)) {
                throw new Error('No se encontró FIREBASE_SERVICE_ACCOUNT_KEY en la ruta configurada.');
            }
            if (!admin.apps.length) {
                const serviceAccount = require(credentialPath);
                admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
            }
            await admin.firestore().listCollections();
            return true;
        }
    };
    adapters.redis = {
        name: 'Redis / Upstash',
        configured: configured('redis') && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
        async ping() {
            const client = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN
            });
            return (await client.ping()) === 'PONG';
        }
    };
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
        }
    };
    adapters.cassandra = {
        name: 'Cassandra / Astra DB',
        configured: configured('cassandra') && Boolean(process.env.ASTRA_DB_CLIENT_ID),
        async ping() {
            throw new Error('Configura ASTRA_DB_SECURE_CONNECT_BUNDLE para abrir Cassandra/Astra de forma segura.');
        }
    };
    return adapters;
}

module.exports = { createAdapters, ENGINE_ENV };
