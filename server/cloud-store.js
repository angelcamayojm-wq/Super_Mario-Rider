async function createDocumentRepository(engine) {
    if (engine === 'mongodb') {
        const client = new MongoClient(process.env.MONGO_URI, { serverSelectionTimeoutMS: 7000 });
        await client.connect();

        // 🔧 FORZAMOS A USAR ÚNICAMENTE LA BASE DE DATOS 'mario_hub'
        const db = client.db('mario_hub');

        return {
            async findUser(identity) {
                const row = await db.collection('mario_users').findOne({
                    $or: [
                        { id: identity },
                        { email: new RegExp(`^${escape(identity)}$`, 'i') },
                        { username: new RegExp(`^${escape(identity)}$`, 'i') }
                    ]
                });
                return row && mapUser(row);
            },
            async insertUser(item) {
                // 🔒 VALIDACIÓN DE DUPLICADOS
                const existing = await db.collection('mario_users').findOne({
                    $or: [
                        { email: new RegExp(`^${escape(item.email)}$`, 'i') },
                        { username: new RegExp(`^${escape(item.username)}$`, 'i') }
                    ]
                });
                if (existing) {
                    throw new Error('El usuario o correo electrónico ya se encuentra registrado.');
                }
                await db.collection('mario_users').insertOne(item);
                return item;
            },
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