const fs = require('fs');
const path = require('path');
const Promise = require('bluebird');
const express = require('express');
const morgan = require('morgan');

const models = require('./models');
const config = require('./config.json');

// require('request-debug')(rp);
const logDir = path.join(__dirname, 'log');
fs.existsSync(logDir) || fs.mkdirSync(logDir);

const app = new express();
app.set('port', 8080);
app.set('x-powered-by', false);
app.set('debug', process.env.NODE_ENV == 'dev');

if (!config.DEBUG) {
    const accessLogStream = fs.createWriteStream(
        path.join(logDir, 'access.log'), { flags: 'a' });
    app.use(morgan('combined', { stream: accessLogStream }));
}

app.get('/', (req, resp) => {
    resp.send('<h1>Hi :3</h1>');
});

app.get('/favicon.ico', (req, resp) => {
    resp.sendFile(__dirname + '/vote.png', {
        immutable: true
    });
});

/* *** *** main logic happens here *** *** */
app.use('/', require('./routes-vote'));
/* *** *** main logic    ends here *** *** */

app.use((err, req, resp, next) => {
    console.log(app.get('debug'));
    errMsg = app.get('debug') ? err : 'Internal server error QQ';
    // TODO: add trace code to allow future diagonstics
    resp.json({
        ok: false,
        msg: errMsg
    });
});

models.db.sync().then(() => {
    app.listen(app.get('port'), () => {
        console.log('Server started...');
    });
});
