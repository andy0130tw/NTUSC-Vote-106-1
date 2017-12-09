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

app.set('port', process.env.NODE_PORT || 8080);
app.set('x-powered-by', false);
app.set('debug', app.get('env') == 'development');

// access log -- on-screen & in log file
app.use(morgan('dev'));
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
    const statusCode = 500;
    resp.status(statusCode)
        .write(`<h1>Internal server error (${statusCode})</h1>`);
    if (app.get('debug')) {
        resp.write(`<pre>${(err.stack || err)}</pre>`);
    }
    resp.end();
});

// 404
app.use((req, resp) => {
    const statusCode = 404;
    resp.status(statusCode)
        .write(`<h1>Not found (${statusCode})</h1>`);
    resp.end();
});

models.db.sync().then(() => {
    const port = app.get('port');
    app.listen(port, () => {
        console.log(`Server listening on port ${port}...`);
    });
});
