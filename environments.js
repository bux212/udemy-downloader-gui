const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

try {
    const envFile = fs.readFileSync(envPath, 'utf-8').toString();
    const envVars = envFile.split("\n");

    for (let index = 0; index < envVars.length; index++) {
        const el = envVars[index].split("=");
        if (el.length > 1) {
            process.env[el[0]] = el[1];
        }
    }
} catch (error) {
    console.warn('.env file not found or unreadable, skipping environment variable loading.');
}
