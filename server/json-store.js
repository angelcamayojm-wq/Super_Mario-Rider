const fs = require('fs');
const path = require('path');

class JsonStore {
    constructor(file = path.join(__dirname, '..', 'data', 'mario-hub.json')) {
        this.file = file;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (!fs.existsSync(file)) {
            fs.writeFileSync(file, JSON.stringify({
                users: [], scores: [], favorites: [], achievements: [], sessions: [], resetCodes: []
            }, null, 2));
        }
        this.data = JSON.parse(fs.readFileSync(file, 'utf8'));
    }

    save() {
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
    }

    collection(name) {
        if (!Array.isArray(this.data[name])) this.data[name] = [];
        return this.data[name];
    }

    insert(name, value) {
        const item = { id: value.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`, ...value };
        this.collection(name).push(item);
        this.save();
        return item;
    }
}

module.exports = JsonStore;
