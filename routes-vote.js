const express = require('express');

const foreign = require('./foreign');
const tokenUtils = require('./utils-token');
const models = require('./models');
const config = require('./config.json');

const l10nMsg = {
    'BALLOT_INFO_INCONSISTENT': '身份驗證方式衝突',
    'ALREADY_VOTED': '此人已經投過票',
    'TX_NOT_FOUND': '授權碼不存在或已使用過',
    'MISSING_TX': '未提供授權碼'
};

function logRequest(req, resp, level, content) {
    const clientId = (resp.locals.client || {}).id || null;
    return models.Log.log(level, req.route.path, content, clientId);
}

// check for a valid token and infer its corresponding client
function requestHook(req, resp, next) {
    const ret = resp.locals.ret = {
        ok: false,
        msg: null
    };
    let token = req.query.token;
    if (!token) {
        // token is not given in query
        ret.msg = 'Unauthorized';
        return resp.status(401).send(ret);
    }

    const authCode = tokenUtils.doHash(token);

    models.Client
    .find({ where: { auth_code: authCode } })
    .then(inst => {
        if (inst == null) {
            ret.msg = 'Invalid token';
            return resp.status(401).send(ret);
        }
        resp.locals.client = inst;
        next();
    });
}

// load overriding data
let overrideDict = {};
if (config.VOTE_ENABLE_OVERRIDE) {
    console.log('Loading overriding data...');
    overrideDict = require('./meta/region-override.json');
}

app = new express();

app.set('x-powered-by', false);
app.use(express.urlencoded({ extended: true }));

app.get('/ping', requestHook, (req, resp) => {
    resp.locals.client
    .set({ last_ping: models.db.fn('NOW', 3) })
    .save({ silent: true })
    .then(client => {
        return client.reload();
    })
    .then(client => {
        resp.json({
            ok: true,
            msg: null,
            client: client
        });
    })
    .catch(err => {
        resp.json({
            ok: false,
            msg: err.message
        });
    });
});

app.get('/query', requestHook, (req, resp, next) => {
    let ret = resp.locals.ret;
    let stuid = req.query.stuid;
    let bypass_serial = (req.query.bypass_serial == 'true' ||
                         (req.query.bypass_serial - 0) > 0);

    if (!stuid) {
        // stuid is required
        ret.msg = 'Access denied, meow :3';
        resp.status(400);
        return resp.json(ret);
    }

    // normalize the first letter (others are digits)
    stuid = stuid.toLowerCase();

    if (stuid.length != 9 || (!req.query.serial && !bypass_serial)) {
        // stuid should have exact length,
        // and either serial should be given or explicitly bypass it
        // the behavior of bypassing will be recorded!
        logRequest(req, resp, 'verbose',
            `invalid query, stuid [${stuid}], ` +
            `ser ${req.query.serial}, byp ${bypass_serial}`);

        ret.msg = 'Bad request, meow :3';
        resp.status(400);
        return resp.json(ret);
    }

    ret.can_vote = false;
    ret.tx = null;

    let requestChain;
    if (bypass_serial) {
        requestChain = foreign.query(stuid + '0')
        .then(result => {
            if (!result.error) {
                // case #1: guessed serial number is correct
                ret.serial = '0';
                return Promise.resolve(result);
            }
            const mat = result.error.match(/.+:(\d+)/);
            if (mat == null) {
                // case #2: other type of error; no need to try again
                ret.serial = null;
                return Promise.resolve(result);
            }
            // case #3: serial number is retrieved from foreign request
            ret.serial = mat[1];
            logRequest(req, resp, 'debug', `serial bypassing: ${stuid} => ${ret.serial}`);
            return foreign.query(stuid + ret.serial);
        });
    } else {
        // case #4: serial number is provided within request
        ret.serial = req.query.serial;
        requestChain = foreign.query(stuid + ret.serial);
    }

    // ret.serial is set to a valid serial or null in requestChain.then

    requestChain
    .then(result => {
        ret.ok = true;
        // check pre-condition by foreign response
        var isLegitIdent = result.webok && result.incampus;

        ret.result = result;
        logRequest(req, resp, 'debug', `recv result ${JSON.stringify(result)}`);

        // hide sensitive information from error message
        result.error = result.error.replace(/(.+?):\d+/, '$1:***');

        if (!isLegitIdent) {
            ret.msg = result.error;
            logRequest(req, resp, 'verbose', `is not legitimate: [${stuid}]: ${result.error}`);
            return Promise.resolve(null);
        }

        // if bypass then do not record its serial
        let recordedSerial = bypass_serial ? null : ret.serial;

        // retrieve ballot, check if consistent
        //   if do (or new), generate a new tx
        //         (not new and yet commited), leave intact
        //   if not, reject inconsistent state
        //   if commited, reject duplicates
        return models.Ballot.findOrBuild({
            where: { uid: stuid },
            defaults: {
                serial: recordedSerial,
                client_id: resp.locals.client.id,
                stutype: result.stutype,
                college: result.college,
                dept: result.dptcode,
                card_sec: req.query.card_sec
            }
        }).spread((ballot, inited) => {
            if (overrideDict.hasOwnProperty(stuid)) {
                // if found overriding, do override
                ballot.set('college', overrideDict[stuid]);
                result.college = overrideDict[stuid];
                // TODO: log!
            }

            if (inited) {
                // new
                ballot.tx = tokenUtils.generateTxString();
                return ballot.save();
            }

             // not new, check (1) consistency, (2) commited
            if (ballot.serial != recordedSerial ||
                ballot.client_id != resp.locals.client.id) {
                logRequest(req, resp, 'verbose', `ballot info inconsistent: ${ballot.uid}`);
                return Promise.reject(l10nMsg['BALLOT_INFO_INCONSISTENT']);
            }
            if (ballot.commit) {
                logRequest(req, resp, 'verbose', `already voted: ${ballot.uid}`);
                return Promise.reject(l10nMsg['ALREADY_VOTED']);
            }

            return Promise.resolve(ballot);
        });
    })
    .then(ballot => {
        // null if error
        if (ballot) {
            ret.can_vote = true;
            ret.tx = ballot.tx;
        }
        resp.json(ret);
    })
    .catch(err => (typeof err == 'string'), errStr => {
        // XXX, WTF String class
        ret.msg = errStr;
        resp.status(400).json({
            ok: false,
            msg: errStr,
            can_vote: false
        });
        return null;
    })
    .catch(err => {
        next(err);
    });
});

app.post('/commit', requestHook, (req, resp, next) => {
    let ret = resp.locals.ret;
    if (!req.body.tx) {
        ret.msg = l10nMsg['MISSING_TX'];
        return resp.status(400).json(ret);
    }

    models.Ballot.find({
        where: {
            tx: req.body.tx,
            client_id: resp.locals.client.id,
            commit: { [models.db.Op.not]: true }
        },
    }).then(ballot => {
        if (!ballot) {
            // tx
            ret.msg = l10nMsg['TX_NOT_FOUND'];
            logRequest(req, resp, 'verbose', `tx not found: ${req.body.tx}`);
            return Promise.reject(null);
        }
        // need refactoring
        return ballot.set('commit', true).save()
        .then(() => {
            ret.ok = true;
            resp.json(ret);
        });
    })
    .catch(e => e == null, () => {
        // do nothing to let everything pass through
        resp.status(403).json(ret);
    })
    .error(err => {
        next(err);
    });
});

app.use((err, req, resp, next) => {
    errMsg = app.get('debug') ? (err.message || err) : 'Internal server error QQ';
    models.Log.log('error', 'express-server', err.stack || err);

    let ret = {
        ok: false,
        msg: errMsg
    };

    // XXX: a track code can be added here to help recognizing log entry
    //      corresponding to client

    if (app.get('debug')) {
        ret.stacktrace = err.stack;
    }

    resp.status(500).json(ret);
});

module.exports = app;
