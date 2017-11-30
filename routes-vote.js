const express = require('express');

const foreign = require('./foreign');
const tokenUtils = require('./utils-token');
const models = require('./models');

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

app = new express();

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

app.get('/query', requestHook, (req, resp) => {
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
        // hide sensitive information from error message
        result.error.replace(/(.+):\d+/, '$1:***');

        if (!isLegitIdent) {
            ret.msg = result.error;
            return Promise.resolve(null);
        }

        let recordedSerial = bypass_serial ? null : ret.serial;

        // retrieve ballot, check if consistent
        //   if do (or new), generate a new tx
        //         (not new and yet commited), leave intact
        //   if not, reject inconstitent state
        //   if commited, reject duplicates
        return models.Ballot.findOrBuild({
            where: { uid: stuid },
            defaults: {
                serial: recordedSerial,
                client_id: resp.locals.client.id,
                card_sec: req.query.card_sec
            }
        }).spread((ballot, inited) => {
            if (inited) {
                // new
                ballot.tx = tokenUtils.generateTxString();
                return ballot.save();
            }

             // not new, check (1) consistency, (2) commited
            if (ballot.serial != recordedSerial ||
                ballot.client_id != resp.locals.client.id) {
                return Promise.reject('Ballot information is inconsistent');
            }
            if (ballot.commit) {
                return Promise.reject('Already voted, sorry');
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
    .catch(String, errStr => {
        // XXX, WTF String class
        ret.msg = errStr;
        resp.status(400).json(ret);
    });
});

app.post('/commit', requestHook, (req, resp) => {
    let ret = resp.locals.ret;
    if (!req.body.tx) {
        ret.msg = 'no tx';
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
            ret.msg = 'Tx does not exist or just disappeared, sorry';
            return Promise.reject(null);
        }
        // need refactoring
        return ballot.set('commit', true).save()
        .then(() => {
            ret.ok = true;
            resp.json(ret);
        });
    })
    .catch(null, () => {
        // do nothing to let everything pass through
        resp.status(403).json(ret);
    })
    .error(err => {
        ret.msg = err.message;
        resp.status(500).json(ret);
    });
});

module.exports = app;
